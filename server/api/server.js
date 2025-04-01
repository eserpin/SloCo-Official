// server.js

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const pool = require('./config/db'); // Your database configuration

// Import routes
const imagesRoutes = require('./routes/images');
const ordersRoutes = require('./routes/orders');
const otpRoutes = require('./routes/otpRoutes');
const shippingRoutes = require('./routes/shipping');

// Initialize express
const app = express();

// Load environment variables
dotenv.config();

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(bodyParser.json()); // Parse incoming JSON requests

// Set up routes
app.use('/api/images', imagesRoutes);   // Images routes
app.use('/api/orders', ordersRoutes);   // Orders routes
app.use('/api/otp', otpRoutes);         // OTP routes
app.use('/api/shipping', shippingRoutes); // Shipping routes

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
