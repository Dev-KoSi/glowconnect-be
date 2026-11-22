/**
 * Gate for beautician-only routes. Responds 402 with a machine-readable code
 * so the frontend can show either an upgrade or a renewal prompt.
 */
const { hasBeauticianAccess } = require('../services/subscription.service');
const { HttpError } = require('../utils/httpError');

function requireActiveSubscription(req, _res, next) {
  const user = req.user;
  if (!user) return next(new HttpError(401, 'Please sign in to continue', 'UNAUTHENTICATED'));
  if (hasBeauticianAccess(user)) return next();

  const expired = user.subscriptionStatus === 'EXPIRED';
  next(
    new HttpError(
      402,
      expired
        ? 'Your beautician subscription has expired. Renew to unlock the portal.'
        : 'Choose a plan to unlock the Beautician Portal.',
      expired ? 'SUBSCRIPTION_EXPIRED' : 'SUBSCRIPTION_REQUIRED',
      { subscriptionStatus: user.subscriptionStatus, renewPath: '/plans' },
    ),
  );
}

module.exports = { requireActiveSubscription };
