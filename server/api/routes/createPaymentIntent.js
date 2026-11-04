const express = require('express');
const getStripe = require('../config/stripe');
const { getCartDetails, toCents } = require('../config/products');
const pool = require('../config/db');
const { ensureDigitalOrderAmounts } = require('../services/digitalOrderAmounts');

const router = express.Router();

const normalizeAddress = (address = {}) => {
  const normalized = { ...address };
  if (!normalized.zip && normalized.postal_code) normalized.zip = normalized.postal_code;
  if (!normalized.postal_code && normalized.zip) normalized.postal_code = normalized.zip;
  if (normalized.country_code) normalized.country = normalized.country_code;
  delete normalized.country_code;
  return normalized;
};

router.post('/', async (req, res) => {
  const {
    name,
    email,
    currency = 'USD',
    format,
    cartItems,
    address,
    shippingPrice = 0,
  } = req.body;

  if (!name || !email || !cartItems?.length) {
    return res.status(400).json({ error: 'Missing required checkout fields' });
  }

  let cartDetails;
  try { cartDetails = getCartDetails(cartItems); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe is not configured' });
  }

  try {
    const hasPhysicalItems = cartItems.some(item => item.requiresShipping || item.format === 'physical');
    const hasDigitalItems = cartItems.some(item => item.format === 'digital' || item.requiresShipping === false);

    if (hasPhysicalItems && hasDigitalItems) {
      return res.status(400).json({
        error: 'Digital downloads and shipped items must be checked out separately',
      });
    }
    if (hasDigitalItems && currency.toLowerCase() !== 'usd') {
      return res.status(400).json({ error: 'Digital prices must be in USD' });
    }

    if (format === 'physical' && !hasPhysicalItems) {
      return res.status(400).json({ error: 'Physical checkout requires shipped items' });
    }

    if (format === 'digital' && hasPhysicalItems) {
      return res.status(400).json({ error: 'Digital checkout cannot include shipped items' });
    }

    const normalizedAddress = normalizeAddress(address);
    const country = normalizedAddress.country || 'US';
    const isInternational = format === 'physical' && country !== 'US';

    if (format === 'physical' && isInternational && !String(normalizedAddress.phone || '').trim()) {
      return res.status(400).json({
        error: 'A phone number is required for international orders so customs declarations can be completed.',
      });
    }

    const subtotal = cartDetails.subtotal;
    const normalizedShipping = format === 'physical' ? Number(shippingPrice) : 0;
    const lineItems = cartDetails.items
      .map(item => `${item.id}${item.choiceProductId ? '/' + item.choiceProductId : ''}:${item.quantity}`)
      .join(',');

    if (!Number.isFinite(normalizedShipping) || normalizedShipping < 0) {
      return res.status(400).json({ error: 'Invalid shipping price' });
    }

    const amount = toCents(subtotal + normalizedShipping);

    if (amount < 50) {
      return res.status(400).json({ error: 'Order total is too low' });
    }

    // Prepare the amount columns before a customer can pay, so schema failures
    // cannot first appear after their card has already been charged.
    if (hasDigitalItems) await ensureDigitalOrderAmounts(pool);
    const paymentIntent = await getStripe().paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      receipt_email: email,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        ...(hasDigitalItems ? { digitalUnitAmountCents: String(cartDetails.items[0].unitAmountCents) } : {}),
        name,
        email,
        format,
        subtotal: subtotal.toFixed(2),
        shippingPrice: normalizedShipping.toFixed(2),
        total: (subtotal + normalizedShipping).toFixed(2),
        lineItems,
        orderQuantities: JSON.stringify(cartDetails.quantities),
        address: address ? JSON.stringify(normalizedAddress) : '',
      },
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('Stripe PaymentIntent error:', error);
    if (error.type === 'StripeInvalidRequestError' && error.param === 'amount') {
      return res.status(400).json({ error: 'Our payment provider could not process this amount. Please choose another amount or contact us.' });
    }
    res.status(500).json({
      error: 'Could not create payment intent',
      details: error.message,
    });
  }
});

module.exports = router;
