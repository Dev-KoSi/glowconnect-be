const { Router } = require('express');
const { requireUser } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/requireActiveSubscription');
const { createBooking, updateBookingStatus } = require('../services/booking.service');
const { asyncHandler } = require('../utils/asyncHandler');

const router = Router();

// Any signed-in user can request an appointment: { serviceId, requestedAt (ISO), note? } → PENDING
router.post('/create', requireUser, asyncHandler(async (req, res) => {
  res.status(201).json({ booking: await createBooking(req.user, req.body) });
}));

// Owning beautician decides: { status: 'APPROVED' | 'DECLINED' }
router.patch('/:id/status', requireActiveSubscription, asyncHandler(async (req, res) => {
  res.json({ booking: await updateBookingStatus(req.user, req.params.id, req.body?.status) });
}));

module.exports = router;
