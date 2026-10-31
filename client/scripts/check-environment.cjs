function checkEnvironment(env) {
  if (env.VERCEL_ENV !== 'preview' && env.REACT_APP_ENV !== 'staging') return;
  if (!env.REACT_APP_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_')) {
    throw new Error('Staging frontend requires a Stripe publishable test key.');
  }
  let url;
  try { url = new URL(env.REACT_APP_API_URL); } catch { throw new Error('Staging requires REACT_APP_API_URL.'); }
  if (!env.STAGING_API_HOST || url.hostname !== env.STAGING_API_HOST || !url.pathname.endsWith('/')) {
    throw new Error('Staging API URL must match independently confirmed STAGING_API_HOST and end with /.');
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('Remote staging API requires HTTPS.');
  }
  if (env.REACT_APP_DISABLE_ANALYTICS !== 'true') throw new Error('Staging must disable production analytics.');
}
if (require.main === module) {
  // Match CRA development precedence without loading production keys into committed files.
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const development = process.env.npm_lifecycle_event === 'prestart';
  const mode = development ? 'development' : 'production';
  for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
    require('dotenv').config({ path: path.join(root, file), quiet: true });
  }
  checkEnvironment(process.env);
}
module.exports = { checkEnvironment };
