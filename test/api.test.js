/**
 * End-to-end API tests against a real (in-memory) MongoDB.
 * Run: npm test -w backend
 */
process.env.NODE_ENV = 'test';
process.env.ACCESS_KEY = 'OPEN-ME';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const { connectDB, disconnectDB } = require('../src/db/connect');
const { outbox } = require('../src/services/mailer');
const { User, OtpCode } = require('../src/models');
const { seedSampleData } = require('../src/data/sample');

let server;
let base;

before(async () => {
  await connectDB('');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await disconnectDB();
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  outbox.length = 0;
});

/** Tiny client that keeps the session cookie between calls, like a browser. */
function client() {
  let cookie = '';
  return async function call(method, path, body) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      cookie = pair.endsWith('=') ? '' : pair;
    }
    return { status: res.status, body: await res.json(), headers: res.headers };
  };
}

const lastCodeFor = (email) => {
  const mail = [...outbox].reverse().find((m) => m.to === email);
  return mail?.text.match(/\b(\d{6})\b/)?.[1];
};

async function signUp(username, email) {
  const call = client();
  const start = await call('POST', '/auth/signup/start', { username, email });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const done = await call('POST', '/auth/signup/verify', { email, code: lastCodeFor(email) });
  assert.equal(done.status, 201, JSON.stringify(done.body));
  return { call, user: done.body.user };
}

async function becomeBeautician(call, planId = 'monthly') {
  const res = await call('POST', '/user/subscribe', { planId, accessKey: 'OPEN-ME' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

// ---------- Accounts ----------

test('sign up: code emailed, verified, account created and signed in', async () => {
  const call = client();
  const start = await call('POST', '/auth/signup/start', { username: 'Ama_B', email: 'Ama@Example.com' });
  assert.equal(start.status, 200);
  assert.equal(start.body.email, 'ama@example.com');
  assert.equal(start.body.devCode, lastCodeFor('ama@example.com'), 'dev code mirrors the console email');
  assert.match(outbox.at(-1).subject, /verification code/);
  assert.match(outbox.at(-1).html, /GlowConnect/);
  assert.equal(await User.countDocuments(), 0, 'no account until the code is verified');

  const verify = await call('POST', '/auth/signup/verify', { email: 'ama@example.com', code: lastCodeFor('ama@example.com') });
  assert.equal(verify.status, 201);
  assert.equal(verify.body.user.username, 'Ama_B');
  assert.equal(verify.body.user.role, 'CLIENT');
  assert.equal(verify.body.user.subscriptionStatus, 'NONE');
  assert.match(verify.headers.get('set-cookie'), /gm_sid=.+HttpOnly/i);

  const me = await call('GET', '/auth/me');
  assert.equal(me.body.user.email, 'ama@example.com');
  assert.equal(await OtpCode.countDocuments(), 0, 'code is single-use');
});

test('sign up rejects bad input and taken email/username (case-insensitive)', async () => {
  await signUp('kofi', 'kofi@example.com');
  const call = client();
  assert.equal((await call('POST', '/auth/signup/start', { username: 'k!', email: 'x@example.com' })).body.error.code, 'VALIDATION_ERROR');
  assert.equal((await call('POST', '/auth/signup/start', { username: 'abc', email: 'not-an-email' })).body.error.code, 'VALIDATION_ERROR');
  const takenEmail = await call('POST', '/auth/signup/start', { username: 'other', email: 'KOFI@example.com' });
  assert.equal(takenEmail.status, 409);
  assert.equal(takenEmail.body.error.code, 'EMAIL_TAKEN');
  const takenName = await call('POST', '/auth/signup/start', { username: 'KOFI', email: 'new@example.com' });
  assert.equal(takenName.body.error.code, 'USERNAME_TAKEN');
});

test('wrong codes count down attempts, then the code is burned', async () => {
  const call = client();
  await call('POST', '/auth/signup/start', { username: 'esi', email: 'esi@example.com' });
  const good = lastCodeFor('esi@example.com');
  const bad = good === '000000' ? '111111' : '000000';

  const first = await call('POST', '/auth/signup/verify', { email: 'esi@example.com', code: bad });
  assert.equal(first.status, 400);
  assert.equal(first.body.error.code, 'INVALID_CODE');
  assert.equal(first.body.error.details.attemptsLeft, 4);
  for (let i = 0; i < 3; i++) await call('POST', '/auth/signup/verify', { email: 'esi@example.com', code: bad });
  const last = await call('POST', '/auth/signup/verify', { email: 'esi@example.com', code: bad });
  assert.equal(last.body.error.code, 'TOO_MANY_ATTEMPTS');
  const tooLate = await call('POST', '/auth/signup/verify', { email: 'esi@example.com', code: good });
  assert.equal(tooLate.body.error.code, 'CODE_EXPIRED');
});

test('expired codes are rejected; resend has a cooldown', async () => {
  const call = client();
  await call('POST', '/auth/signup/start', { username: 'yaw', email: 'yaw@example.com' });
  const resendNow = await call('POST', '/auth/resend', { email: 'yaw@example.com', purpose: 'signup' });
  assert.equal(resendNow.status, 429);
  assert.equal(resendNow.body.error.code, 'CODE_RECENTLY_SENT');

  await OtpCode.updateOne({ email: 'yaw@example.com' }, { expiresAt: new Date(Date.now() - 1000), sentAt: new Date(Date.now() - 120_000) });
  const expired = await call('POST', '/auth/signup/verify', { email: 'yaw@example.com', code: lastCodeFor('yaw@example.com') });
  assert.equal(expired.body.error.code, 'CODE_EXPIRED');
});

test('sign in with an emailed code; sign out ends the session', async () => {
  await signUp('abena', 'abena@example.com');
  const call = client();
  const unknown = await call('POST', '/auth/login/start', { email: 'nobody@example.com' });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'ACCOUNT_NOT_FOUND');

  const start = await call('POST', '/auth/login/start', { email: 'abena@example.com' });
  assert.equal(start.status, 200);
  assert.match(outbox.at(-1).subject, /sign-in code/);
  const login = await call('POST', '/auth/login/verify', { email: 'abena@example.com', code: lastCodeFor('abena@example.com') });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.username, 'abena');

  assert.equal((await call('POST', '/auth/logout')).status, 200);
  assert.equal((await call('GET', '/auth/me')).body.user, null);
  assert.equal((await call('GET', '/client/bookings')).status, 401);
});

test('protected routes need a session', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/user/profile')).status, 401);
  assert.equal((await anon('POST', '/user/subscribe', { planId: 'monthly', accessKey: 'OPEN-ME' })).status, 401);
  assert.equal((await anon('POST', '/bookings/create', {})).status, 401);
  assert.equal((await anon('GET', '/beautician/requests')).status, 401);
  assert.equal((await anon('GET', '/auth/me')).body.user, null);
});

// ---------- Plans & access key ----------

test('plans are GH₵150 / GH₵750 / GH₵1,200', async () => {
  const { body } = await client()('GET', '/plans');
  assert.deepEqual(body.plans.map((p) => [p.id, p.price, p.currency]), [
    ['monthly', 150, 'GHS'],
    ['six_month', 750, 'GHS'],
    ['yearly', 1200, 'GHS'],
  ]);
});

test('the access key unlocks a plan; wrong keys are rejected', async () => {
  const { call } = await signUp('akua', 'akua@example.com');
  const wrong = await call('POST', '/user/subscribe', { planId: 'six_month', accessKey: 'LET-ME-IN' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.error.code, 'INVALID_ACCESS_KEY');
  assert.equal((await call('POST', '/user/subscribe', { planId: 'six_month' })).status, 400);
  assert.equal((await call('POST', '/user/subscribe', { planId: 'weekly', accessKey: 'OPEN-ME' })).body.error.code, 'INVALID_PLAN');

  const ok = await call('POST', '/user/subscribe', { planId: 'six_month', accessKey: ' open-me ' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.role, 'BEAUTICIAN');
  assert.equal(ok.body.user.subscriptionStatus, 'ACTIVE');
  assert.equal(ok.body.user.beauticianAccess, true);
  assert.equal(ok.body.transaction.method, 'ACCESS_KEY');
  assert.equal(ok.body.transaction.amountCharged, 0);
  const months = (new Date(ok.body.user.subscription.expiresAt) - Date.now()) / (30.4 * 86_400_000);
  assert.ok(months > 5.8 && months < 6.2);

  const renew = await becomeBeautician(call, 'monthly');
  assert.ok(new Date(renew.user.subscription.expiresAt) > new Date(ok.body.user.subscription.expiresAt), 'renewal stacks');
});

test('beautician routes are locked until a plan is active, and again once it expires', async () => {
  const { call, user } = await signUp('efua', 'efua@example.com');
  const none = await call('GET', '/beautician/dashboard');
  assert.equal(none.status, 402);
  assert.equal(none.body.error.code, 'SUBSCRIPTION_REQUIRED');

  await becomeBeautician(call);
  assert.equal((await call('GET', '/beautician/dashboard')).status, 200);

  await User.updateOne({ _id: user.id }, { 'subscription.expiresAt': new Date(Date.now() - 1000) });
  const expired = await call('GET', '/beautician/requests');
  assert.equal(expired.status, 402);
  assert.equal(expired.body.error.code, 'SUBSCRIPTION_EXPIRED');
  assert.equal((await call('GET', '/auth/me')).body.user.subscriptionStatus, 'EXPIRED');
});

// ---------- Listings & bookings ----------

test('publishing a service puts it in the marketplace; expiry hides it', async () => {
  const { call, user } = await signUp('adwoa', 'adwoa@example.com');
  await becomeBeautician(call);
  const bad = await call('POST', '/beautician/services', { title: 'x', price: -1, category: 'Tattoos', imageUrl: 'javascript:alert(1)' });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.error.details.fields).sort(), ['category', 'imageUrl', 'price', 'title']);

  const created = await call('POST', '/beautician/services', { title: 'Knotless Braids', price: 850, category: 'Hair', location: 'Osu, Accra' });
  assert.equal(created.status, 201);
  assert.equal(created.body.service.currency, 'GHS');
  assert.equal(created.body.service.beauticianName, 'adwoa');
  assert.match(created.body.service.imageUrl, /^https:/);

  const anon = client();
  const market = await anon('GET', '/services');
  assert.deepEqual(market.body.services.map((s) => s.title), ['Knotless Braids']);
  assert.equal((await anon('GET', `/services/${created.body.service.id}`)).status, 200);
  assert.equal((await anon('GET', '/services/not-an-id')).status, 404);

  await User.updateOne({ _id: user.id }, { 'subscription.expiresAt': new Date(Date.now() - 1000) });
  assert.equal((await anon('GET', '/services')).body.services.length, 0);
});

test('booking flow: client requests, beautician approves, client sees it', async () => {
  const pro = await signUp('akosua', 'akosua@example.com');
  await becomeBeautician(pro.call);
  const { body: svc } = await pro.call('POST', '/beautician/services', { title: 'Glam Makeup', price: 650, category: 'Makeup' });
  const clientA = await signUp('ama', 'ama@example.com');
  const clientB = await signUp('kofi', 'kofi@example.com');

  const past = await clientA.call('POST', '/bookings/create', { serviceId: svc.service.id, requestedAt: inDays(-1) });
  assert.equal(past.status, 400);
  const own = await pro.call('POST', '/bookings/create', { serviceId: svc.service.id, requestedAt: inDays(2) });
  assert.equal(own.body.error.code, 'OWN_SERVICE');

  const created = await clientA.call('POST', '/bookings/create', { serviceId: svc.service.id, requestedAt: inDays(3), note: 'Wedding at 2pm' });
  assert.equal(created.status, 201);
  assert.equal(created.body.booking.status, 'PENDING');
  assert.equal(created.body.booking.service.price, 650);
  assert.equal(created.body.booking.beautician.name, 'akosua');
  const id = created.body.booking.id;

  const inbox = await pro.call('GET', '/beautician/requests');
  assert.deepEqual(inbox.body.requests.map((b) => [b.id, b.client.name]), [[id, 'ama']]);

  const stranger = await signUp('nana', 'nana@example.com');
  await becomeBeautician(stranger.call);
  assert.equal((await stranger.call('PATCH', `/bookings/${id}/status`, { status: 'DECLINED' })).status, 403);
  assert.equal((await clientB.call('PATCH', `/bookings/${id}/status`, { status: 'APPROVED' })).status, 402);

  const approved = await pro.call('PATCH', `/bookings/${id}/status`, { status: 'APPROVED' });
  assert.equal(approved.body.booking.status, 'APPROVED');
  assert.equal((await pro.call('PATCH', `/bookings/${id}/status`, { status: 'DECLINED' })).status, 409);

  const mine = await clientA.call('GET', '/client/bookings');
  assert.equal(mine.body.bookings[0].status, 'APPROVED');
  assert.equal((await clientB.call('GET', '/client/bookings')).body.bookings.length, 0, 'clients only see their own bookings');

  const dash = await pro.call('GET', '/beautician/dashboard');
  assert.deepEqual(dash.body.stats, { listings: 1, pendingRequests: 0, approvedBookings: 1 });
});

test('showcase listings fill the marketplace and can be booked; their beauticians cannot sign in', async () => {
  assert.equal(await seedSampleData(), 10);
  assert.equal(await seedSampleData(), 0, 're-running adds nothing');
  const anon = client();
  const { body } = await anon('GET', '/services');
  assert.equal(body.services.length, 10);
  assert.ok(body.services.every((s) => !s.isSample && s.currency === 'GHS' && s.rating && s.location && s.imageUrl));
  assert.equal(new Set(body.services.map((s) => s.category)).size, 5);

  const { call } = await signUp('client1', 'client1@example.com');
  const booked = await call('POST', '/bookings/create', { serviceId: body.services[0].id, requestedAt: inDays(2), note: 'Hi!' });
  assert.equal(booked.status, 201);
  assert.equal(booked.body.booking.status, 'PENDING');
  assert.equal((await call('GET', '/client/bookings')).body.bookings.length, 1);

  const login = await anon('POST', '/auth/login/start', { email: 'akosua_glam@sample.glowconnect.invalid' });
  assert.equal(login.status, 404, 'placeholder beauticians have no sign-in');
  const taken = await anon('POST', '/auth/signup/start', { username: 'akosua_glam', email: 'new@example.com' });
  assert.equal(taken.body.error.code, 'USERNAME_TAKEN');
});

// ---------- HTTP plumbing ----------

test('CORS allows the Vite origin with credentials; security headers are set', async () => {
  const res = await fetch(`${base}/auth/me`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  const health = await fetch(`${base}/health`);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
});

test('malformed JSON gets a clean 400; demo endpoints are gone', async () => {
  const res = await fetch(`${base}/auth/signup/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal((await res.json()).error.code, 'INVALID_JSON');
  const call = client();
  assert.equal((await call('POST', '/user/toggle-status', {})).status, 404);
  assert.equal((await call('POST', '/dev/reset')).status, 404);
  assert.equal((await call('GET', '/user/list')).status, 404);
});
