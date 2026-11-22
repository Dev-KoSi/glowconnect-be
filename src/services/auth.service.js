/**
 * Passwordless accounts with email verification codes.
 *
 * Sign up: username + email → 6-digit code emailed → code verified → account created.
 * Sign in: email → code emailed → code verified → session.
 *
 * Codes are random, expire after a few minutes, allow limited attempts and are
 * stored only as an HMAC. Sessions are random tokens in an httpOnly cookie;
 * only their SHA-256 hash is stored.
 */
const crypto = require('node:crypto');
const config = require('../config');
const { User, OtpCode, Session } = require('../models');
const { HttpError } = require('../utils/httpError');
const { sendMail, isConsoleMode } = require('./mailer');
const { codeEmail } = require('./emails');

const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_RE = /^\d{6}$/;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (value) => crypto.createHmac('sha256', config.authSecret).update(value).digest('hex');
const codeHash = (purpose, email, code) => hmac(`${purpose}:${email}:${code}`);

function normalizeEmail(email) {
  const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(value) || value.length > 254) {
    throw new HttpError(400, 'Enter a valid email address', 'VALIDATION_ERROR', { fields: { email: 'Enter a valid email address' } });
  }
  return value;
}

function normalizeUsername(username) {
  const value = typeof username === 'string' ? username.trim() : '';
  if (!USERNAME_RE.test(value)) {
    const msg = 'Use 3-20 letters, numbers, dots or underscores';
    throw new HttpError(400, msg, 'VALIDATION_ERROR', { fields: { username: msg } });
  }
  return value;
}

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Create (or replace) the pending code for this email + purpose and email it. */
async function issueCode({ email, purpose, username }) {
  const existing = await OtpCode.findOne({ email, purpose });
  if (existing && existing.username === username) {
    const waitMs = existing.sentAt.getTime() + config.otp.resendSeconds * 1000 - Date.now();
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      throw new HttpError(429, `Please wait ${seconds}s before requesting another code`, 'CODE_RECENTLY_SENT', {
        retryAfterSeconds: seconds,
      });
    }
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date();
  await OtpCode.findOneAndUpdate(
    { email, purpose },
    {
      codeHash: codeHash(purpose, email, code),
      username,
      attempts: 0,
      sentAt: now,
      expiresAt: new Date(now.getTime() + config.otp.ttlMinutes * 60_000),
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  try {
    await sendMail({ to: email, ...codeEmail({ code, purpose, username }) });
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    await OtpCode.deleteOne({ email, purpose });
    throw new HttpError(502, "We couldn't send the email right now. Please try again shortly.", 'EMAIL_FAILED');
  }

  return {
    email,
    expiresInSeconds: config.otp.ttlMinutes * 60,
    resendInSeconds: config.otp.resendSeconds,
    // Development convenience only: when no SMTP server is configured the code
    // can't reach an inbox, so hand it to the UI. Never in production.
    ...(isConsoleMode() && !config.isProduction ? { devCode: code } : {}),
  };
}

/** Check a code; on success the pending code is deleted and returned. */
async function consumeCode({ email, purpose, code }) {
  const value = typeof code === 'string' ? code.trim() : '';
  if (!CODE_RE.test(value)) {
    throw new HttpError(400, 'Enter the 6-digit code from your email', 'VALIDATION_ERROR', {
      fields: { code: 'Enter the 6-digit code' },
    });
  }

  const pending = await OtpCode.findOne({ email, purpose });
  if (!pending || pending.expiresAt <= new Date()) {
    if (pending) await pending.deleteOne();
    throw new HttpError(400, 'This code has expired or was never requested. Send a new one.', 'CODE_EXPIRED');
  }

  if (!safeEqual(codeHash(purpose, email, value), pending.codeHash)) {
    pending.attempts += 1;
    const left = config.otp.maxAttempts - pending.attempts;
    if (left <= 0) {
      await pending.deleteOne();
      throw new HttpError(429, 'Too many wrong codes. Request a new code to try again.', 'TOO_MANY_ATTEMPTS');
    }
    await pending.save();
    throw new HttpError(400, `That code isn't right. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`, 'INVALID_CODE', {
      attemptsLeft: left,
    });
  }

  await pending.deleteOne();
  return pending;
}

async function assertAvailable({ email, username }) {
  if (await User.exists({ email })) {
    throw new HttpError(409, 'An account with this email already exists. Sign in instead.', 'EMAIL_TAKEN', {
      fields: { email: 'This email is already registered' },
    });
  }
  if (username && (await User.exists({ usernameKey: username.toLowerCase() }))) {
    throw new HttpError(409, 'That username is taken. Try another.', 'USERNAME_TAKEN', {
      fields: { username: 'This username is taken' },
    });
  }
}

async function startSignup(input = {}) {
  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);
  await assertAvailable({ email, username });
  return issueCode({ email, purpose: 'signup', username });
}

async function verifySignup(input = {}) {
  const email = normalizeEmail(input.email);
  const pending = await consumeCode({ email, purpose: 'signup', code: input.code });
  await assertAvailable({ email, username: pending.username });
  try {
    return await User.create({
      username: pending.username,
      email,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'That email or username was just taken. Try again.', 'DUPLICATE');
    throw err;
  }
}

async function startLogin(input = {}) {
  const email = normalizeEmail(input.email);
  const user = await User.findOne({ email, isSample: false });
  if (!user) {
    throw new HttpError(404, 'No account uses this email. Create one instead.', 'ACCOUNT_NOT_FOUND', {
      fields: { email: 'No account found for this email' },
    });
  }
  return issueCode({ email, purpose: 'login', username: user.username });
}

async function verifyLogin(input = {}) {
  const email = normalizeEmail(input.email);
  await consumeCode({ email, purpose: 'login', code: input.code });
  const user = await User.findOne({ email, isSample: false });
  if (!user) throw new HttpError(404, 'No account uses this email.', 'ACCOUNT_NOT_FOUND');
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

async function resendCode(input = {}) {
  const email = normalizeEmail(input.email);
  const purpose = input.purpose === 'login' ? 'login' : 'signup';
  const pending = await OtpCode.findOne({ email, purpose });
  if (!pending) {
    throw new HttpError(400, 'Start again to get a new code.', 'NO_PENDING_CODE');
  }
  return issueCode({ email, purpose, username: pending.username });
}

// ---------- Sessions ----------

async function createSession(user, userAgent = '') {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.session.days * 86_400_000);
  await Session.create({ tokenHash: sha256(token), user: user._id, expiresAt, userAgent: userAgent.slice(0, 200) });
  return { token, expiresAt };
}

async function findSessionUser(token) {
  if (!token) return null;
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).populate('user');
  return session?.user ?? null;
}

async function destroySession(token) {
  if (token) await Session.deleteOne({ tokenHash: sha256(token) });
}

module.exports = {
  startSignup,
  verifySignup,
  startLogin,
  verifyLogin,
  resendCode,
  createSession,
  findSessionUser,
  destroySession,
};
