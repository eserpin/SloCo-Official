// server.js

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const pool = require('./config/db'); // Your database configuration

// Import routes
const imagesRoutes = require('./routes/images');
const ordersRoutes = require('./routes/orders');
const requestOtp = require('./routes/requestOtp.js');
const verifyOtp = require('./routes/verifyOtp');
const shippingRoutes = require('./routes/shipping');
const placeDigitalOrder = require('./routes/placeDigitalOrder');
const downloadRoute = require('./routes/download');

// Initialize express
const app = express();

// Load environment variables
dotenv.config();

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(bodyParser.json()); // Parse incoming JSON requests

// Set up routes with updated paths
app.use('/api/images/', imagesRoutes);         // Images routes (with chapter parameter)
app.use('/api/placeOrder', ordersRoutes);              // Place order route
app.use('/api/shippingCalculation', shippingRoutes);   // Shipping calculation route
app.use('/api/request-otp', requestOtp);                // OTP request route
app.use('/api/verify-otp', verifyOtp);                 // OTP verification route
app.use('/api/placeDigitalOrder', placeDigitalOrder); // Digital Order Route
app.use('/api/download', downloadRoute); // Download route
// Root endpoint
app.get('/', (req, res) => {
  res.send('Welcome to the Slow Comics API!');
});

// Handle errors in other routes
app.use((req, res, next) => {
  const error = new Error('Not Found');
  error.status = 404;
  next(error);
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message,
    error: err
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});