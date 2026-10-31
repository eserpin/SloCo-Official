const test = require('node:test');
const assert = require('node:assert/strict');
test('capture mode serializes email without connecting to Gmail', async () => {
  process.env.EMAIL_MODE = 'capture';
  process.env.VERCEL = '1'; // Exercise ephemeral capture without writing personal data to disk.
  const mailer = require('./mailer');
  const result = await mailer.sendMail({ from: 'test@example.com', to: 'reader@example.com', subject: 'Test capture', text: 'Hello' });
  const captured = JSON.parse(result.message);
  assert.equal(captured.subject, 'Test capture');
  assert.equal(captured.text, 'Hello');
  assert.equal(mailer.transporter.name, 'JSONTransport');
  mailer.close();
});
