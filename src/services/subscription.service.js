/**
 * Subscription Upgrade Engine.
 *
 * A user's `subscriptionStatus` is NONE | ACTIVE | EXPIRED. Choosing a plan and
 * entering the access key (ACCESS_KEY, default "OPEN-ME") activates it while real
 * payments aren't live: status ACTIVE, an expiry date, and role BEAUTICIAN.
 * An ACTIVE plan past its expiry flips to EXPIRED the next time the user is loaded.
 */
const crypto = require('node:crypto');
const config = require('../config');
const plans = require('../data/plans.json');
const { Transaction } = require('../models');
const { HttpError } = require('../utils/httpError');

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function findPlan(planId) {
  const plan = plans.find((p) => p.id === planId);
  if (!plan) throw new HttpError(400, `Unknown plan "${planId}"`, 'INVALID_PLAN');
  return plan;
}

function hasBeauticianAccess(user) {
  return (
    user.role === 'BEAUTICIAN' &&
    user.subscriptionStatus === 'ACTIVE' &&
    Boolean(user.subscription) &&
    new Date(user.subscription.expiresAt) > new Date()
  );
}

/** Lazily expire a lapsed plan. Saves only when something changed. */
async function refreshStatus(user) {
  if (user.subscriptionStatus === 'ACTIVE' && user.subscription && new Date(user.subscription.expiresAt) <= new Date()) {
    user.subscriptionStatus = 'EXPIRED';
    await user.save();
  }
  return user;
}

/** Case-insensitive, constant-time comparison with the configured key. */
function accessKeyMatches(input) {
  const given = Buffer.from(String(input ?? '').trim().toUpperCase());
  const expected = Buffer.from(config.accessKey.trim().toUpperCase());
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Activate (or extend) a plan with the access key. Renewing while still ACTIVE
 * stacks the new period on top of the current expiry.
 */
async function activateWithKey(user, { planId, accessKey } = {}) {
  if (!planId) throw new HttpError(400, 'Choose a plan', 'VALIDATION_ERROR');
  const plan = findPlan(planId);
  if (!accessKey || !String(accessKey).trim()) {
    throw new HttpError(400, 'Enter your access key', 'VALIDATION_ERROR', { fields: { accessKey: 'Enter your access key' } });
  }
  if (!accessKeyMatches(accessKey)) {
    throw new HttpError(403, "That access key isn't valid. Check it and try again.", 'INVALID_ACCESS_KEY', {
      fields: { accessKey: 'Invalid access key' },
    });
  }

  await refreshStatus(user);
  const now = new Date();
  const current = user.subscription;
  const isExtending = user.subscriptionStatus === 'ACTIVE' && current;
  const periodStart = isExtending ? new Date(current.expiresAt) : now;

  user.role = 'BEAUTICIAN';
  user.subscriptionStatus = 'ACTIVE';
  user.subscription = {
    planId: plan.id,
    startedAt: isExtending ? current.startedAt : now,
    renewedAt: current ? now : undefined,
    expiresAt: addMonths(periodStart, plan.durationMonths),
  };
  await user.save();

  const transaction = await Transaction.create({
    user: user._id,
    planId: plan.id,
    amount: plan.price,
    amountCharged: 0,
    currency: plan.currency,
    method: 'ACCESS_KEY',
    status: 'WAIVED',
  });

  return { user, transaction, plan };
}

module.exports = { plans, findPlan, hasBeauticianAccess, refreshStatus, activateWithKey };
