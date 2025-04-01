// config/mailer.js
const nodemailer = require('nodemailer');

// Create reusable transporter object using Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
  logger: true,  // Enables detailed log of the communication with the email server
  debug: true,   // More detailed output
});

module.exports = transporter;
