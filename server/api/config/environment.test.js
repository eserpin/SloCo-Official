const test = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeEnvironment } = require('./environment');
const safe = { APP_ENV: 'staging', STRIPE_SECRET_KEY: 'sk_test_mock', SHIPPO_TOKEN: 'shippo_test_mock',
  EMAIL_MODE: 'capture', DATABASE_URL: 'postgres://test:test@test-db.example/test', STAGING_DATABASE_HOST: 'test-db.example' };
test('staging accepts isolated database and sandbox services', () => assert.doesNotThrow(() => assertSafeEnvironment(safe)));
test('sandbox SMTP requires one explicit test recipient', () => {
  assert.doesNotThrow(() => assertSafeEnvironment({ ...safe, EMAIL_MODE: 'sandbox-smtp', SANDBOX_EMAIL_RECIPIENT: 'reader@example.com' }));
  for (const recipient of ['', 'reader@example.com,other@example.com', 'invalid']) {
    assert.throws(() => assertSafeEnvironment({ ...safe, EMAIL_MODE: 'sandbox-smtp', SANDBOX_EMAIL_RECIPIENT: recipient }));
  }
});
for (const [key, value] of Object.entries({ STRIPE_SECRET_KEY: 'sk_live_mock', SHIPPO_TOKEN: 'shippo_live_mock',
  EMAIL_MODE: 'gmail', STAGING_DATABASE_HOST: 'other-db.example', VERCEL_ENV: 'production' })) {
  test(`staging rejects unsafe ${key}`, () => assert.throws(() => assertSafeEnvironment({ ...safe, [key]: value })));
}
test('Vercel previews cannot silently inherit production mode', () => assert.throws(() => assertSafeEnvironment({ VERCEL_ENV: 'preview' })));
test('existing production configuration remains supported', () => assert.doesNotThrow(() => assertSafeEnvironment({ VERCEL_ENV: 'production' })));
