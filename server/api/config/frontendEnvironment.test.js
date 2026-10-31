const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEnvironment } = require('../../../client/scripts/check-environment.cjs');
const safe = { VERCEL_ENV: 'preview', REACT_APP_API_URL: 'https://test-api.example/', STAGING_API_HOST: 'test-api.example',
  REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_test_mock', REACT_APP_DISABLE_ANALYTICS: 'true' };
test('preview frontend accepts matching sandbox API', () => assert.doesNotThrow(() => checkEnvironment(safe)));
for (const [key, value] of Object.entries({ REACT_APP_API_URL: 'https://production.example/',
  REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_live_mock', REACT_APP_DISABLE_ANALYTICS: 'false' })) {
  test(`preview frontend rejects unsafe ${key}`, () => assert.throws(() => checkEnvironment({ ...safe, [key]: value })));
}
