const { Schema, model } = require('mongoose');

const subscriptionSchema = new Schema(
  {
    planId: { type: String, enum: ['monthly', 'six_month', 'yearly'], required: true },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    renewedAt: { type: Date },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 3, maxlength: 20 },
    /** Lower-cased username, so "Ama_B" and "ama_b" can't both exist. */
    usernameKey: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ['CLIENT', 'BEAUTICIAN'], default: 'CLIENT' },
    subscriptionStatus: { type: String, enum: ['NONE', 'ACTIVE', 'EXPIRED'], default: 'NONE' },
    subscription: { type: subscriptionSchema, default: null },
    emailVerifiedAt: { type: Date },
    lastLoginAt: { type: Date },
    /** Placeholder beauticians created by the sample-data seeder; they can't sign in. */
    isSample: { type: Boolean, default: false },
  },
  { timestamps: true },
);

userSchema.pre('validate', function setUsernameKey(next) {
  if (this.username) this.usernameKey = this.username.toLowerCase();
  next();
});

userSchema.index({ role: 1, subscriptionStatus: 1, 'subscription.expiresAt': 1 });

module.exports = model('User', userSchema);
