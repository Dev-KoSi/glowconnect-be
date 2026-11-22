const { Schema, model } = require('mongoose');

/**
 * Pending one-time email codes (one per email + purpose). Only a keyed hash of
 * the code is stored; MongoDB removes expired codes automatically (TTL index).
 */
const otpCodeSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: ['signup', 'login'], required: true },
    codeHash: { type: String, required: true },
    /** Chosen username, carried from signup start to verify. */
    username: { type: String },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

otpCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = model('OtpCode', otpCodeSchema);
