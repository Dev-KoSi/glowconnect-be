const { Schema, model } = require('mongoose');

/** Plan activations. While payments aren't live, method is ACCESS_KEY and nothing is charged. */
const transactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: String, required: true },
    amount: { type: Number, required: true },
    amountCharged: { type: Number, default: 0 },
    currency: { type: String, default: 'GHS' },
    method: { type: String, enum: ['ACCESS_KEY'], required: true },
    status: { type: String, enum: ['WAIVED', 'PAID'], required: true },
  },
  { timestamps: true },
);

module.exports = model('Transaction', transactionSchema);
