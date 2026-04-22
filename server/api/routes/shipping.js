const express = require('express');
const { shippo, addressFrom } = require('../config/shippo'); // Import the Shippo configuration

const router = express.Router();

const normalizeAddress = (address) => {
  const normalized = { ...address };
  if (!normalized.zip && normalized.postal_code) normalized.zip = normalized.postal_code;
  if (!normalized.postal_code && normalized.zip) normalized.postal_code = normalized.zip;
  if (!normalized.country && normalized.country_code) normalized.country = normalized.country_code;
  return normalized;
};

router.post('/', async (req, res) => {
  const { addressTo, bookQuantity, otherPhysicalQuantity, printQuantity, isInternational } = req.body;
  const normalizedAddressTo = addressTo ? normalizeAddress(addressTo) : null;
  console.log('📥 Incoming shipping request:', JSON.stringify(req.body, null, 2));
  console.log('🔄 Normalized addressTo:', JSON.stringify(normalizedAddressTo, null, 2));

  // Validate the required 'addressTo' field
  if (!addressTo) {
    return res.status(400).json({ error: 'AddressTo is required' });
  }

  const shipments = [];
  const customsDeclarations = [];

  try {
    // Books shipment (stickers/bookmarks are included but do not increase shipping weight)
    if (bookQuantity > 0) {
      const bookWeight = 1.6 * bookQuantity;
      let lengthP = "10", widthP = "7.5", heightP = "1";
      if (bookQuantity >= 2 && bookQuantity <= 4) {
        lengthP = "9";
        widthP = "9";
        heightP = "5";
      }

      const parcel = {
        weight: bookWeight.toFixed(2),
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
        addressTo: { ...normalizedAddressTo, name: normalizedAddressTo.name || 'Customer' },
        parcels: [parcel],
        ...(customsDeclaration && { customsDeclaration: customsDeclaration.objectId }),
      });

      if (shipment.error) {
        return res.status(400).json({ error: shipment.error.message });
      }
      shipments.push(shipment);
      console.log(`✅ Shipment created [book]:`, {
        parcel,
        ratesCount: shipment.rates?.length,
        providers: shipment.rates?.map(r => r.provider),
        objectId: shipment.objectId,
      });
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
        addressTo: { ...normalizedAddressTo, name: normalizedAddressTo.name || 'Customer' },
        parcels: [parcel],
        ...(customsDeclaration && { customsDeclaration: customsDeclaration.objectId }),
      });

      if (shipment.error) {
        return res.status(400).json({ error: shipment.error.message });
      }
      shipments.push(shipment);
      console.log(`✅ Shipment created [stickers-only]:`, {
        parcel,
        ratesCount: shipment.rates?.length,
        providers: shipment.rates?.map(r => r.provider),
        objectId: shipment.objectId,
      });
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
          addressTo: { ...normalizedAddressTo, name: normalizedAddressTo.name || 'Customer' },
          parcels: [parcel],
          ...(customsDeclaration && { customsDeclaration: customsDeclaration.objectId }),
        });

        if (shipment.error) {
          return res.status(400).json({ error: shipment.error.message });
        }
        shipments.push(shipment);
        console.log(`✅ Shipment created [print ${i}]:`, {
          parcel,
          ratesCount: shipment.rates?.length,
          providers: shipment.rates?.map(r => r.provider),
          objectId: shipment.objectId,
        });
      }
    }

    if (shipments.length === 0) {
      return res.status(400).json({ error: 'No shipments to calculate' });
    }

    // Get cheapest rates for each shipment
    const cheapestRates = [];
    for (const [index, shipment] of shipments.entries()) {
      const rates = shipment.rates || [];
      if (rates.length === 0) {
        console.error(`❌ Shipment ${index} returned no rates:
`, JSON.stringify(shipment, null, 2));
        return res.status(400).json({ error: 'No rates available for one of the shipments.', shipmentIndex: index });
      }
      const filteredRates = rates.filter(rate => rate.provider === 'UPS' || rate.provider === 'USPS');
      if (filteredRates.length === 0) {
        console.error(`❌ Shipment ${index} has rates but no UPS/USPS providers:`, rates.map(rate => ({ provider: rate.provider, amount: rate.amount })));
        return res.status(400).json({ error: 'No valid UPS or USPS rates found for one of the shipments.', shipmentIndex: index, availableProviders: rates.map(rate => rate.provider) });
      }
      const cheapestRate = filteredRates.reduce((min, current) => parseFloat(current.amount) < parseFloat(min.amount) ? current : min);
      cheapestRates.push(cheapestRate);
    }

    // Calculate total shipping
    let totalShipping = 0;
    if (!isInternational) {
      // Waive all but the first shipment
      if (cheapestRates.length > 0) {
        totalShipping = parseFloat(cheapestRates[0].amount);
      }
    } else {
      totalShipping = cheapestRates.reduce((sum, rate) => sum + parseFloat(rate.amount), 0);
    }

    res.status(200).json({ totalShipping });

  } catch (error) {
    console.error('❌ Error creating shipments or getting rates:');
    console.error('Error message:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
    console.error('Request body was:', JSON.stringify(req.body, null, 2));
    res.status(500).json({
      error: 'An error occurred while processing your request.',
      details: error.message,
      type: error.constructor.name
    });
  }
});

module.exports = router;
