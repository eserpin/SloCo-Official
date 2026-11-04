const { test } = require('node:test');
const assert = require('node:assert/strict');
const relay = require('../../../client/api/sandbox-checkout');

function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; },
    redirect(code, location) { this.code = code; this.headers.Location = location; return this; } };
}

test('sandbox download relay validates tokens and versions before contacting the backend', async t => {
  const original = { ...process.env }, oldFetch = global.fetch;
  t.after(() => { process.env = original; global.fetch = oldFetch; });
  Object.assign(process.env, { VERCEL_ENV: 'preview', REACT_APP_ENV: 'staging' });
  global.fetch = () => { throw Error('Must not contact backend'); };
  for (const query of [{ endpoint: 'download-validate', token: '../x' },
    { endpoint: 'download', token: 'a'.repeat(64), version: 'arbitrary' }]) {
    const res = response(); await relay({ method: 'GET', query }, res); assert.equal(res.code, 404);
  }
});

test('sandbox download relay forwards read-only validation and trusted Drive redirects', async t => {
  const original = { ...process.env }, oldFetch = global.fetch;
  t.after(() => { process.env = original; global.fetch = oldFetch; });
  Object.assign(process.env, { VERCEL_ENV: 'preview', REACT_APP_ENV: 'staging',
    SANDBOX_BACKEND_URL: 'https://checkout-test.vercel.app', SANDBOX_BACKEND_HOST: 'checkout-test.vercel.app', SANDBOX_BACKEND_SHARE: 'test-share' });
  const token = 'a'.repeat(64); const calls = [];
  let destination = 'https://drive.google.com/uc?id=test&export=download';
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('_vercel_share')) return { headers: { getSetCookie: () => ['_vercel_jwt=test-cookie; Secure'] } };
    if (String(url).includes('/validate/')) return { status: 200, headers: { get: () => 'application/json' }, json: async () => ({ usesLeft: 4, versions: [] }) };
    return { status: 302, headers: { get: () => destination } };
  };
  let res = response(); await relay({ method: 'GET', query: { endpoint: 'download-validate', token } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.usesLeft, 4);
  assert.equal(calls[1].url, `https://checkout-test.vercel.app/api/download/validate/${token}`);
  assert.equal(calls[1].options.method, 'GET'); assert.equal(calls[1].options.body, undefined);
  res = response(); await relay({ method: 'GET', query: { endpoint: 'download', token, version: 'standard' } }, res);
  assert.equal(res.code, 302); assert.equal(res.headers.Location, destination);
  destination = 'https://unrelated.example/';
  res = response(); await relay({ method: 'GET', query: { endpoint: 'download', token, version: 'original' } }, res);
  assert.equal(res.code, 502); assert.equal(res.headers.Location, undefined);
});

test('sandbox relay refuses production and arbitrary endpoints without contacting backend', async (t) => {
  const original = { ...process.env };
  const oldFetch = global.fetch;
  t.after(() => { process.env = original; global.fetch = oldFetch; });
  global.fetch = () => { throw new Error('Must not contact backend'); };
  process.env.VERCEL_ENV = 'production';
  process.env.REACT_APP_ENV = 'staging';
  let res = response();
  await relay({ method: 'POST', query: { endpoint: 'placeOrder' } }, res);
  assert.equal(res.code, 404);
  process.env.VERCEL_ENV = 'preview';
  for (const endpoint of ['download', '../placeOrder', 'https://example.com']) {
    res = response();
    await relay({ method: 'POST', query: { endpoint } }, res);
    assert.equal(res.code, 404);
  }
});

test('sandbox relay forwards checkout JSON without exposing its access cookie', async (t) => {
  const original = { ...process.env };
  const oldFetch = global.fetch;
  t.after(() => { process.env = original; global.fetch = oldFetch; });
  Object.assign(process.env, { VERCEL_ENV: 'preview', REACT_APP_ENV: 'staging',
    SANDBOX_BACKEND_URL: 'https://checkout-test.vercel.app', SANDBOX_BACKEND_HOST: 'checkout-test.vercel.app',
    SANDBOX_BACKEND_SHARE: 'test-share' });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return { headers: { getSetCookie: () => ['_vercel_jwt=test-cookie; Secure; HttpOnly'] } };
    return { status: 202, headers: { get: () => 'application/json' }, json: async () => ({ orderRecorded: true }) };
  };
  const res = response();
  await relay({ method: 'POST', query: { endpoint: 'placeOrder' }, body: { transactionId: 'test-payment' } }, res);
  assert.equal(res.code, 202);
  assert.deepEqual(res.body, { orderRecorded: true });
  assert.equal(calls[1].url, 'https://checkout-test.vercel.app/api/placeOrder');
  assert.equal(calls[1].options.headers.Cookie, '_vercel_jwt=test-cookie');
  assert.deepEqual(JSON.parse(calls[1].options.body), { transactionId: 'test-payment' });
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['Set-Cookie'], undefined);
  global.fetch = async () => ({ headers: { getSetCookie: () => [] } });
  const expired = response();
  await relay({ method: 'POST', query: { endpoint: 'placeOrder' }, body: {} }, expired);
  assert.equal(expired.code, 502);
  assert.ok(!JSON.stringify(expired.body).includes('test-share'));
});
