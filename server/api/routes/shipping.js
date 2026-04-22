const express = require('express');
const { shippo, addressFrom } = require('../config/shippo'); // Import the Shippo configuration

const router = express.Router();

router.post('/', async (req, res) => {
  const { addressTo, bookQuantity, otherPhysicalQuantity, printQuantity, isInternational } = req.body;
  console.log(JSON.stringify(req.body, null, 2));

  // Validate the required 'addressTo' field
  if (!addressTo) {
    return res.status(400).json({ error: 'AddressTo is required' });
  }

  const shipments = [];
  const customsDeclarations = [];

  try {
    // Books shipment
    if (bookQuantity > 0) {
      const weight = (1.6 * bookQuantity).toFixed(2);
      let lengthP = "10", widthP = "7.5", heightP = "1";
      if (bookQuantity >= 2 && bookQuantity <= 4) {
        lengthP = "9";
        widthP = "9";
        heightP = "5";
      }

      const parcel = {
        weight: weight,
        length: lengthP,
        width: widthP,
        height: heightP,
        massUnit: "lb",
        distanceUnit: "in",
      };

      let customsDeclaration = null;
      if (isInternational) {
        customsDeclaration = await shippo.customsDeclarations.create({
          contentsType: "MERCHANDISE",
          contentsExplanation: "Graphic Novel",
          nonDeliveryOption: "RETURN",
          certify: true,
          certifySigner: "Anil Serpin",
          items: [{
            description: "Graphic Novel",
            quantity: bookQuantity,
            netWeight: weight,
            massUnit: "lb",
            valueAmount: (20 * bookQuantity).toFixed(2),
            valueCurrency: "USD",
            originCountry: "US",
          }],
        });
        customsDeclarations.push(customsDeclaration);
      }

      const shipment = await shippo.shipments.create({
        addressFrom,
        addressTo,
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
      const parcel = {
        weight: "0.5",
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
            netWeight: "0.5",
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
        addressTo,
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
          addressTo,
          parcels: [parcel],
          ...(customsDeclaration && { customsDeclaration: customsDeclaration.objectId }),
        });

        if (shipment.error) {
          return res.status(400).json({ error: shipment.error.message });
        }
        shipments.push(shipment);
      }
    }

    if (shipments.length === 0) {
      return res.status(400).json({ error: 'No shipments to calculate' });
    }

    // Get cheapest rates for each shipment
    const cheapestRates = [];
    for (const shipment of shipments) {
      const rates = shipment.rates;
      if (rates.length === 0) {
        return res.status(400).json({ error: 'No rates available for one of the shipments.' });
      }
      const filteredRates = rates.filter(rate => rate.provider === 'UPS' || rate.provider === 'USPS');
      if (filteredRates.length === 0) {
        return res.status(400).json({ error: 'No valid UPS or USPS rates found for one of the shipments.' });
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
    console.error('Error creating shipments or getting rates:', error);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

module.exports = router;
