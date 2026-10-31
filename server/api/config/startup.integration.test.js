const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

test('complete staging API initializes routes and boots with isolated settings', async () => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../server.js')], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, APP_ENV: 'staging', PORT: '0', EMAIL_MODE: 'capture',
      DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test', STAGING_DATABASE_HOST: '127.0.0.1',
      STRIPE_SECRET_KEY: 'sk_test_local_mock', SHIPPO_TOKEN: 'shippo_test_local_mock',
      PDF_SERVICE_KEY: '{}', CF_ENDPOINT: 'https://storage.example.com', CF_ACCESS: 'test', CF_SECRET: 'test',
    }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Startup does not connect to the database or other services. The unreachable DB forbids accidental writes.
  let output = '';
  const started = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Staging startup timed out')); }, 10000);
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      if (output.includes('Server running on port')) { clearTimeout(timeout); resolve(true); }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); if (code) reject(new Error(`Staging startup failed (${code}): ${output}`)); });
  });
  child.kill();
  assert.equal(started, true);
});
