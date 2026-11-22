/**
 * Showcase listings so the marketplace isn't empty for presentations.
 *
 * The services are real, bookable listings. Their beauticians are placeholder
 * profiles (isSample) that can't sign in, so bookings on them stay PENDING.
 *
 * Seeding is safe to re-run: missing listings are added, existing ones are left
 * alone, and the placeholder beauticians' plans are renewed for another year.
 */
const { User, Service } = require('../models');
const { IMAGES } = require('./images');

const BEAUTICIANS = {
  akosua_glam: 'East Legon, Accra',
  ewurabena_beauty: 'Labone, Accra',
  efua_hair: 'Osu, Accra',
  adwoa_braids: 'Mobile · comes to you in Accra',
  abena_nails: 'Airport Residential, Accra',
  yaa_nailstudio: 'Adum, Kumasi',
  serwaa_spa: 'Spintex, Accra',
};

const SHOWCASE = [
  {
    beautician: 'akosua_glam',
    title: 'Bridal Glam Makeup',
    category: 'Makeup',
    price: 1200,
    durationMins: 150,
    description: 'Long-wear bridal glam with lashes, a trial consultation and a touch-up kit for the reception.',
    imageUrl: IMAGES.glamMakeup,
    rating: 4.9,
    reviewCount: 128,
  },
  {
    beautician: 'ewurabena_beauty',
    title: 'Soft Glam for Events',
    category: 'Makeup',
    price: 450,
    durationMins: 75,
    description: 'Fresh, glowing soft glam for birthdays, outdoorings, church and dinners. Lashes included.',
    imageUrl: IMAGES.makeupKit,
    rating: 4.8,
    reviewCount: 76,
  },
  {
    beautician: 'ewurabena_beauty',
    title: 'Lash Lift & Brow Shaping',
    category: 'Lashes & Brows',
    price: 220,
    durationMins: 60,
    description: 'Natural lash lift and tint with brow mapping, shaping and tint for a polished everyday look.',
    imageUrl: IMAGES.brushes,
    rating: 4.9,
    reviewCount: 57,
  },
  {
    beautician: 'efua_hair',
    title: 'Luxury Silk Press',
    category: 'Hair',
    price: 400,
    durationMins: 120,
    description: 'Deep-conditioning wash, heat protection and a glossy, bouncy silk press that lasts.',
    imageUrl: IMAGES.blowDry,
    rating: 4.8,
    reviewCount: 94,
  },
  {
    beautician: 'efua_hair',
    title: 'Wash, Treatment & Blow-out',
    category: 'Hair',
    price: 250,
    durationMins: 75,
    description: 'Clarifying wash, moisture treatment and a smooth blow-out. Great between protective styles.',
    imageUrl: IMAGES.longHair,
    rating: 4.7,
    reviewCount: 51,
  },
  {
    beautician: 'adwoa_braids',
    title: 'Knotless Braids (Mid-back)',
    category: 'Hair',
    price: 850,
    durationMins: 300,
    description: 'Lightweight, tension-free knotless braids, mid-back length. Hair extensions included.',
    imageUrl: IMAGES.naturalHair,
    rating: 5.0,
    reviewCount: 63,
  },
  {
    beautician: 'abena_nails',
    title: 'Gel Nail Art & Pedicure',
    category: 'Nails',
    price: 280,
    durationMins: 75,
    description: 'Long-wear gel manicure with custom nail art, plus a relaxing spa pedicure.',
    imageUrl: IMAGES.gelNailArt,
    rating: 4.7,
    reviewCount: 211,
  },
  {
    beautician: 'abena_nails',
    title: 'Classic Manicure',
    category: 'Nails',
    price: 120,
    durationMins: 45,
    description: 'Shape, cuticle care, hand massage and your choice of polish. Quick and neat.',
    imageUrl: IMAGES.manicure,
    rating: 4.6,
    reviewCount: 88,
  },
  {
    beautician: 'yaa_nailstudio',
    title: 'Acrylic Full Set',
    category: 'Nails',
    price: 350,
    durationMins: 120,
    description: 'Full acrylic set in any shape and length, finished with gel polish or chrome.',
    imageUrl: IMAGES.nailStudio,
    rating: 4.8,
    reviewCount: 45,
  },
  {
    beautician: 'serwaa_spa',
    title: 'Spa Facial & Scalp Treatment',
    category: 'Skincare',
    price: 300,
    durationMins: 60,
    description: 'Deep-cleansing facial, gentle exfoliation and a soothing scalp massage with a hydrating mask.',
    imageUrl: IMAGES.hairWash,
    rating: 4.7,
    reviewCount: 39,
  },
];

async function ensureBeautician(username, expiresAt) {
  // Never touch a real person who happens to own this username.
  if (await User.exists({ usernameKey: username, isSample: { $ne: true } })) return null;
  const now = new Date();
  return User.findOneAndUpdate(
    { usernameKey: username, isSample: true },
    {
      $setOnInsert: {
        username,
        usernameKey: username,
        email: `${username}@sample.glowconnect.invalid`,
        role: 'BEAUTICIAN',
        isSample: true,
      },
      // Keep the placeholder plan active so the listings stay visible.
      $set: {
        subscriptionStatus: 'ACTIVE',
        subscription: { planId: 'yearly', startedAt: now, expiresAt },
      },
    },
    { upsert: true, new: true },
  );
}

/** Add any missing showcase listings. Returns how many were added. */
async function seedSampleData() {
  const inAYear = new Date(Date.now() + 365 * 86_400_000);
  const owners = {};
  for (const username of Object.keys(BEAUTICIANS)) {
    owners[username] = await ensureBeautician(username, inAYear);
  }

  let added = 0;
  for (const [i, item] of SHOWCASE.entries()) {
    const owner = owners[item.beautician];
    if (!owner) continue;
    if (await Service.exists({ beautician: owner._id, title: item.title })) continue;
    const { beautician: _username, ...fields } = item;
    await Service.create({
      ...fields,
      beautician: owner._id,
      location: BEAUTICIANS[item.beautician],
      currency: 'GHS',
      isSample: false, // bookable
      // Spread creation times so "newest first" keeps this order.
      createdAt: new Date(Date.now() - (SHOWCASE.length - i) * 60_000),
    });
    added += 1;
  }
  return added;
}

module.exports = { seedSampleData, SHOWCASE_COUNT: SHOWCASE.length };
