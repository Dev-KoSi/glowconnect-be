const { Router } = require('express');
const { requireUser } = require('../middleware/auth');
const { accessKeyLimiter } = require('../middleware/rateLimit');
const { activateWithKey } = require('../services/subscription.service');
const { toPublicUser } = require('../services/user.service');
const { asyncHandler } = require('../utils/asyncHandler');

const router = Router();

router.get('/profile', requireUser, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

// { planId, accessKey } → plan ACTIVE, new expiry, role BEAUTICIAN
router.post('/subscribe', requireUser, accessKeyLimiter, asyncHandler(async (req, res) => {
  const { user, transaction, plan } = await activateWithKey(req.user, req.body);
  res.status(201).json({
    user: toPublicUser(user),
    transaction: {
      id: String(transaction._id),
      planId: plan.id,
      amount: transaction.amount,
      amountCharged: transaction.amountCharged,
      currency: transaction.currency,
      method: transaction.method,
      status: transaction.status,
      createdAt: transaction.createdAt.toISOString(),
    },
  });
}));

module.exports = router;
