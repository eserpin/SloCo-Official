const express = require('express');
const { shippo, addressFrom } = require('../config/shippo'); // Import the Shippo configuration

const router = express.Router();

router.post('/api/shippingCalculation', async (req, res) => {
  const { addressTo, quantity = 1 } = req.body;
  console.log(JSON.stringify(req.body, null, 2));

  // Validate the required 'addressTo' field
  if (!addressTo) {
    return res.status(400).json({ error: 'AddressTo is required' });
  }

  // Define the customs item (e.g., a graphic novel)
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
    // Create the customs declaration
    const customsDeclaration = await shippo.customsDeclarations.create({
      contentsType: "MERCHANDISE",
      contentsExplanation: "Graphic Novel",
      nonDeliveryOption: "RETURN",
      certify: true,
      certifySigner: "Anil Serpin",
      items: [customsItem],
    });

    console.log("Customs Declaration: " + JSON.stringify(customsDeclaration));

    // Step 1: Create a shipment with the provided 'from' and 'to' addresses, and customs declaration
    const shipment = await shippo.shipments.create({
      addressFrom,  // Sender's address from the config
      addressTo: addressTo,    // Receiver's address from the request body
      parcels: [{
        weight: (1.6 * quantity).toString(),  // Total weight in lbs
        length: "10",  // Parcel length in inches
        width: "7.5",  // Parcel width in inches
        height: (1 * quantity).toString(),  // Parcel height in inches (dynamic based on quantity)
        massUnit: "lb",  // Weight unit in pounds
        distanceUnit: "in",  // Dimension unit in inches
      }],
      customsDeclaration: customsDeclaration.objectId,  // Attach the customs declaration ID
    });

    // Check if shipment creation was successful
    if (shipment.error) {
      return res.status(400).json({ error: shipment.error.message });
    }

    console.log("Shipment: " + JSON.stringify(shipment));

    // Step 2: Retrieve shipping rates for the shipment
    const rates = shipment.rates;
    console.log('Rates fetched.');

    // If no rates are available, return an error
    if (rates.length === 0) {
      return res.status(400).json({ error: 'No rates available for this shipment.' });
    }

    // Step 3: Filter the rates to include only UPS and USPS providers (if required)
    const filteredRates = rates;
    // Uncomment to filter for specific providers
    // const filteredRates = rates.filter(rate => rate.provider === "UPS" || rate.provider === "USPS");

    // If no filtered rates are available, return an error
    if (filteredRates.length === 0) {
      return res.status(400).json({ error: 'No rates available from UPS or USPS for this shipment.' });
    }

    // Step 4: Sort the filtered rates by amount (cheapest first)
    const sortedRates = filteredRates.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));

    // Get the cheapest 3 rates
    const cheapestRates = sortedRates.slice(0, 3);

    // Step 5: Return the rates to the client
    res.status(200).json(cheapestRates);

  } catch (error) {
    console.error('Error creating shipment or getting rates:', error);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

module.exports = router;
