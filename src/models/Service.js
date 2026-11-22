const { Schema, model } = require('mongoose');

const CATEGORIES = ['Hair', 'Makeup', 'Nails', 'Lashes & Brows', 'Skincare', 'Barbering', 'Other'];

const serviceSchema = new Schema(
  {
    beautician: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
    category: { type: String, enum: CATEGORIES, required: true },
    price: { type: Number, required: true, min: 1, max: 50000 },
    currency: { type: String, default: 'GHS' },
    durationMins: { type: Number, default: 60, min: 15, max: 720 },
    description: { type: String, default: '', maxlength: 1000 },
    imageUrl: { type: String, default: '' },
    rating: { type: Number, default: null },
    reviewCount: { type: Number, default: 0 },
    location: { type: String, default: '', maxlength: 80 },
    isSample: { type: Boolean, default: false },
  },
  { timestamps: true },
);

serviceSchema.index({ createdAt: -1 });

module.exports = model('Service', serviceSchema);
module.exports.CATEGORIES = CATEGORIES;
