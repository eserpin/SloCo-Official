const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEnvironment } = require('../../../client/scripts/check-environment.cjs');
const safe = { VERCEL_ENV: 'preview', REACT_APP_API_URL: 'https://test-api.example/', STAGING_API_HOST: 'test-api.example',
  REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_test_mock', REACT_APP_DISABLE_ANALYTICS: 'true' };
test('preview frontend accepts matching sandbox API', () => assert.doesNotThrow(() => checkEnvironment(safe)));
test('preview frontend accepts the same-origin checkout relay without a hostname', () => {
  assert.doesNotThrow(() => checkEnvironment({ ...safe, REACT_APP_API_URL: '/sandbox/', STAGING_API_HOST: undefined }));
});
test('same-origin checkout relay still requires test keys and disabled analytics', () => {
  for (const overrides of [{ REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_live_mock' }, { REACT_APP_DISABLE_ANALYTICS: 'false' }]) {
    assert.throws(() => checkEnvironment({ ...safe, REACT_APP_API_URL: '/sandbox/', ...overrides }));
  }
});
test('preview frontend rejects other relative and protocol-relative API paths', () => {
  for (const apiUrl of ['/api/', '/sandbox', '//production.example/sandbox/']) {
    assert.throws(() => checkEnvironment({ ...safe, REACT_APP_API_URL: apiUrl }));
  }
});
for (const [key, value] of Object.entries({ REACT_APP_API_URL: 'https://production.example/',
  REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_live_mock', REACT_APP_DISABLE_ANALYTICS: 'false' })) {
  test(`preview frontend rejects unsafe ${key}`, () => assert.throws(() => checkEnvironment({ ...safe, [key]: value })));
}
