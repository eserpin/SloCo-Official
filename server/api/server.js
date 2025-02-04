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

app.get('/', (req, res) => {
  res.send('Server is working!');
});

app.listen(3000, () => console.log('Server is running on port 3000'));