const { loadEnvironment, assertSafeEnvironment } = require('../config/environment');
loadEnvironment();
assertSafeEnvironment();
const pool = require('../config/db');
const { retryPendingConsents } = require('../services/newsletter');
retryPendingConsents().then(count => console.log(`Processed ${count} pending newsletter signup(s).`))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => pool.end());
