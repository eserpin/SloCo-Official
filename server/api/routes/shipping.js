const express = require('express');
const { shippo, addressFrom } = require('../config/shippo');

const router = express.Router();

const normalizeAddress = (address) => {
  const normalized = { ...address };

  if (!normalized.zip && normalized.postal_code) {
    normalized.zip = normalized.postal_code;
  }
  if (!normalized.postal_code && normalized.zip) {
    normalized.postal_code = normalized.zip;
  }
  if (!normalized.country && normalized.country_code) {
    normalized.country = normalized.country_code;
  }

  return normalized;
};

router.post('/', async (req, res) => {
  const { addressTo, bookQuantity, otherPhysicalQuantity, printQuantity, isInternational } = req.body;

  if (!addressTo) {
    return res.status(400).json({ error: 'AddressTo is required' });
  }

  const normalizedAddressTo = normalizeAddress(addressTo);

  console.log('📥 Incoming shipping request:', JSON.stringify(req.body, null, 2));
  console.log('🔄 Normalized addressTo:', JSON.stringify(normalizedAddressTo, null, 2));

  const shipments = [];
  const shipmentPlan = [];
  try {
    // =========================================================
    // 📦 1. BOOK + STICKERS (ALWAYS TOGETHER IF BOOK EXISTS)
    // =========================================================
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
            netWeight: stickerWeight.toFixed(2),
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
      }
      shipmentPlan.push({
        type: "book",
        quantity: bookQuantity,
        parcel,
        customsDeclaration: customsDeclaration ? customsDeclaration.objectId : null
      });

      const shipment = await shippo.shipments.create({
        addressFrom,
        addressTo: {
          ...normalizedAddressTo,
          name: normalizedAddressTo.name || 'Customer',
        },
        parcels: [parcel],
        ...(customsDeclaration && {
          customsDeclaration: customsDeclaration.objectId,
        }),
      });

      shipments.push(shipment);

      console.log('✅ BOOK shipment created');
    }

    // =========================================================
    // 📦 2. STICKERS ONLY (NO BOOK)
    // =========================================================
    if (bookQuantity === 0 && otherPhysicalQuantity > 0) {
      const stickerWeight = 0.04 * otherPhysicalQuantity;

      const parcel = {
        weight: stickerWeight.toFixed(2),
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
          items: [
            {
              description: "Stickers and Bookmarks",
              quantity: otherPhysicalQuantity,
              netWeight: stickerWeight.toFixed(2),
              massUnit: "lb",
              valueAmount: (10 * otherPhysicalQuantity).toFixed(2),
              valueCurrency: "USD",
              originCountry: "US",
            }
          ],
        });
      }

      const shipment = await shippo.shipments.create({
        addressFrom,
        addressTo: {
          ...normalizedAddressTo,
          name: normalizedAddressTo.name || 'Customer',
        },
        parcels: [parcel],
        ...(customsDeclaration && {
          customsDeclaration: customsDeclaration.objectId,
        }),
      });
      shipmentPlan.push(shipmentPlan.push({
        type: "stickers",
        quantity: otherPhysicalQuantity,
        parcel,
        customsDeclaration: customsDeclaration ? customsDeclaration.objectId : null
      });)
      shipments.push(shipment);

      console.log('✅ STICKERS shipment created');
    }

    // =========================================================
    // 🖼 3. PRINTS (MAX 2 PER SHIPMENT)
    // =========================================================
    if (printQuantity > 0) {
      const numShipments = Math.ceil(printQuantity / 2);

      for (let i = 0; i < numShipments; i++) {
        const quantityInBox = Math.min(2, printQuantity - i * 2);

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
            items: [
              {
                description: "Prints",
                quantity: quantityInBox,
                netWeight: "1",
                massUnit: "lb",
                valueAmount: "15.00",
                valueCurrency: "USD",
                originCountry: "US",
              }
            ],
          });
        }

        const shipment = await shippo.shipments.create({
          addressFrom,
          addressTo: {
            ...normalizedAddressTo,
            name: normalizedAddressTo.name || 'Customer',
          },
          parcels: [parcel],
          ...(customsDeclaration && {
            customsDeclaration: customsDeclaration.objectId,
          }),
        });

        shipments.push(shipment);
        shipmentPlan.push(shipmentPlan.push({
          type: "print",
          quantity: Math.min(2, printQuantity - i * 2),
          parcel,
          customsDeclaration: customsDeclaration ? customsDeclaration.objectId : null
        });)
        console.log(`✅ PRINT shipment ${i + 1} created`);
      }
    }

    // =========================================================
    // 🚨 VALIDATION
    // =========================================================
    if (shipments.length === 0) {
      return res.status(400).json({ error: 'No shipments to calculate' });
    }

    // =========================================================
    // 💰 RATE CALCULATION
    // =========================================================
    const cheapestRates = [];

    for (const shipment of shipments) {
      const rates = shipment.rates || [];

      if (!rates.length) {
        return res.status(400).json({
          error: 'No rates available for one shipment',
        });
      }

      const filteredRates = rates.filter(
        r => r.provider === 'UPS' || r.provider === 'USPS'
      );

      const cheapest = filteredRates.reduce((min, curr) =>
        parseFloat(curr.amount) < parseFloat(min.amount) ? curr : min
      );

      cheapestRates.push(cheapest);
    }

let totalShipping = 0;
let shippingBreakdown = [];

if (!isInternational) {

  const highestRate = cheapestRates.reduce((max, r) =>
    parseFloat(r.amount) > parseFloat(max.amount) ? r : max
  );

  totalShipping = parseFloat(highestRate.amount);

  shippingBreakdown = cheapestRates.map(r => ({
    amount: parseFloat(r.amount),
    included: r.amount === highestRate.amount,
  }));

} else {
  // 🌍 INTERNATIONAL
  // return all shipment costs (no waiving)

  shippingBreakdown = cheapestRates.map(r => ({
    amount: parseFloat(r.amount),
  }));

  totalShipping = shippingBreakdown.reduce(
    (sum, r) => sum + r.amount,
    0
  );
}

    return res.status(200).json({
      totalShipping,
      shipmentPlan,
      shipmentCount: shipmentPlan.length
    });

  } catch (error) {
    console.error('❌ Shipping error:', error?.response?.body || error);

    return res.status(500).json({
      error: 'Shipping calculation failed',
      details: error.message,
    });
  }
});

module.exports = router;