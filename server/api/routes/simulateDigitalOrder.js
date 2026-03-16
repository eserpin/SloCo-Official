// simulateDigitalOrder.js
const pool = require('../config/db');
const crypto = require('crypto');
require('dotenv').config();
const transporter = require('../config/mailer');

(async () => {
  const name = 'Eren Serpin';
  const email = 'erenserpin@gmail.com';
  const transactionId = `SIM-${Date.now()}`;

  try {
    // Step 1: Insert digital order
    const orderResult = await pool.query(
      `INSERT INTO digital_orders (name, email, transaction_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [name, email, transactionId]
    );

    const orderId = orderResult.rows[0].id;
    console.log('✅ Digital order created with ID:', orderId);

    // Step 2: Generate download token
    const token = crypto.randomBytes(32).toString('hex');

    // Step 3: Insert token with 5 uses
    await pool.query(
      `INSERT INTO download_tokens (token, order_id, uses_left)
       VALUES ($1, $2, 5)`,
      [token, orderId]
    );

    // Step 4: Build the download link
    const downloadLink = `${process.env.BACKEND_URL}api/download/${token}`;
    console.log('🎉 Simulated download link:', downloadLink);
    console.log('⚠️ This link will work for 3 uses and 7 days.');

    // Step 5: Send the email using imported transporter
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your Digital Copy of Nandi and the Castle in the Sea',
      text: `Thank you for participating in the Slow Comics giveaway of *Nandi and the Castle in the Sea*!\n\nHere is a link to your digital copy:\n${downloadLink}\n\nThis link is valid for one week and up to 3 clicks. Enjoy!`,
    });

    console.log('📬 Email sent successfully to', email);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error simulating order:', err);
    process.exit(1);
  }
})();