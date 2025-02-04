// server/server.js
const express = require('express');
const app = express();

// Add routes here
app.get('/', (req, res) => {
  res.send('Server is working!');
});

module.exports = app;
