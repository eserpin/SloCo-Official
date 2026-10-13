require("dotenv").config();

const Shippo = require("shippo").Shippo;
const { addressFrom } = require("../config/shippo");
const {
  createShipments,
  getCheapestAllowedRate,
  validateShippoAddress,
} = require("../services/shippingFulfillment");

const token = process.env.SHIPPO_TEST_TOKEN;

if (!token) {
  console.error("SHIPPO_TEST_TOKEN is required to run this test label script.");
  console.error("Add your Shippo test token to server/.env as SHIPPO_TEST_TOKEN=shippo_test_...");
  process.exit(1);
}

if (!token.startsWith("shippo_test_")) {
  console.error("Refusing to run: SHIPPO_TEST_TOKEN does not look like a Shippo test token.");
  process.exit(1);
}

const shippo = new Shippo({
  apiKeyHeader: token,
  shippoApiVersion: "2018-02-08",
});

const testAddressTo = {
  name: "Shippo Test Recipient",
  street1: "215 Clayton St",
  city: "San Francisco",
  state: "CA",
  zip: "94117",
  country: "US",
  phone: "+1 555 555 5555",
  email: "slow.comics.publishing@gmail.com",
};

const run = async () => {
  const validatedAddressTo = await validateShippoAddress({
    shippo,
    address: testAddressTo,
    name: testAddressTo.name,
    email: testAddressTo.email,
  });

  console.log("Shippo test address validated successfully.");
  console.log(
    `Validated address: ${validatedAddressTo.street1}, ${validatedAddressTo.city}, ${validatedAddressTo.state} ${validatedAddressTo.zip}, ${validatedAddressTo.country}`
  );

  const [shipment] = await createShipments({
    shippo,
    addressFrom,
    addressTo: validatedAddressTo,
    bookQuantity: 1,
    otherPhysicalQuantity: 1,
    printQuantity: 0,
    isInternational: false,
  });

  if (shipment.error) {
    throw new Error(shipment.error.message || "Shippo returned a shipment error.");
  }

  const cheapestRate = getCheapestAllowedRate(shipment.rates);
  if (!cheapestRate) {
    throw new Error("No USPS or UPS test rates were returned.");
  }

  const transaction = await shippo.transactions.create({
    async: false,
    labelFileType: "PDF_4x6",
    metadata: "Slow Comics Shippo test label",
    rate: cheapestRate.objectId,
  });

  if (transaction.error) {
    throw new Error(transaction.error.message || "Shippo returned a transaction error.");
  }

  console.log("Shippo test label created successfully.");
  console.log(`Shipment: ${shipment.objectId}`);
  console.log(`Carrier: ${cheapestRate.provider}`);
  console.log(`Service: ${cheapestRate.servicelevel?.name || cheapestRate.serviceLevel?.name || "Unknown"}`);
  console.log(`Rate: $${cheapestRate.amount}`);
  console.log(`Transaction: ${transaction.objectId}`);
  console.log(`Tracking number: ${transaction.trackingNumber || "Not returned"}`);
  console.log(`Tracking URL: ${transaction.trackingUrlProvider || "Not returned"}`);
  console.log(`Label URL: ${transaction.labelUrl || "Not returned"}`);
};

run().catch((error) => {
  console.error("Shippo test label failed.");
  console.error(error?.response?.body || error?.response?.data || error.message || error);
  process.exit(1);
});
