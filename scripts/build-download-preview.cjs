const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, [require.resolve('../client/node_modules/react-scripts/bin/react-scripts.js'), 'build'], {
  cwd: path.resolve(__dirname, '../client'), stdio: 'inherit',
  env: { ...process.env, CI: 'true', BUILD_PATH: 'build-download-preview', REACT_APP_API_URL: '/',
    REACT_APP_ENV: 'local', REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_test_local_mock', REACT_APP_PAYPAL_CLIENT_ID: '',
    REACT_APP_GOOGLE_MAPS_KEY: '', REACT_APP_DISABLE_ANALYTICS: 'true' },
});
process.exit(result.status ?? 1);
