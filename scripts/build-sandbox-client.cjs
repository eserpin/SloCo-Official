const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('../server/node_modules/dotenv');
const local = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../client/.env.development.local')));
const env = { ...process.env, ...local, CI: 'true', BUILD_PATH: 'build-sandbox',
  REACT_APP_API_URL: 'http://127.0.0.1:5011/', STAGING_API_HOST: '127.0.0.1',
  REACT_APP_ENV: 'staging', REACT_APP_DISABLE_ANALYTICS: 'true', REACT_APP_PAYPAL_CLIENT_ID: '', REACT_APP_GOOGLE_MAPS_KEY: '' };
require('../client/scripts/check-environment.cjs').checkEnvironment(env);
const result = spawnSync(process.execPath, [require.resolve('../client/node_modules/react-scripts/bin/react-scripts.js'), 'build'], {
  cwd: path.resolve(__dirname, '../client'), stdio: 'inherit', env,
});
process.exit(result.status ?? 1);
