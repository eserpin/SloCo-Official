const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Shippo = require('shippo').Shippo;
const nodemailer = require('nodemailer');
const {Pool} = require('pg');
const path = require('path');
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
require('dotenv').config({ path: '../.env' });
import {list} from "@vercel/blob";

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

// When Ani comes back change this back
// const addressFrom = {
//   name: 'Slow Comics',
//   street1: '65 Honeck Street',
//   street3: "",
//   city: 'Englewood',
//   state: 'NJ',
//   zip: '07631',
//   country: 'US',
//   phone: '+1 646 851 3908',
//   email: 'slow.comics.publishing@gmail.com',
//   isResidential: false,
// };
const addressFrom = {
    name: 'Slow Comics',
  street1: '913 Northeast 2nd Court',
  street3: "",
  city: 'Hallandale Beach',
  state: 'FL',
  zip: '33009',
  country: 'US',
  phone: '+1 646 851 3908',
  email: 'slow.comics.publishing@gmail.com',
  isResidential: true,
}

// Route to calculate shipping rates
app.post('/api/shippingCalculation', async (req, res) => {
  const { addressTo, quantity = 1 } = req.body;
  console.log(JSON.stringify(req.body, null, 2));

  if (!addressTo) {
    return res.status(400).json({ error: 'AddressTo is required' });
  }

  const customsItem = {
    description: "Graphic Novel",
    quantity: quantity,
    netWeight: (1.6*quantity).toFixed(2), // Dynamically calculated
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
        addressTo: addressTo,    // Receiver's address
        parcels: [{
          weight: (1.6 * quantity).toString(),  // Total weight in lbs
          length: "10",  // Adjust based on parcel details
          width: "7.5",
          height: (1 * quantity).toString(),  // Height = 1 * quantity (dynamic based on quantity)
          massUnit: "lb",  // Weight unit in lbs
          distanceUnit: "in"  // Dimension unit in inches
        }],
        customsDeclaration: customsDeclaration.objectId,
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


// Route to place an order
app.post('/api/placeOrder', async (req, res) => {
  const { name, email, quantity, total, transactionId, address } = req.body;

  if (!name || !email || !quantity || !total || !transactionId || !address) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  let lengthP = "10", widthP = "7.5", heightP = "1";
  if (quantity >= 2 && quantity <= 4) {
    lengthP = "9"; // Adjusted for multiple books
    widthP = "9";
    heightP = "5"; // Adjusted height
  }
  const customsItem = {
  description: "Graphic Novel",
  quantity: quantity,
  netWeight: (1.6*quantity).toFixed(2), // Dynamically calculated
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
        weight: (1.6 * quantity).toString(),  // Total weight in lbs
        length: lengthP,  // Adjust based on parcel details
        width: widthP,
        height: heightP,  // Height = 1 * quantity (dynamic based on quantity)
        massUnit: "lb",  // Weight unit in lbs
        distanceUnit: "in"  // Dimension unit in inches
      }],
      customsDeclaration: customsDeclaration.objectId,
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
    const mailOptionsCustomer = {
      from: process.env.GMAIL_USER,
      to: email,  // Recipient email
      subject: 'Confirmation: Order for "Nandi and the Castle in the Sea" has been placed',
      text: 'Thank you for your order! Your order has been received, and we will ship it as soon as the books are in hand. Once it is shipped, you will receive another email with a tracking number. If you have any questions, feel free to reply to this email.'
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
    try {
      await sendEmail(mailOptionsCustomer);
      console.log('✅ Email sent successfully');
    } catch (error) {
      console.error('❌ Error sending email:', error);
      return res.status(500).json({ error: 'An error occurred while sending the email to the customer.' });
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
// Configure Cloudflare R2 client
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.CF_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CF_ACCESS,
    secretAccessKey: process.env.CF_SECRET,
  },
});

app.get('/api/images/:chapter', async (req, res) => {
  try {
    const { chapter } = req.params;
    if (!chapter) {
      return res.status(400).json({ error: "Chapter number is required" });
    }

    // List objects in the chapter folder
    const params = {
      Bucket: 'nandi',
      Prefix: `${chapter}/`,
    };

    const data = await s3.send(new ListObjectsV2Command(params));

    if (!data.Contents) {
      return res.status(404).json({ error: "No images found for this chapter" });
    }

    // Generate signed URLs for each file
    const signedImageUrls = await Promise.all(
      data.Contents.map(async (file) => {
        const signedUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: 'nandi', Key: file.Key }),
          { expiresIn: 3600 } // URL expires in 1 hour
        );
        return { url: signedUrl, key: file.Key };
      })
    );
    console.log("signed URLs: " + JSON.stringify(signedImageUrls));

    // Sort by numerical page number (assuming file names are '1.jpg', '2.jpg', etc.)
    signedImageUrls.sort((a, b) => {
      const numA = parseInt(a.key.split('/').pop().split('.')[0], 10);
      const numB = parseInt(b.key.split('/').pop().split('.')[0], 10);
      return numA - numB;
    });

    res.status(200).json({ images: signedImageUrls.map(obj => obj.url) });

  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Failed to retrieve images" });
  }
});


const otpStore = {};

// Nodemailer setup (Replace with your email credentials)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

// Request OTP
app.post("/api/request-otp", async (req, res) => {
  const { email } = req.body;
  const lowerEmail = email.toLowerCase();
  try {
    // Check if email exists in orders table
    const result = await pool.query('SELECT * FROM orders WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Email not found in database" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Expires in 5 mins

    // Store OTP in the database
    await pool.query(
      `INSERT INTO otps (email, otp, expires_at) VALUES (LOWER($1), $2, $3)
       ON CONFLICT (email) DO UPDATE SET otp = $2, expires_at = $3`,
      [lowerEmail, otp, expiresAt]
    );

    // Send OTP via email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Slow Comics One-Time-Password",
      text: `Your OTP is: ${otp}. It expires in 5 minutes.`,
    });

    res.json({ message: "OTP sent to email" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred" });
  }
});


// Verify OTP
app.post("/api/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  const lowerEmail = email.toLowerCase();
  console.log("otp: " + otp);
  try {
    // Check if the OTP exists and is still valid
    const result = await pool.query(
      "SELECT * FROM otps WHERE LOWER(email) = LOWER($1) AND otp = $2 AND expires_at > NOW()",
      [lowerEmail, otp]
    );
    console.log(JSON.stringify(result));
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // OTP is valid, delete it after verification
    await pool.query("DELETE FROM otps WHERE LOWER(email) = LOWER($1)", [lowerEmail]);


    res.json({ message: "OTP verified, access granted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred" });
  }
});

app.get('/', (req, res) => {
  res.send(`Server is running on port ${PORT}`);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});