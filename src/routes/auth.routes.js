const { Router } = require('express');
const auth = require('../services/auth.service');
const { toPublicUser } = require('../services/user.service');
const { setSessionCookie, clearSessionCookie } = require('../middleware/auth');
const { sendCodeLimiter, verifyCodeLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../utils/asyncHandler');

const router = Router();

async function signIn(req, res, user, status = 200) {
  // Rotate: drop any session this browser already had.
  if (req.sessionToken) await auth.destroySession(req.sessionToken);
  const session = await auth.createSession(user, req.get('user-agent') || '');
  setSessionCookie(res, session);
  res.status(status).json({ user: toPublicUser(user) });
}

// Sign up: { username, email } → code emailed
router.post('/signup/start', sendCodeLimiter, asyncHandler(async (req, res) => {
  res.json(await auth.startSignup(req.body));
}));

// { email, code } → account created + signed in
router.post('/signup/verify', verifyCodeLimiter, asyncHandler(async (req, res) => {
  const user = await auth.verifySignup(req.body);
  await signIn(req, res, user, 201);
}));

// Sign in: { email } → code emailed
router.post('/login/start', sendCodeLimiter, asyncHandler(async (req, res) => {
  res.json(await auth.startLogin(req.body));
}));

// { email, code } → signed in
router.post('/login/verify', verifyCodeLimiter, asyncHandler(async (req, res) => {
  const user = await auth.verifyLogin(req.body);
  await signIn(req, res, user);
}));

// { email, purpose: 'signup' | 'login' } → new code
router.post('/resend', sendCodeLimiter, asyncHandler(async (req, res) => {
  res.json(await auth.resendCode(req.body));
}));

// Current user, or { user: null } when signed out
router.get('/me', (req, res) => {
  res.json({ user: req.user ? toPublicUser(req.user) : null });
});

router.post('/logout', asyncHandler(async (req, res) => {
  await auth.destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

module.exports = router;
