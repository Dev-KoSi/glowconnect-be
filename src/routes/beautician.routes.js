const { Router } = require('express');
const { requireActiveSubscription } = require('../middleware/requireActiveSubscription');
const { createService, listServicesFor } = require('../services/listing.service');
const { listBeauticianRequests, countRequests } = require('../services/booking.service');
const { toPublicUser } = require('../services/user.service');
const { asyncHandler } = require('../utils/asyncHandler');

const router = Router();

// Everything below requires an ACTIVE beautician subscription.
router.use(requireActiveSubscription);

router.get('/dashboard', asyncHandler(async (req, res) => {
  const [services, counts] = await Promise.all([listServicesFor(req.user), countRequests(req.user._id)]);
  res.json({
    user: toPublicUser(req.user),
    stats: { listings: services.length, pendingRequests: counts.pending, approvedBookings: counts.approved },
    services,
  });
}));

// Publish a new listing: { title, price, category, imageUrl?, description?, durationMins?, location? }
router.post('/services', asyncHandler(async (req, res) => {
  res.status(201).json({ service: await createService(req.user, req.body) });
}));

// Incoming booking requests. PENDING by default; ?status=ALL|APPROVED|DECLINED to widen.
router.get('/requests', asyncHandler(async (req, res) => {
  res.json({ requests: await listBeauticianRequests(req.user._id, req.query.status) });
}));

module.exports = router;
