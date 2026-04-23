// routes/order.js
const express = require('express');
const pool = require('../config/db'); // Import the database pool
const { shippo, addressFrom } = require('../config/shippo');
const transporter = require('../config/mailer'); // Import the email transporter from mailer.js

const router = express.Router();

const normalizeAddress = (address) => {
  const normalized = { ...address };
  if (!normalized.zip && normalized.postal_code) normalized.zip = normalized.postal_code;
  if (!normalized.postal_code && normalized.zip) normalized.postal_code = normalized.zip;
  if (!normalized.country && normalized.country_code) normalized.country = normalized.country_code;
  return normalized;
};

// Place Order Route
router.post('/', async (req, res) => {
  const { name, email, bookQuantity, otherPhysicalQuantity, printQuantity, isInternational, total, transactionId, address, cartItems, shippingPrice } = req.body;
  const normalizedAddress = address ? normalizeAddress(address) : null;

  if (!name || !email || !total || !transactionId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const shipments = [];
  const customsDeclarations = [];
  const labelUrls = [];

  try {
    // Books shipment (stickers/bookmarks are included but do not increase shipping weight)
    if (bookQuantity > 0) {
      const bookWeight = 1.6 * bookQuantity;
      const stickerWeight = 0.04 * otherPhysicalQuantity;
      const totalWeight = bookWeight + stickerWeight;
      let lengthP = "10", widthP = "7.5", heightP = "1";
      if (bookQuantity >= 2 && bookQuantity <= 4) {
        lengthP = "9";
        widthP = "9";
        heightP = "5";
      }

      const parcel = {
        weight: totalWeight.toFixed(2),
        length: lengthP,
        width: widthP,
        height: heightP,
        massUnit: "lb",
        distanceUnit: "in",
      };

      let customsDeclaration = null;
      if (isInternational) {
        const items = [
          {
            description: "Graphic Novel",
            quantity: bookQuantity,
            netWeight: bookWeight.toFixed(2),
            massUnit: "lb",
            valueAmount: (20 * bookQuantity).toFixed(2),
            valueCurrency: "USD",
            originCountry: "US",
          }
        ];

        if (otherPhysicalQuantity > 0) {
          const stickerWeight = (0.04 * otherPhysicalQuantity).toFixed(2);
          items.push({
            description: "Stickers and Bookmarks",
            quantity: otherPhysicalQuantity,
            netWeight: stickerWeight,
            massUnit: "lb",
            valueAmount: (10 * otherPhysicalQuantity).toFixed(2),
            valueCurrency: "USD",
            originCountry: "US",
          });
        }

        customsDeclaration = await shippo.customsDeclarations.create({
          contentsType: "MERCHANDISE",
          contentsExplanation: "Graphic Novel and Stickers/Bookmarks",
          nonDeliveryOption: "RETURN",
          certify: true,
          certifySigner: "Anil Serpin",
          items,
        });
        customsDeclarations.push(customsDeclaration);
      }

      const shipment = await shippo.shipments.create({
        addressFrom,
        addressTo: { ...normalizedAddress, name },
        parcels: [parcel],
        ...(customsDeclaration && { customsDeclaration: customsDeclaration.objectId }),
      });

      if (shipment.error) {
        return res.status(400).json({ error: shipment.error.message });
      }
      shipments.push(shipment);
    }

    // Stickers/bookmarks shipment if no books
    else if (otherPhysicalQuantity > 0) {
      const stickerWeight = (0.04 * otherPhysicalQuantity).toFixed(2);
      const parcel = {
        weight: stickerWeight,
        length: "6.5",
        width: "4.5",
        height: "1",
        massUnit: "lb",
        distanceUnit: "in",
      };

      let customsDeclaration = null;
      if (isInternational) {
        customsDeclaration = await shippo.customsDeclarations.create({
          contentsType: "MERCHANDISE",
          contentsExplanation: "Stickers and Bookmarks",
          nonDeliveryOption: "RETURN",
          certify: true,
          certifySigner: "Anil Serpin",
          items: [{
            description: "Stickers and Bookmarks",
            quantity: otherPhysicalQuantity,
            netWeight: stickerWeight,
            massUnit: "lb",
            valueAmount: "10.00",
            valueCurrency: "USD",
            originCountry: "US",
          }],
        });
        customsDeclarations.push(customsDeclaration);
      }

      const shipment = await shippo.shipments.create({
        addressFrom,
        addressTo: { ...normalizedAddress, name },
        parcels: [parcel],
        ...(customsDeclaration && { customsDeclaration: customsDeclaration.objectId }),
      });

      if (shipment.error) {
        return res.status(400).json({ error: shipment.error.message });
      }
      shipments.push(shipment);
    }

    // Prints shipments
    if (printQuantity > 0) {
      const numShipments = Math.ceil(printQuantity / 2);
      for (let i = 0; i < numShipments; i++) {
        const parcel = {
          weight: "1",
          length: "20",
          width: "4",
          height: "4",
          massUnit: "lb",
          distanceUnit: "in",
        };

        let customsDeclaration = null;
        if (isInternational) {
          customsDeclaration = await shippo.customsDeclarations.create({
            contentsType: "MERCHANDISE",
            contentsExplanation: "Prints",
            nonDeliveryOption: "RETURN",
            certify: true,
            certifySigner: "Anil Serpin",
            items: [{
              description: "Prints",
              quantity: Math.min(2, printQuantity - i * 2),
              netWeight: "1",
              massUnit: "lb",
              valueAmount: "15.00",
              valueCurrency: "USD",
              originCountry: "US",
            }],
          });
          customsDeclarations.push(customsDeclaration);
        }

        const shipment = await shippo.shipments.create({
          addressFrom,
          addressTo: address,
          parcels: [parcel],
          ...(customsDeclaration && { customsDeclaration: customsDeclaration.objectId }),
        });

        if (shipment.error) {
          return res.status(400).json({ error: shipment.error.message });
        }
        shipments.push(shipment);
      }
    }

    // Create transactions for each shipment
    for (const shipment of shipments) {
      const filteredRates = shipment.rates.filter(rate => rate.provider === 'UPS' || rate.provider === 'USPS');
      if (filteredRates.length === 0) {
        return res.status(400).json({ error: 'No valid UPS or USPS rates found' });
      }
      const cheapestRate = filteredRates.reduce((minRate, currentRate) => {
        return parseFloat(currentRate.amount) < parseFloat(minRate.amount) ? currentRate : minRate;
      });

      const transaction = await shippo.transactions.create({
        async: false,
        labelFileType: "PDF_4x6",
        metadata: `Order ID #${transactionId}`,
        rate: cheapestRate.objectId,
      });

      if (transaction.error) {
        return res.status(400).json({ error: transaction.error.message });
      }
      console.log('✅ Transaction created successfully:', transaction);
      labelUrls.push(transaction.labelUrl);
    }

    // Save order to the database
    const query = `
      INSERT INTO orders (transaction_id, name, email, quantity)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const values = [transactionId, name, email, bookQuantity];

    const { rows } = await pool.query(query, values);
    if (rows.length === 0) {
      throw new Error('Order was not saved in the database.');
    }
    console.log('✅ Order saved to database:', rows[0]);

    const cartSummary = (cartItems && cartItems.length)
      ? cartItems.map(item => `- ${item.name} x ${item.quantity} @ $${Number(item.price).toFixed(2)} = $${(Number(item.price) * item.quantity).toFixed(2)}`).join('\n')
      : `Books: ${bookQuantity}\nStickers/Bookmarks: ${otherPhysicalQuantity}\nPrints: ${printQuantity}`;

    const adminText = `New order received!\n\nOrder ID: ${transactionId}\nCustomer: ${name}\nEmail: ${email}\n\nShipping Address:\n${address?.street1 || ''}${address?.apartment ? '\n' + address.apartment : ''}\n${address?.city || ''}, ${address?.state || ''} ${address?.postal_code || address?.zip || ''}\n${address?.country || ''}\nPhone: ${address?.phone || 'N/A'}\n\nPurchase Details:\n${cartSummary}\n\nShipping Price: $${shippingPrice !== undefined && shippingPrice !== null ? Number(shippingPrice).toFixed(2) : '0.00'}\nTotal Charged: $${Number(total).toFixed(2)}\n\nShipping Labels: ${labelUrls.join(', ')}`;

    const mailOptionsAdmin = {
      from: process.env.GMAIL_USER,
      to: 'slow.comics.publishing@gmail.com',
      subject: `Order Received #${transactionId}`,
      text: adminText,
    };

    // Send email to the admin
    await transporter.sendMail(mailOptionsAdmin);
    console.log('✅ Admin email sent successfully');

    // Send a confirmation email to the customer
    const mailOptionsCustomer = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Order Confirmation: "Nandi and the Castle in the Sea"',
      text: `Thank you for your order! Your order has been received and will be shipped soon. Once it is shipped, you will receive another email with a tracking number.`,
    };

    // Send email to the customer
    await transporter.sendMail(mailOptionsCustomer);
    console.log('✅ Confirmation email sent to customer');

    // Respond with success message
    res.status(200).json({
      message: 'Order placed successfully! Labels created, emailed, and order saved.',
    });

  } catch (error) {
    console.error('❌ Error during order processing:');
    console.error('Error message:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
    console.error('Request body was:', JSON.stringify(req.body, null, 2));
    if (!res.headersSent) {
      res.status(500).json({
        error: 'An error occurred while processing your order.',
        details: error.message,
        type: error.constructor.name
      });
    }
  }
});

module.exports = router;
