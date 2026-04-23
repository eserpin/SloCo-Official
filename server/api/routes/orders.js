// routes/order.js
const express = require('express');
const pool = require('../config/db');
const { shippo, addressFrom } = require('../config/shippo');
const transporter = require('../config/mailer');

const router = express.Router();

const normalizeAddress = (address) => {
  const normalized = { ...address };
  if (!normalized.zip && normalized.postal_code) normalized.zip = normalized.postal_code;
  if (!normalized.postal_code && normalized.zip) normalized.postal_code = normalized.zip;
  if (!normalized.country && normalized.country_code) normalized.country = normalized.country_code;
  return normalized;
};

// async worker (runs AFTER response)
const processOrderAsync = async ({
  name,
  email,
  bookQuantity,
  otherPhysicalQuantity,
  printQuantity,
  isInternational,
  total,
  transactionId,
  address,
  cartItems,
  shippingPrice
}) => {
  const normalizedAddress = address ? normalizeAddress(address) : null;

  const shipments = [];
  const customsDeclarations = [];
  const labelUrls = [];

  try {
    // ---------------- BOOKS ----------------
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
          items.push({
            description: "Stickers and Bookmarks",
            quantity: otherPhysicalQuantity,
            netWeight: (0.04 * otherPhysicalQuantity).toFixed(2),
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

      shipments.push(shipment);
    }

    // ---------------- STICKERS ONLY ----------------
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

      shipments.push(shipment);
    }

    // ---------------- PRINTS ----------------
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
          addressTo: { ...normalizedAddress, name },
          parcels: [parcel],
          ...(customsDeclaration && { customsDeclaration: customsDeclaration.objectId }),
        });

        shipments.push(shipment);
      }
    }

    // ---------------- LABELS ----------------
    for (const shipment of shipments) {
      const filteredRates = shipment.rates.filter(
        r => r.provider === "UPS" || r.provider === "USPS"
      );

      if (!filteredRates.length) continue;

      const cheapestRate = filteredRates.reduce((a, b) =>
        parseFloat(a.amount) < parseFloat(b.amount) ? a : b
      );

      const transaction = await shippo.transactions.create({
        async: false,
        labelFileType: "PDF_4x6",
        metadata: `Order ID #${transactionId}`,
        rate: cheapestRate.objectId,
      });

      labelUrls.push(transaction.labelUrl);
    }

    // ---------------- DB ----------------
    await pool.query(
      `INSERT INTO orders (transaction_id, name, email, quantity)
       VALUES ($1, $2, $3, $4)`,
      [transactionId, name, email, bookQuantity]
    );

    // ---------------- EMAIL ----------------
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: 'slow.comics.publishing@gmail.com',
      subject: `Order Received #${transactionId}`,
      text: `Order complete. Labels:\n${labelUrls.join("\n")}`
    });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Order Confirmation",
      text: "Your order has been received."
    });

  } catch (err) {
    console.error("Background order error:", err);
  }
};

// MAIN ROUTE
router.post('/', async (req, res) => {
  const {
    name,
    email,
    bookQuantity,
    otherPhysicalQuantity,
    printQuantity,
    isInternational,
    total,
    transactionId,
    address,
    cartItems,
    shippingPrice
  } = req.body;

  if (!name || !email || !total || !transactionId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // respond immediately to avoid Vercel timeout
  res.status(200).json({
    message: "Order received. Processing in background.",
    transactionId
  });

  // run heavy work AFTER response
  processOrderAsync({
    name,
    email,
    bookQuantity,
    otherPhysicalQuantity,
    printQuantity,
    isInternational,
    total,
    transactionId,
    address,
    cartItems,
    shippingPrice
  });
});

module.exports = router;