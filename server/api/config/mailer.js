// config/mailer.js
const nodemailer = require('nodemailer');

// Create reusable transporter object using Gmail
const transporter = process.env.EMAIL_MODE === 'capture'
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
  logger: false,
  debug: false,
});

if (process.env.EMAIL_MODE === 'sandbox-smtp') {
  const recipient = process.env.SANDBOX_EMAIL_RECIPIENT;
  if (process.env.APP_ENV !== 'staging' || process.env.VERCEL_ENV === 'production' ||
      !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(recipient || '')) {
    throw new Error('Sandbox SMTP requires staging and one explicit test recipient');
  }
  const sendMail = transporter.sendMail.bind(transporter);
  transporter.sendMail = async (message) => {
    const result = await sendMail({ ...message, to: recipient, cc: undefined, bcc: undefined,
      envelope: { from: process.env.GMAIL_USER, to: [recipient] },
      subject: `[SANDBOX] ${message.subject}` });
    console.info('Sandbox email accepted by SMTP:', { messageId: result.messageId,
      accepted: result.accepted?.length || 0, rejected: result.rejected?.length || 0 });
    return result;
  };
}

if (process.env.EMAIL_MODE === 'capture') {
  const sendMail = transporter.sendMail.bind(transporter);
  transporter.sendMail = async (message) => {
    const result = await sendMail(message);
    // Local captures are inspectable; Vercel has an ephemeral filesystem, so log metadata only.
    if (!process.env.VERCEL) {
      const fs = require('node:fs/promises');
      const path = require('node:path');
      const directory = path.resolve(__dirname, '../../test-emails');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, `${require('node:crypto').randomUUID()}.json`), result.message);
    }
    console.info('Test email captured (not delivered):', message.subject);
    return result;
  };
}

module.exports = transporter;
