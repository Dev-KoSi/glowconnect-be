const { hasBeauticianAccess } = require('./subscription.service');

/** Shape returned to the frontend, with derived access flags. */
function toPublicUser(user) {
  const sub = user.subscription;
  const active = user.subscriptionStatus === 'ACTIVE' && sub;
  const msLeft = active ? new Date(sub.expiresAt) - Date.now() : 0;
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    role: user.role,
    subscriptionStatus: user.subscriptionStatus,
    subscription: sub
      ? {
          planId: sub.planId,
          startedAt: sub.startedAt.toISOString(),
          expiresAt: sub.expiresAt.toISOString(),
          ...(sub.renewedAt ? { renewedAt: sub.renewedAt.toISOString() } : {}),
        }
      : null,
    beauticianAccess: hasBeauticianAccess(user),
    daysRemaining: active ? Math.max(0, Math.ceil(msLeft / 86_400_000)) : 0,
    createdAt: user.createdAt?.toISOString(),
  };
}

module.exports = { toPublicUser };
