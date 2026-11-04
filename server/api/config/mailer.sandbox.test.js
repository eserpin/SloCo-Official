const test = require('node:test');
const assert = require('node:assert/strict');
test('sandbox SMTP reroutes every recipient and envelope to one test inbox', async () => {
  let sent;
  const nodemailerPath = require.resolve('nodemailer');
  require.cache[nodemailerPath] = { exports: { createTransport: () => ({ sendMail: async message => {
    sent = message; return { messageId: 'test', accepted: [message.to], rejected: [] };
  } }) } };
  process.env.APP_ENV = 'staging';
  process.env.EMAIL_MODE = 'sandbox-smtp';
  process.env.SANDBOX_EMAIL_RECIPIENT = 'authorized@example.com';
  process.env.GMAIL_USER = 'sender@example.com';
  const mailer = require('./mailer');
  await mailer.sendMail({ to: 'customer@example.com', cc: 'admin@example.com', bcc: 'other@example.com',
    envelope: { from: 'wrong@example.com', to: ['wrong@example.com'] }, subject: 'Receipt', text: 'Order' });
  assert.equal(sent.to, 'authorized@example.com');
  assert.equal(sent.cc, undefined); assert.equal(sent.bcc, undefined);
  assert.deepEqual(sent.envelope, { from: 'sender@example.com', to: ['authorized@example.com'] });
  assert.equal(sent.subject, '[SANDBOX] Receipt');
});
