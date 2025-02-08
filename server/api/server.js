const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Shippo = require('shippo').Shippo;
const nodemailer = require('nodemailer'); 
const {Pool} = require('pg');
const path = require('path');
require('dotenv').config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3000;


app.use(bodyParser.json());
app.use(cors());

// Initialize Shippo
const shippo = new Shippo({
  apiKeyHeader: process.env.SHIPPO_TOKEN,
  shippoApiVersion: '2018-02-08',
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Define the addressFrom (Sender's address)
const addressFrom = {
  name: 'Slow Comics Publishing',
  street1: '108 Saddlewood Dr.',
  street3: "",
  city: 'Hillsdale',
  state: 'NJ',
  zip: '07642',
  country: 'US',
  phone: '+1 646 851 3908',
  email: 'slow.comics.publishing@gmail.com',
  isResidential: true,
};

// Route to calculate shipping rates
app.post('/api/shippingCalculation', async (req, res) => {
  const { addressTo, quantity = 1 } = req.body;
  console.log(JSON.stringify(req.body, null, 2));

  if (!addressTo) {
    return res.status(400).json({ error: 'AddressTo is required' });
  }

  try {
    // Step 1: Create shipment
    const shipment = await shippo.shipments.create({
      addressFrom,  // Sender's address
      addressTo,    // Receiver's address
      parcels: [{
        weight: (2.5*quantity).toString(),  // Total weight in lbs
        length: "9.25",  // Adjust based on parcel details
        width: "6.25",
        height: (1 * quantity).toString(),  // Height = 1 * quantity (dynamic based on quantity)
        massUnit: "lb",  // Weight unit in lbs
        distanceUnit: "in"  // Dimension unit in inches
      }],
    });
    
    // Check if shipment creation was successful
    if (shipment.error) {
      return res.status(400).json({ error: shipment.error.message });
    }
    console.log("shipment: " + shipment)
    // Step 2: Get shipping rates for the shipment
    const rates = shipment.rates;
    console.log('Got to step 2 - getting rates.');
    
    if (rates.length === 0) {
      return res.status(400).json({ error: 'No rates available for this shipment.' });
    }

    // Step 3: Filter the rates to include only UPS and USPS
    const filteredRates = rates;
    // .filter(rate => {
    //   return rate.provider === "UPS" || rate.provider === "USPS";
    // });

    // If no rates from UPS or USPS are available, return an error
    if (filteredRates.length === 0) {
      return res.status(400).json({ error: 'No rates available from UPS or USPS for this shipment.' });
    }

    // Sort the filtered rates by amount (cheapest first)
    const sortedRates = filteredRates.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));

    // Get the cheapest 3 rates
    const cheapestRates = sortedRates.slice(0, 3);

    // Step 4: Return the rates to the client
    res.status(200).json(cheapestRates);
  } catch (error) {
    console.error('Error creating shipment or getting rates:', error);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});


// Route to place an order (you can modify this as needed for your business logic)
// Route to place an order
app.post('/api/placeOrder', async (req, res) => {
  const { name, email, quantity, total, transactionId, address } = req.body;

  if (!name || !email || !quantity || !total || !transactionId || !address) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const customsItem = {
  description: "Graphic Novel",
  quantity: quantity,
  netWeight: (2.5*quantity).toFixed(2), // Dynamically calculated
  massUnit: "lb",
  valueAmount: (20 * quantity).toFixed(2), // Dynamically calculated
  valueCurrency: "USD",
  originCountry: "US",
  }
  try {
    const customsDeclaration = await shippo.customsDeclarations.create({
      contentsType: "MERCHANDISE",
      contentsExplanation: "Graphic Novel",
      nonDeliveryOption: "RETURN",
      certify: true,
      certifySigner: "Anil Serpin",
      items: [customsItem],
    });
    console.log("customs declaration: " + JSON.stringify(customsDeclaration));
    const shipment = await shippo.shipments.create({
      addressFrom,  // Sender's address
      addressTo: address,    // Receiver's address
      parcels: [{
        weight: (2.5 * quantity).toString(),  // Total weight in lbs
        length: "9.25",  // Adjust based on parcel details
        width: "6.25",
        height: (1 * quantity).toString(),  // Height = 1 * quantity (dynamic based on quantity)
        massUnit: "lb",  // Weight unit in lbs
        distanceUnit: "in"  // Dimension unit in inches
      }],
      customs_declaration: customsDeclaration.objectId,
      items: [customsItem]
    });

    // Check if shipment creation was successful
    if (shipment.error) {
      return res.status(400).json({ error: shipment.error.message });
    }
    console.log('✅ Shipment created successfully');

    // Step 2: Filter the rates for UPS and USPS only
    const filteredRates = shipment.rates;
    
    // .filter(rate => 
    //   rate.provider === 'UPS' || rate.provider === 'USPS'
    // );

    // If no valid rates are found, return an error
    if (filteredRates.length === 0) {
      return res.status(400).json({ error: 'No valid UPS or USPS rates found' });
    }

    // Step 3: Select the cheapest rate from the filtered rates
    const cheapestRate = filteredRates.reduce((minRate, currentRate) => {
      return parseFloat(currentRate.amount) < parseFloat(minRate.amount) ? currentRate : minRate;
    });

    console.log('✅ Cheapest UPS/USPS rate selected:', cheapestRate);
    console.log("variables: " + cheapestRate.objectId + ", " + shipment.objectId);

    // Step 4: Create a transaction using the cheapest rate
    const transaction = await shippo.transactions.create({
      async: false,  // Process the transaction synchronously
      labelFileType: "PDF_4x6",  // Label file type (PDF, 4x6)
      metadata: `Order ID #${transactionId}`,  // Metadata (e.g., the order ID)
      rate: cheapestRate.objectId,  // Using the object_id of the cheapest rate
    });

    // Check if transaction creation was successful
    if (transaction.error) {
      return res.status(400).json({ error: transaction.error.message });
    }
    console.log('✅ Transaction created successfully:', transaction);

    // Step 5: Save the order to the database
    const query = `
      INSERT INTO orders (transaction_id, name, email, quantity)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const values = [transactionId, name, email, quantity];

    const { rows } = await pool.query(query, values);
    if (rows.length === 0) {
      throw new Error('Order was not saved in the database.');
    }
    console.log('✅ Order saved to database:', rows[0]);

    // Step 6: Send the shipping label via email to slow.comics.publishing@gmail.com
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,  // Access the email from the environment variable
        pass: process.env.GMAIL_APP_PASS,  // Access the password from the environment variable
      },
      logger: true,  // Enable Nodemailer logging
      debug: true,   // More detailed output of the communication with the email server
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: 'slow.comics.publishing@gmail.com',  // Recipient email
      subject: 'Shipping Label for Order #' + transactionId,
      text: 'Please find the attached shipping label for your order: ' + transaction.labelUrl,
    };

    // Convert the email sending function to a Promise-based approach
    const sendEmail = (mailOptions) => {
      return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            reject(error);
          } else {
            resolve(info);
          }
        });
      });
    };

    try {
      await sendEmail(mailOptions);
      console.log('✅ Email sent successfully');
    } catch (error) {
      console.error('❌ Error sending email:', error);
      return res.status(500).json({ error: 'An error occurred while sending the email.' });
    }

    // Step 7: Respond with shipment ID and success message
    res.status(200).json({
      message: 'Order placed successfully! Label created, emailed, and order saved.',
      shipment_id: shipment.objectId,
    });

  } catch (error) {
    console.error('❌ Error creating shipment, label, saving order, or sending email:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'An error occurred while processing your order.' });
    }
  }
});

app.get('/', (req, res) => {
  res.send(`Server is running on port ${PORT}`);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});