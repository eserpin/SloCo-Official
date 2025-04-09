// routes/order.js
const express = require('express');
const pool = require('../config/db'); // Import the database pool
const { shippo, addressFrom } = require('../config/shippo');
const transporter = require('../config/mailer'); // Import the email transporter from mailer.js

const router = express.Router();

// Place Order Route
router.post('/', async (req, res) => {
  const { name, email, quantity, total, transactionId, address } = req.body;

  if (!name || !email || !quantity || !total || !transactionId || !address) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let lengthP = "10", widthP = "7.5", heightP = "1";
  if (quantity >= 2 && quantity <= 4) {
    lengthP = "9"; // Adjusted for multiple books
    widthP = "9";
    heightP = "5"; // Adjusted height
  }

  const customsItem = {
    description: "Graphic Novel",
    quantity: quantity,
    netWeight: (1.6 * quantity).toFixed(2), // Dynamically calculated weight
    massUnit: "lb",
    valueAmount: (20 * quantity).toFixed(2), // Dynamically calculated value
    valueCurrency: "USD",
    originCountry: "US",
  };

  try {
    // Step 1: Create a customs declaration
    const customsDeclaration = await shippo.customsDeclarations.create({
      contentsType: "MERCHANDISE",
      contentsExplanation: "Graphic Novel",
      nonDeliveryOption: "RETURN",
      certify: true,
      certifySigner: "Anil Serpin",
      items: [customsItem],
    });
    console.log("Customs declaration created:", customsDeclaration);

    // Step 2: Create the shipment

    const shipment = await shippo.shipments.create({
      addressFrom: addressFrom,
      addressTo: address,
      parcels: [{
        weight: (1.6 * quantity).toString(),
        length: lengthP,
        width: widthP,
        height: heightP,
        massUnit: "lb",
        distanceUnit: "in",
      }],
      customsDeclaration: customsDeclaration.objectId,
    });

    // Check for errors in shipment creation
    if (shipment.error) {
      return res.status(400).json({ error: shipment.error.message });
    }
    console.log('✅ Shipment created successfully');

    // Step 3: Select the cheapest rate (UPS/USPS)
    const filteredRates = shipment.rates.filter(rate => rate.provider === 'UPS' || rate.provider === 'USPS');
    if (filteredRates.length === 0) {
      return res.status(400).json({ error: 'No valid UPS or USPS rates found' });
    }

    const cheapestRate = filteredRates.reduce((minRate, currentRate) => {
      return parseFloat(currentRate.amount) < parseFloat(minRate.amount) ? currentRate : minRate;
    });

    console.log('✅ Cheapest rate selected:', cheapestRate);

    // Step 4: Create a transaction (shipping label)
    const transaction = await shippo.transactions.create({
      async: false,
      labelFileType: "PDF_4x6",
      metadata: `Order ID #${transactionId}`,
      rate: cheapestRate.objectId,
    });

    // Check for errors in transaction creation
    if (transaction.error) {
      return res.status(400).json({ error: transaction.error.message });
    }
    console.log('✅ Transaction created successfully:', transaction);

    // Step 5: Save order to the database
    const query = `
      INSERT INTO orders (transaction_id, name, email, quantity)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const values = [transactionId, name, email, quantity, total, JSON.stringify(address)];
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) {
      throw new Error('Order was not saved in the database.');
    }
    console.log('✅ Order saved to database:', rows[0]);

    // Step 6: Send the shipping label to the admin email
    const mailOptionsAdmin = {
      from: process.env.GMAIL_USER,
      to: 'slow.comics.publishing@gmail.com',
      subject: `Shipping Label for Order #${transactionId}`,
      text: `Please find the attached shipping label for your order: ${transaction.labelUrl}`,
    };

    // Send email to the admin
    await transporter.sendMail(mailOptionsAdmin);
    console.log('✅ Admin email sent successfully');

    // Step 7: Send a confirmation email to the customer
    const mailOptionsCustomer = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Order Confirmation: "Nandi and the Castle in the Sea"',
      text: `Thank you for your order! Your order has been received and will be shipped soon. Once it is shipped, you will receive another email with a tracking number.`,
    };

    // Send email to the customer
    await transporter.sendMail(mailOptionsCustomer);
    console.log('✅ Confirmation email sent to customer');

    // Step 8: Respond with shipment ID and success message
    res.status(200).json({
      message: 'Order placed successfully! Label created, emailed, and order saved.',
      shipment_id: shipment.objectId,
    });

  } catch (error) {
    console.error('❌ Error during order processing:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'An error occurred while processing your order.' });
    }
  }
});

module.exports = router;
