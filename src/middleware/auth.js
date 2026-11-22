/**
 * Session auth: the httpOnly session cookie identifies the signed-in user.
 */
const config = require('../config');
const { findSessionUser } = require('../services/auth.service');
const { refreshStatus } = require('../services/subscription.service');
const { HttpError } = require('../utils/httpError');
const { asyncHandler } = require('../utils/asyncHandler');

const attachUser = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[config.session.cookieName];
  req.sessionToken = token || null;
  const user = token ? await findSessionUser(token) : null;
  req.user = user ? await refreshStatus(user) : null;
  next();
});

function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue', 'UNAUTHENTICATED'));
  next();
}

function setSessionCookie(res, { token, expiresAt }) {
  res.cookie(config.session.cookieName, token, {
    httpOnly: true,
    sameSite: config.session.sameSite,
    secure: config.session.secureCookie,
    expires: expiresAt,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(config.session.cookieName, {
    httpOnly: true,
    sameSite: config.session.sameSite,
    secure: config.session.secureCookie,
    path: '/',
  });
}

module.exports = { attachUser, requireUser, setSessionCookie, clearSessionCookie };
