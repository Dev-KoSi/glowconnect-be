/**
 * Beauty service listings. Only listings whose owner has an ACTIVE, unexpired
 * subscription appear in the public marketplace.
 */
const { isValidObjectId } = require('mongoose');
const { fallbackImageFor } = require('../data/images');
const { Service, User } = require('../models');
const { CATEGORIES } = require('../models/Service');
const { HttpError } = require('../utils/httpError');
const { hasBeauticianAccess } = require('./subscription.service');

function toPublicService(doc, beauticianName) {
  const ownerId = doc.beautician?._id ?? doc.beautician;
  return {
    id: String(doc._id),
    beauticianId: String(ownerId),
    beauticianName: beauticianName ?? doc.beautician?.username ?? 'Unknown',
    title: doc.title,
    category: doc.category,
    price: doc.price,
    currency: doc.currency,
    durationMins: doc.durationMins,
    description: doc.description,
    imageUrl: doc.imageUrl,
    rating: doc.rating ?? null,
    reviewCount: doc.reviewCount ?? 0,
    location: doc.location,
    isSample: Boolean(doc.isSample),
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

/** Beauticians whose plan is currently active. */
function activeBeauticians() {
  return User.find(
    { role: 'BEAUTICIAN', subscriptionStatus: 'ACTIVE', 'subscription.expiresAt': { $gt: new Date() } },
    { username: 1 },
  ).lean();
}

/** Public marketplace: newest first, optional category filter. */
async function listActiveServices({ category } = {}) {
  const owners = await activeBeauticians();
  const names = new Map(owners.map((o) => [String(o._id), o.username]));
  const query = { beautician: { $in: owners.map((o) => o._id) } };
  if (category && CATEGORIES.includes(category)) query.category = category;
  const docs = await Service.find(query).sort({ createdAt: -1 }).lean();
  return docs.map((d) => toPublicService(d, names.get(String(d.beautician))));
}

/** A bookable listing (its owner must have an active plan). Returns the populated document. */
async function findActiveService(serviceId) {
  const notFound = new HttpError(404, 'Service not found or no longer available', 'SERVICE_NOT_FOUND');
  if (!isValidObjectId(serviceId)) throw notFound;
  const service = await Service.findById(serviceId).populate('beautician');
  if (!service || !service.beautician || !hasBeauticianAccess(service.beautician)) throw notFound;
  return service;
}

async function listServicesFor(beautician) {
  const docs = await Service.find({ beautician: beautician._id }).sort({ createdAt: -1 }).lean();
  return docs.map((d) => toPublicService(d, beautician.username));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

async function createService(beautician, input = {}) {
  const errors = {};
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';
  const location = typeof input.location === 'string' ? input.location.trim() : '';
  const price = Number(input.price);
  const durationMins = input.durationMins === undefined ? 60 : Number(input.durationMins);

  if (title.length < 3 || title.length > 80) errors.title = 'Title must be 3-80 characters';
  if (!CATEGORIES.includes(category)) errors.category = `Category must be one of: ${CATEGORIES.join(', ')}`;
  if (!Number.isFinite(price) || price <= 0 || price > 50000) errors.price = 'Price must be between GH₵1 and GH₵50,000';
  if (!Number.isInteger(durationMins) || durationMins < 15 || durationMins > 720)
    errors.durationMins = 'Duration must be 15-720 minutes';
  if (description.length > 1000) errors.description = 'Description must be at most 1000 characters';
  if (location.length > 80) errors.location = 'Location must be at most 80 characters';
  if (imageUrl && !isHttpUrl(imageUrl)) errors.imageUrl = 'imageUrl must be an http(s) URL';

  if (Object.keys(errors).length) {
    throw new HttpError(400, 'Invalid service details', 'VALIDATION_ERROR', { fields: errors });
  }

  const service = await Service.create({
    beautician: beautician._id,
    title,
    category,
    price: Math.round(price * 100) / 100,
    currency: 'GHS',
    durationMins,
    description,
    imageUrl: imageUrl || fallbackImageFor(category),
    location,
  });
  return toPublicService(service.toObject(), beautician.username);
}

module.exports = { CATEGORIES, toPublicService, listActiveServices, findActiveService, listServicesFor, createService };
