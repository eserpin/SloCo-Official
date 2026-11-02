const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const stub = (id, exports) => { const file = require.resolve(id); require.cache[file] = { id: file, filename: file, loaded: true, exports }; };
let uses, driveFails, selectedFiles, writes;
stub('../config/db', { query: async (sql) => {
  if (sql.startsWith('UPDATE')) { writes++; if (!uses) return { rowCount: 0 }; uses--; return { rowCount: 1, rows: [{ uses_left: uses }] }; }
  return { rows: uses ? [{ uses_left: uses, created_at: new Date() }] : [] };
} });
stub('../config/downloadDrive', { getDownloadUrl: async (id) => {
  selectedFiles.push(id); if (driveFails) throw new Error('Drive failed'); return `https://drive.example/${id}`;
} });
const app = express(); app.use('/api/download', require('./download'));
let server, base;
const token = 'a'.repeat(64);
test.before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api/download/`; });
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => { uses = 3; writes = 0; selectedFiles = []; driveFails = false; process.env.GDRIVE_FILE_ID = 'full'; process.env.GDRIVE_SMALL_FILE_ID = 'small'; process.env.FRONTEND_URL = 'https://shop.example/'; });
const get = (path) => fetch(base + path, { redirect: 'manual' });
test('viewing selection metadata is free and does not disclose Drive IDs', async () => {
  const r = await get(`validate/${token}`); const body = await r.json();
  assert.equal(r.status, 200); assert.equal(body.usesLeft, 3); assert.equal(body.versions.length, 2);
  assert.equal(writes, 0); assert.equal(selectedFiles.length, 0); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(body).includes('fileId'));
});
test('old email URL opens the selection page without spending a use', async () => {
  const r = await get(token); assert.equal(r.headers.get('location'), `https://shop.example/download/${token}`); assert.equal(uses, 3);
});
test('both PDF choices share one allowance', async () => {
  assert.equal((await get(`${token}?version=standard`)).headers.get('location'), 'https://drive.example/small');
  assert.equal((await get(`${token}?version=original`)).headers.get('location'), 'https://drive.example/full');
  assert.equal(uses, 1); assert.deepEqual(selectedFiles, ['small', 'full']);
});
test('failed Drive lookup does not consume a download', async () => {
  driveFails = true; assert.equal((await get(`${token}?version=standard`)).status, 500); assert.equal(uses, 3); assert.equal(writes, 0);
});
test('exhausted or malformed links cannot fetch files', async () => {
  uses = 0; assert.equal((await get(`validate/${token}`)).status, 403); assert.equal((await get(`${token}?version=standard`)).status, 403);
  uses = 3; assert.equal((await get('invalid?version=original')).status, 403); assert.equal(selectedFiles.length, 0);
});
test('invalid or unconfigured versions consume nothing', async () => {
  assert.equal((await get(`${token}?version=other`)).status, 400);
  delete process.env.GDRIVE_SMALL_FILE_ID; assert.equal((await get(`${token}?version=standard`)).status, 503); assert.equal(uses, 3);
});
test('concurrent downloads cannot exceed the final remaining use', async () => {
  uses = 1; const responses = await Promise.all([get(`${token}?version=standard`), get(`${token}?version=original`)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [302, 403]); assert.equal(uses, 0);
});
test('without a frontend URL legacy links still download the original', async () => {
  delete process.env.FRONTEND_URL; const r = await get(token); assert.equal(r.headers.get('location'), 'https://drive.example/full'); assert.equal(uses, 2);
});
