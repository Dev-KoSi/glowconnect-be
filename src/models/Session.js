const { Schema, model } = require('mongoose');

/**
 * Login sessions. The browser holds a random token in an httpOnly cookie;
 * only its SHA-256 hash is stored here. MongoDB deletes expired sessions (TTL index).
 */
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = model('Session', sessionSchema);
