const path = require('node:path');

const loadEnvironment = () => {
  const file = process.env.APP_ENV === 'staging' ? '.env.staging.local' : '.env';
  require('dotenv').config({ path: path.resolve(__dirname, '../..', file), quiet: true });
};

const assertSafeEnvironment = (env = process.env) => {
  const staging = env.APP_ENV === 'staging';
  if (env.VERCEL_ENV === 'preview' && !staging) {
    throw new Error('Preview deployments require APP_ENV=staging and isolated test settings.');
  }
  if (!staging) return;
  if (env.VERCEL_ENV === 'production') throw new Error('Staging mode cannot run in Vercel production.');
  if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Staging requires a Stripe test secret.');
  if (!env.SHIPPO_TOKEN?.startsWith('shippo_test_')) throw new Error('Staging requires a Shippo test token.');
  if (env.EMAIL_MODE !== 'capture' && !(env.EMAIL_MODE === 'sandbox-smtp' &&
      /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(env.SANDBOX_EMAIL_RECIPIENT || ''))) {
    throw new Error('Staging requires captured mail or sandbox SMTP with one explicit test recipient.');
  }
  // An explicit allowlist is deliberate: database credentials have no test/live prefix.
  let host;
  try { host = new URL(env.DATABASE_URL).hostname; } catch { throw new Error('Staging requires DATABASE_URL.'); }
  if (!env.STAGING_DATABASE_HOST || host !== env.STAGING_DATABASE_HOST) {
    throw new Error('Staging database must match the independently confirmed STAGING_DATABASE_HOST.');
  }
};

module.exports = { loadEnvironment, assertSafeEnvironment };
