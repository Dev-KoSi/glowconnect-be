/** Unsplash beauty photos used for seed listings and as per-category fallbacks. */
const unsplash = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=75`;

// All verified to load and to show what their name says.
const IMAGES = {
  glamMakeup: unsplash('1487412947147-5cebf100ffc2'),
  makeupKit: unsplash('1522335789203-aabd1fc54bc9'),
  brushes: unsplash('1516975080664-ed2fc6a32937'),
  blowDry: unsplash('1562322140-8baeececf3df'),
  longHair: unsplash('1522337360788-8b13dee7a37e'),
  naturalHair: unsplash('1519699047748-de8e457a634e'),
  hairWash: unsplash('1595476108010-b4d1f102b1b1'),
  gelNailArt: unsplash('1604654894610-df63bc536371'),
  manicure: unsplash('1457972729786-0411a3b2b626'),
  nailStudio: unsplash('1632345031435-8727f6897d53'),
  pastelNails: unsplash('1607779097040-26e80aa78e66'),
  salon: unsplash('1600948836101-f9ffda59d250'),
};

const CATEGORY_FALLBACK = {
  Hair: unsplash('1522337360788-8b13dee7a37e'),
  Makeup: unsplash('1522335789203-aabd1fc54bc9'),
  Nails: unsplash('1607779097040-26e80aa78e66'),
  default: unsplash('1600948836101-f9ffda59d250'),
};

const fallbackImageFor = (category) => CATEGORY_FALLBACK[category] || CATEGORY_FALLBACK.default;

module.exports = { IMAGES, fallbackImageFor };
