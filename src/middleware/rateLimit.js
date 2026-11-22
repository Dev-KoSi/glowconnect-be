/**
 * Rate limits for endpoints that send email or check secrets, to stop
 * spamming inboxes and guessing codes / access keys. Disabled in tests.
 */
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const { HttpError } = require('../utils/httpError');

const limiter = (limit, minutes, message) =>
  rateLimit({
    windowMs: minutes * 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.isTest,
    handler: (_req, _res, next) => next(new HttpError(429, message, 'RATE_LIMITED')),
  });

module.exports = {
  /** Requests that send an email code. */
  sendCodeLimiter: limiter(8, 15, 'Too many code requests. Please wait a few minutes and try again.'),
  /** Code submissions (per-code attempts are also capped). */
  verifyCodeLimiter: limiter(30, 15, 'Too many attempts. Please wait a few minutes and try again.'),
  /** Access-key submissions. */
  accessKeyLimiter: limiter(10, 15, 'Too many access key attempts. Please wait a few minutes and try again.'),
};
