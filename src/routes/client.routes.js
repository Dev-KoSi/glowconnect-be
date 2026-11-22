const { Router } = require('express');
const { requireUser } = require('../middleware/auth');
const { listClientBookings } = require('../services/booking.service');
const { asyncHandler } = require('../utils/asyncHandler');

const router = Router();

router.get('/bookings', requireUser, asyncHandler(async (req, res) => {
  res.json({ bookings: await listClientBookings(req.user._id) });
}));

module.exports = router;
