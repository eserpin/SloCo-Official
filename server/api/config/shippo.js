const Shippo = require('shippo').Shippo;

const shippo = new Shippo({
  apiKeyHeader: process.env.SHIPPO_TOKEN, // Your Shippo API Token from environment variables
  shippoApiVersion: '2018-02-08', // Use the appropriate Shippo API version
});

// Default address for shipments
const addressFrom = {
  name: 'Slow Comics',
  street1: '65 Honeck Street',
  street3: '',
  city: 'Englewood',
  state: 'NJ',
  zip: '07631',
  country: 'US',
  phone: '+1 646 851 3908',
  email: 'slow.comics.publishing@gmail.com',
  isResidential: false,
};

module.exports = { shippo, addressFrom };
