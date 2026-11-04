const express = require('express');
const { shippo, addressFrom } = require('../config/shippo');
const {
  createShipments,
  getCheapestAllowedRate,
  normalizeAddress,
  validateShippoAddress,
} = require('../services/shippingFulfillment');

const router = express.Router();
const { getCartDetails } = require('../config/products');

router.post('/', async (req, res) => {
  const { addressTo } = req.body;
  let quantities = req.body;
  if (req.body.cartItems) {
    try { quantities = getCartDetails(req.body.cartItems).quantities; }
    catch (error) { return res.status(400).json({ error: error.message, details: error.message }); }
  }
  const { bookQuantity, otherPhysicalQuantity, printQuantity } = quantities;

  if (!addressTo) {
    return res.status(400).json({ error: 'AddressTo is required' });
  }

  const normalizedAddressTo = normalizeAddress(addressTo);
  const isInternational = normalizedAddressTo.country !== 'US';

  const phone = String(normalizedAddressTo.phone || '').trim();

  if (isInternational && !phone) {
    return res.status(400).json({
      error: 'A phone number is required for international orders so customs declarations can be completed.',
    });
  }

  console.log('📥 Incoming shipping request:', JSON.stringify(req.body, null, 2));
  console.log('🔄 Normalized addressTo:', JSON.stringify(normalizedAddressTo, null, 2));

  try {
    const validatedAddressTo = await validateShippoAddress({
      shippo,
      address: normalizedAddressTo,
    });

    const shipments = await createShipments({
      shippo,
      addressFrom,
      addressTo: validatedAddressTo,
      bookQuantity,
      otherPhysicalQuantity,
      printQuantity,
      isInternational,
    });

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

      const cheapest = getCheapestAllowedRate(rates);
      if (!cheapest) {
        return res.status(400).json({
          error: 'No valid UPS or USPS rates found for one shipment',
        });
      }

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
      shippingBreakdown,
      shipmentCount: cheapestRates.length,
      validatedAddress: validatedAddressTo,
    });

  } catch (error) {
    console.error('❌ Shipping error:', error?.response?.body || error);

    return res.status(error.statusCode || 500).json({
      error: 'Shipping calculation failed',
      details: error.message,
      validationResults: error.validationResults,
    });
  }
});

module.exports = router;
