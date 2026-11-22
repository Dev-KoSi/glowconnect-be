/**
 * Booking Engine: clients request appointments on listings; the owning
 * beautician approves or declines PENDING requests.
 */
const { isValidObjectId } = require('mongoose');
const { Booking } = require('../models');
const { HttpError } = require('../utils/httpError');
const { findActiveService } = require('./listing.service');

const BOOKING_STATUS = Object.freeze({ PENDING: 'PENDING', APPROVED: 'APPROVED', DECLINED: 'DECLINED' });
const DECISIONS = [BOOKING_STATUS.APPROVED, BOOKING_STATUS.DECLINED];

const withPeople = (query) => query.populate('client', 'username email').populate('beautician', 'username');

/** Shape returned to the frontend (service/beautician/client summaries included). */
function toPublicBooking(b) {
  return {
    id: String(b._id),
    serviceId: String(b.service),
    clientId: String(b.client?._id ?? b.client),
    beauticianId: String(b.beautician?._id ?? b.beautician),
    requestedAt: b.requestedAt.toISOString(),
    note: b.note,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    service: { id: String(b.service), ...b.serviceSnapshot },
    beautician: b.beautician?.username ? { id: String(b.beautician._id), name: b.beautician.username } : undefined,
    client: b.client?.username ? { id: String(b.client._id), name: b.client.username, email: b.client.email } : undefined,
  };
}

async function createBooking(client, input = {}) {
  const { serviceId, requestedAt, note } = input;
  if (!serviceId) throw new HttpError(400, 'serviceId is required', 'VALIDATION_ERROR');

  const service = await findActiveService(serviceId);
  if (service.isSample) {
    throw new HttpError(400, 'This is a sample listing and can’t be booked.', 'SAMPLE_LISTING');
  }
  if (String(service.beautician._id) === String(client._id)) {
    throw new HttpError(400, 'You cannot book your own service', 'OWN_SERVICE');
  }

  const when = new Date(requestedAt);
  if (!requestedAt || Number.isNaN(when.getTime())) {
    throw new HttpError(400, 'requestedAt must be a valid date-time', 'VALIDATION_ERROR', {
      fields: { requestedAt: 'Pick a date and time' },
    });
  }
  if (when <= new Date()) {
    throw new HttpError(400, 'Appointment time must be in the future', 'VALIDATION_ERROR', {
      fields: { requestedAt: 'Pick a future date and time' },
    });
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
    throw new HttpError(400, 'note must be a string of at most 500 characters', 'VALIDATION_ERROR');
  }

  const booking = await Booking.create({
    service: service._id,
    client: client._id,
    beautician: service.beautician._id,
    requestedAt: when,
    note: note?.trim() ?? '',
    serviceSnapshot: {
      title: service.title,
      category: service.category,
      price: service.price,
      currency: service.currency,
      durationMins: service.durationMins,
      imageUrl: service.imageUrl,
    },
  });
  return toPublicBooking(await withPeople(Booking.findById(booking._id)).lean());
}

async function listClientBookings(clientId) {
  const docs = await withPeople(Booking.find({ client: clientId }).sort({ createdAt: -1 })).lean();
  return docs.map(toPublicBooking);
}

/** Incoming requests for a beautician; PENDING only unless `status` is given ('ALL' for everything). */
async function listBeauticianRequests(beauticianId, status = BOOKING_STATUS.PENDING) {
  const wanted = String(status).toUpperCase();
  if (wanted !== 'ALL' && !Object.values(BOOKING_STATUS).includes(wanted)) {
    throw new HttpError(400, 'status must be PENDING, APPROVED, DECLINED or ALL', 'VALIDATION_ERROR');
  }
  const query = { beautician: beauticianId, ...(wanted === 'ALL' ? {} : { status: wanted }) };
  const docs = await withPeople(Booking.find(query).sort({ createdAt: -1 })).lean();
  return docs.map(toPublicBooking);
}

async function countRequests(beauticianId) {
  const rows = await Booking.aggregate([{ $match: { beautician: beauticianId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  return { pending: by.PENDING ?? 0, approved: by.APPROVED ?? 0, declined: by.DECLINED ?? 0 };
}

async function updateBookingStatus(beautician, bookingId, status) {
  const notFound = new HttpError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
  if (!isValidObjectId(bookingId)) throw notFound;
  const booking = await Booking.findById(bookingId);
  if (!booking) throw notFound;
  if (String(booking.beautician) !== String(beautician._id)) {
    throw new HttpError(403, 'This booking is for another beautician', 'FORBIDDEN');
  }
  if (!DECISIONS.includes(status)) {
    throw new HttpError(400, 'status must be APPROVED or DECLINED', 'VALIDATION_ERROR');
  }
  if (booking.status !== BOOKING_STATUS.PENDING) {
    throw new HttpError(409, `Booking was already ${booking.status.toLowerCase()}`, 'BOOKING_ALREADY_DECIDED');
  }

  booking.status = status;
  booking.decidedAt = new Date();
  await booking.save();
  return toPublicBooking(await withPeople(Booking.findById(booking._id)).lean());
}

module.exports = {
  BOOKING_STATUS,
  createBooking,
  listClientBookings,
  listBeauticianRequests,
  countRequests,
  updateBookingStatus,
};
