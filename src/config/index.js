const crypto = require('node:crypto');
const path = require('node:path');

const nodeEnv = process.env.NODE_ENV || 'development';
const list = (value) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

// 'lax' (default) works when the browser reaches the API on the same site as the
// website: same server, or the frontend host forwarding /api. Use 'none' only when
// the website calls a different domain directly (VITE_API_URL); it forces Secure.
const cookieSameSite = ['lax', 'strict', 'none'].includes(process.env.COOKIE_SAMESITE)
  ? process.env.COOKIE_SAMESITE
  : 'lax';

if (nodeEnv === 'production' && !process.env.AUTH_SECRET) {
  console.warn('[config] AUTH_SECRET is not set; sign-in codes will stop working after a restart. Set it in backend/.env.');
}

module.exports = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT) || 5000,
  /** Public URL of the site (used in emails and to decide on Secure cookies). */
  appUrl,
  /**
   * How many proxies sit in front of this server, so rate limits see the real
   * visitor IP. 1 = the host's own proxy (Render, Railway). 2 = Vercel/Netlify
   * forwarding /api to a host that also has a proxy. 0 = none (local).
   */
  trustProxy: /^\d+$/.test(process.env.TRUST_PROXY ?? '') ? Number(process.env.TRUST_PROXY) : nodeEnv === 'production' ? 1 : 0,
  // Origins allowed by CORS (Vite dev server + `vite preview` by default).
  clientOrigins: list(process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:4173'),

  /** MongoDB connection string. Empty → a temporary in-memory database (data is lost on restart). */
  mongoUri: process.env.MONGODB_URI || '',
  /** 'true' / 'false' to force sample listings on or off; default: only for the temporary database. */
  seedSampleData: process.env.SEED_SAMPLE_DATA,

  /** Unlocks a beautician plan while real payments aren't live. */
  accessKey: process.env.ACCESS_KEY || 'OPEN-ME',

  /** Secret used to hash one-time codes. */
  authSecret: process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex'),
  session: {
    cookieName: 'gm_sid',
    days: Number(process.env.SESSION_DAYS) || 30,
    sameSite: cookieSameSite,
    secureCookie: cookieSameSite === 'none' || appUrl.startsWith('https://') || process.env.COOKIE_SECURE === 'true',
  },
  otp: {
    ttlMinutes: 10,
    maxAttempts: 5,
    resendSeconds: 60,
  },

  /** SMTP for sending codes. Without SMTP_HOST, emails are printed to the server console. */
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  mailFrom: process.env.MAIL_FROM || 'GlowConnect <no-reply@glowconnect.local>',

  // Built frontend, served by Express when running `npm start` from the root.
  frontendDist: path.resolve(__dirname, '../../../frontend/dist'),
};
