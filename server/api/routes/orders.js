const { recordNewsletterConsent } = require('../services/newsletter');
const { acquireOrderProcessingLock } = require('../services/orderProcessingLock');
// routes/order.js
const express = require('express');
const pool = require('../config/db'); // Import the database pool
const { shippo, addressFrom } = require('../config/shippo');
const transporter = require('../config/mailer'); // Import the email transporter from mailer.js
const getStripe = require('../config/stripe');
const { getSubtotal, getCartDetails, getCartSummary, toCents } = require('../config/products');
const {
  createShipments,
  getShipmentConfigs,
  getCheapestAllowedRate,
  normalizeAddress,
  validateShippoAddress,
} = require('../services/shippingFulfillment');
const {
  buildOrderShipmentRecord,
  markCustomerTrackingEmailsSent,
  saveOrderShipment,
  getOrderFulfillment,
  getLabelAttemptStatus,
} = require('../services/orderShipments');
const {
  buildAdminOrderEmail,
  buildOrderConfirmationEmail,
  getEmailLogoAttachment,
} = require('../services/emailTemplates');

const router = express.Router();

const serializeError = (error) => ({
  name: error?.name,
  message: error?.message,
  status: error?.status || error?.statusCode,
  code: error?.code,
  response: error?.response?.body || error?.response?.data || error?.response,
  details: error?.details,
  stack: error?.stack,
});

const verifyPayment = async ({ transactionId, total, cartItems, shippingPrice, paymentProvider }) => {
  if (!transactionId || typeof transactionId !== 'string') {
    throw new Error('Invalid payment transaction');
  }

  if (cartItems?.some(item => item.format === 'digital' || item.requiresShipping === false)) {
    throw new Error('Digital downloads must be checked out separately from shipped items');
  }

  const expectedTotal = getSubtotal(cartItems || []) + Number(shippingPrice || 0);

  if (toCents(total) !== toCents(expectedTotal)) {
    throw new Error('Order total does not match cart subtotal and shipping');
  }

  if (paymentProvider === 'paypal' || !transactionId.startsWith('pi_')) {
    return { id: transactionId, paymentProvider: 'paypal' };
  }

  const paymentIntent = await getStripe().paymentIntents.retrieve(transactionId);

  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`Payment has not succeeded. Current status: ${paymentIntent.status}`);
  }

  if (paymentIntent.amount_received < toCents(total)) {
    throw new Error('Payment amount is less than the order total');
  }

  return paymentIntent;
};

// Place Order Route
router.post('/', async (req, res) => {
  const { name, email, total, transactionId, address, shippingPrice, paymentProvider, orderNote } = req.body;
  let details;
  try { details = getCartDetails(req.body.cartItems); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const { items: cartItems, quantities: { bookQuantity, otherPhysicalQuantity, printQuantity } } = details;
  let normalizedAddress = address ? normalizeAddress(address) : null;
  const isInternational = normalizedAddress?.country !== 'US';
  const normalizedOrderNote = String(orderNote || '').trim();

  if (!name || !email || !total || !transactionId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const labelUrls = [];
  const trackingUrls = [];
  const shipmentDetails = [];
  const shippoTransactionIds = [];
  const packageConfigs = getShipmentConfigs({ bookQuantity, otherPhysicalQuantity, printQuantity });
  const attempts = [];
  let stage = 'order_recording';
  let savedOrder = null;
  let releaseProcessingLock;
  const respond = async (status, body) => {
    if (releaseProcessingLock) {
      const release = releaseProcessingLock;
      releaseProcessingLock = null;
      await release();
    }
    return res.status(status).json(body);
  };

  const persistAttempt = async (index, updates) => {
    const previous = attempts[index];
    const record = { ...previous, ...updates };
    const saved = await saveOrderShipment({ pool, record, recordId: previous?.id });
    if (!saved?.id) throw new Error(`Could not record label attempt for package ${index + 1}.`);
    attempts[index] = { ...record, id: saved.id };
  };

  try {
    await verifyPayment({ transactionId, total, cartItems, shippingPrice, paymentProvider });
    releaseProcessingLock = await acquireOrderProcessingLock({ pool, transactionId });
    if (!releaseProcessingLock) {
      return res.status(409).json({ error: 'This payment is already being processed. Please wait before retrying. If this persists, contact us.', code: 'ORDER_PROCESSING' });
    }

    const existingOrder = await pool.query(
      'SELECT * FROM orders WHERE transaction_id = $1 LIMIT 1',
      [transactionId]
    );

    if (existingOrder.rows.length > 0) {
      savedOrder = existingOrder.rows[0];
      await recordNewsletterConsent({ optedIn: req.body.newsletterOptIn,
        email: savedOrder.email || email, name: savedOrder.name || name, transactionId, source: 'physical' });
      const fulfillment = await getOrderFulfillment({ pool, paymentTransactionId: transactionId, expectedPackageCount: packageConfigs.length });
      if (!fulfillment.complete) {
        return await respond(202, {
          error: 'Payment and order were recorded, but fulfillment needs manual review.',
          orderRecorded: true,
          orderId: savedOrder.id,
          fulfillmentStatus: 'manual_review',
          expectedPackages: fulfillment.expectedPackages,
          labelsCreated: fulfillment.labelsCreated,
        });
      }
      return await respond(200, {
        message: 'Order already exists for this payment.',
        order: existingOrder.rows[0],
        fulfillmentStatus: 'fulfilled',
      });
    }

    const query = `
      INSERT INTO orders (transaction_id, name, email, quantity)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const values = [transactionId, name, email, bookQuantity];

    const { rows } = await pool.query(query, values);
    if (rows.length === 0) {
      throw new Error('Order was not saved in the database.');
    }
    savedOrder = rows[0];
    await recordNewsletterConsent({ optedIn: req.body.newsletterOptIn,
      email, name, transactionId, source: 'physical' });
    console.log('✅ Order saved to database:', savedOrder);

    if (!packageConfigs.length) throw new Error('No packages were provided for this physical order.');
    // Record every expected package before contacting Shippo. A timeout/crash cannot hide an attempt.
    for (let index = 0; index < packageConfigs.length; index++) {
      await persistAttempt(index, buildOrderShipmentRecord({
        order: savedOrder,
        paymentTransactionId: transactionId,
        status: 'not_attempted',
        errorDetails: { packageIndex: index + 1, expectedPackages: packageConfigs.length, parcel: packageConfigs[index].parcel,
          destination: normalizedAddress, cartItems, orderNote: normalizedOrderNote, stage: 'address_validation' },
      }));
    }
    stage = 'address_validation';
    normalizedAddress = await validateShippoAddress({
      shippo,
      address: normalizedAddress,
      name,
      email,
    });

    stage = 'shipment_creation';
    const shipments = await createShipments({
      shippo,
      addressFrom,
      addressTo: normalizedAddress,
      name,
      bookQuantity,
      otherPhysicalQuantity,
      printQuantity,
      isInternational,
      onShipmentCreated: async (shipment, index) => {
        await persistAttempt(index, {
          shippoShipmentId: shipment.objectId || null,
          errorDetails: { ...attempts[index].errorDetails, destination: normalizedAddress, stage: 'rate_selection' },
        });
      },
    });

    // Create transactions for each shipment
    stage = 'label_purchase';
    for (let i = 0; i < shipments.length; i++) {
      const shipment = shipments[i];
      let cheapestRate;
      let purchaseStarted = false;
      let transaction;
      try {
        cheapestRate = getCheapestAllowedRate(shipment.rates);
        if (shipment.error) throw new Error(shipment.error.message || 'Shippo shipment creation failed.');
        if (!cheapestRate) throw new Error('No valid UPS or USPS rates found for this package.');
        await persistAttempt(i, {
          carrier: cheapestRate.provider,
          service: cheapestRate.servicelevel?.name || cheapestRate.serviceLevel?.name || 'Shipping service',
          status: 'label_attempting',
          errorDetails: { ...attempts[i].errorDetails, stage: 'label_purchase' },
        });
        purchaseStarted = true;
        transaction = await shippo.transactions.create({
          async: false,
          labelFileType: 'PDF_4x6',
          metadata: `Order ID #${transactionId} Package ${i + 1}/${shipments.length}`,
          rate: cheapestRate.objectId,
        });
        const labelStatus = getLabelAttemptStatus(transaction);
        await persistAttempt(i, buildOrderShipmentRecord({
          order: savedOrder,
          paymentTransactionId: transactionId,
          shipment,
          transaction,
          rate: cheapestRate,
          status: labelStatus,
          errorDetails: { ...attempts[i].errorDetails, shippoStatus: transaction.status || null,
            messages: transaction.messages || [], error: transaction.error?.message || null,
            ...(labelStatus !== 'label_created' ? { reason: `Shippo label status: ${transaction.status || 'missing'}${transaction.labelUrl ? '' : '; no label URL returned'}` } : {}),
          },
        }));
        if (labelStatus !== 'label_created') continue;
        labelUrls.push(transaction.labelUrl);
        if (transaction.trackingUrlProvider) trackingUrls.push(transaction.trackingUrlProvider);
        shippoTransactionIds.push(transaction.objectId);
        shipmentDetails.push({
          carrier: cheapestRate.provider,
          service: attempts[i].service,
          trackingNumber: transaction.trackingNumber || null,
          trackingUrl: transaction.trackingUrlProvider || null,
        });
      } catch (error) {
        // A network failure may occur after Shippo accepted the purchase. Never blindly repurchase.
        await persistAttempt(i, {
          ...(transaction ? { shippoTransactionId: transaction.objectId || null, labelUrl: transaction.labelUrl || null } : {}),
          status: purchaseStarted ? 'label_unknown' : 'label_failed',
          errorDetails: { ...attempts[i].errorDetails, stage: purchaseStarted ? 'label_purchase' : 'rate_selection',
            shippoStatus: transaction?.status || null, messages: transaction?.messages || [], reason: error.message, code: error.code || null },
        });
      }
    }

    if (attempts.some(attempt => attempt.status !== 'label_created')) {
      throw new Error(`${labelUrls.length} of ${packageConfigs.length} package labels were created. Review the recorded Shippo attempts before retrying labels.`);
    }
    stage = 'confirmation_email';

    const cartSummary = getCartSummary(cartItems);
    const shippingAddressText = `${normalizedAddress?.street1 || ''}${normalizedAddress?.street2 ? '\n' + normalizedAddress.street2 : ''}\n${normalizedAddress?.city || ''}, ${normalizedAddress?.state || ''} ${normalizedAddress?.postal_code || normalizedAddress?.zip || ''}\n${normalizedAddress?.country || ''}`;

    const paymentMethod = paymentProvider === 'paypal' ? 'PayPal' : 'Stripe';
    const paypalReviewNote = paymentProvider === 'paypal'
      ? '\nManual review required: confirm this PayPal payment before shipping.\n'
      : '';
    const adminEmail = buildAdminOrderEmail({
      cartSummary,
      customerEmail: email,
      customerName: name,
      labelUrls,
      normalizedOrderNote,
      paymentMethod,
      paypalReviewNote,
      shippingAddressText: `${shippingAddressText}\nPhone: ${normalizedAddress?.phone || 'N/A'}`,
      shippingPrice,
      total,
      trackingUrls,
      transactionId,
    });

    const mailOptionsAdmin = {
      from: process.env.GMAIL_USER,
      to: 'slow.comics.publishing@gmail.com',
      subject: `Order Received #${transactionId}`,
      text: adminEmail.text,
      html: adminEmail.html,
      attachments: [getEmailLogoAttachment()],
    };

    // Send email to the admin
    await transporter.sendMail(mailOptionsAdmin);
    console.log('✅ Admin email sent successfully');

    // Send a confirmation email to the customer
    const confirmationEmail = buildOrderConfirmationEmail({
      cartSummary,
      normalizedOrderNote,
      shipmentDetails,
      shippingAddressText,
      total,
      transactionId,
    });
    const mailOptionsCustomer = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Order Confirmation: "Nandi and the Castle in the Sea"',
      text: confirmationEmail.text,
      html: confirmationEmail.html,
      attachments: [getEmailLogoAttachment()],
    };

    // Send email to the customer
    await transporter.sendMail(mailOptionsCustomer);
    console.log('✅ Confirmation email sent to customer');

    if (shipmentDetails.length > 0) {
      await markCustomerTrackingEmailsSent({ pool, shippoTransactionIds });
      console.log('✅ Tracking details included in confirmation email');
    }

    // Respond with success message
    await respond(200, {
      message: 'Order placed successfully! Labels created, emailed, and order saved.',
      fulfillmentStatus: 'fulfilled',
    });

  } catch (error) {
    console.error('❌ Error during order processing:');
    console.error('Error message:', error.message);
    console.error('Full error:', JSON.stringify(serializeError(error), null, 2));
    console.error('Request body was:', JSON.stringify(req.body, null, 2));
    if (savedOrder) {
      // Preserve failures before purchase too: these have no guaranteed Shippo dashboard record.
      for (let index = 0; index < attempts.length; index++) {
        if (attempts[index].status === 'not_attempted') {
          try {
            await persistAttempt(index, { errorDetails: { ...attempts[index].errorDetails, stage, reason: error.message } });
          } catch (saveError) { console.error('Could not update shipment attempt:', saveError.message); }
        }
      }
      const attemptSummary = attempts.map((attempt, index) => {
        const info = attempt.errorDetails || {};
        const parcel = info.parcel || {};
        const messages = (info.messages || []).map(message => message.text || message.message || message.code).filter(Boolean).join('; ');
        return `Package ${index + 1}/${packageConfigs.length}: ${attempt.status}\nParcel: ${parcel.length || '?'} x ${parcel.width || '?'} x ${parcel.height || '?'} ${parcel.distanceUnit || ''}, ${parcel.weight || '?'} ${parcel.massUnit || ''}\nShippo shipment: ${attempt.shippoShipmentId || 'not created'}\nShippo transaction: ${attempt.shippoTransactionId || 'not returned; check Shippo before repurchasing'}\nShippo status: ${info.shippoStatus || 'not returned'}\nLabel: ${attempt.labelUrl || 'not available'}\nDetails: ${info.reason || messages || 'none'}${messages ? '\nCarrier messages: ' + messages : ''}`;
      }).join('\n\n');
      try {
        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: 'slow.comics.publishing@gmail.com',
          subject: `Manual Fulfillment Needed #${transactionId}`,
          text: `Payment and order were recorded, but automatic fulfillment needs review.\n\nOrder ID: ${transactionId}\nCustomer: ${name}\nEmail: ${email}\nStage: ${stage}\nReason: ${error.message}\n\nShipping address:\n${normalizedAddress?.street1 || ''}\n${normalizedAddress?.street2 || normalizedAddress?.apartment || ''}\n${normalizedAddress?.city || ''}, ${normalizedAddress?.state || ''} ${normalizedAddress?.zip || normalizedAddress?.postal_code || ''}\n${normalizedAddress?.country || ''}\nPhone: ${normalizedAddress?.phone || 'Not provided'}\n\nOrder notes: ${normalizedOrderNote || 'None'}\n\n${attemptSummary || 'No package attempts could be saved. Check the order and Shippo before buying labels.'}\n\nKeep any successful labels. Do not charge the customer again or repurchase labels without checking Shippo.`,
        });
      } catch (mailError) {
        console.error('Manual fulfillment alert failed:', mailError);
      }
    }
    if (!res.headersSent) {
      await respond(savedOrder ? 202 : error.statusCode || 500, {
        error: savedOrder
          ? 'Payment and order were recorded, but fulfillment needs manual review.'
          : 'An error occurred while processing your order.',
        details: error.message,
        validationResults: error.validationResults,
        type: error.constructor.name,
        ...(savedOrder ? { orderRecorded: true, orderId: savedOrder.id, fulfillmentStatus: 'manual_review',
          expectedPackages: packageConfigs.length, labelsCreated: attempts.filter(attempt => attempt.status === 'label_created').length } : {})
      });
    }
  } finally {
    if (releaseProcessingLock) {
      try { await releaseProcessingLock(); }
      catch { console.error('Order processing claim needs review:', transactionId); }
    }
  }
});

module.exports = router;
