const { Schema, model } = require('mongoose');

/** Copy of the listing at booking time, so later edits don't rewrite past bookings. */
const snapshotSchema = new Schema(
  {
    title: String,
    category: String,
    price: Number,
    currency: String,
    durationMins: Number,
    imageUrl: String,
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    service: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    client: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    beautician: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, required: true },
    note: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'DECLINED'], default: 'PENDING' },
    decidedAt: { type: Date },
    serviceSnapshot: { type: snapshotSchema, required: true },
  },
  { timestamps: true },
);

bookingSchema.index({ client: 1, createdAt: -1 });
bookingSchema.index({ beautician: 1, status: 1, createdAt: -1 });

module.exports = model('Booking', bookingSchema);
