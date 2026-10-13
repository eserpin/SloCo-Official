const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createShipments,
  getCheapestAllowedRate,
  normalizeAddress,
  validateShippoAddress,
  AddressValidationError,
} = require("./shippingFulfillment");

const addressFrom = {
  name: "Slow Comics",
  street1: "65 Honeck Street",
  city: "Englewood",
  state: "NJ",
  zip: "07631",
  country: "US",
};

const addressTo = {
  name: "Reader",
  street1: "123 Main St",
  city: "Brooklyn",
  state: "NY",
  postal_code: "11201",
  country_code: "US",
};

const createFakeShippo = () => {
  const customsDeclarations = [];
  const shipments = [];
  const addresses = [];

  return {
    calls: {
      addresses,
      customsDeclarations,
      shipments,
    },
    addresses: {
      create: async (payload) => {
        addresses.push(payload);
        return {
          ...payload,
          objectId: `address-${addresses.length}`,
          city: "BROOKLYN",
          zip: payload.zip,
          country: payload.country,
          validationResults: { isValid: true, messages: [] },
        };
      },
    },
    customsDeclarations: {
      create: async (payload) => {
        customsDeclarations.push(payload);
        return { objectId: `customs-${customsDeclarations.length}` };
      },
    },
    shipments: {
      create: async (payload) => {
        shipments.push(payload);
        return {
          objectId: `shipment-${shipments.length}`,
          rates: [
            { provider: "USPS", amount: "8.00", objectId: "rate-usps" },
            { provider: "UPS", amount: "7.50", objectId: "rate-ups" },
            { provider: "DHL", amount: "6.00", objectId: "rate-dhl" },
          ],
        };
      },
    },
  };
};

test("validateShippoAddress asks Shippo to validate and returns the standardized address", async () => {
  const shippo = createFakeShippo();
  const validatedAddress = await validateShippoAddress({
    shippo,
    address: addressTo,
    name: "Reader",
    email: "reader@example.com",
  });

  assert.equal(shippo.calls.addresses.length, 1);
  assert.deepEqual(shippo.calls.addresses[0], {
    name: "Reader",
    company: undefined,
    street1: "123 Main St",
    street2: undefined,
    street3: undefined,
    city: "Brooklyn",
    state: "NY",
    zip: "11201",
    country: "US",
    phone: undefined,
    email: "reader@example.com",
    isResidential: undefined,
    validate: true,
  });
  assert.equal(validatedAddress.city, "BROOKLYN");
  assert.equal(validatedAddress.zip, "11201");
  assert.equal(validatedAddress.postal_code, "11201");
});

test("validateShippoAddress rejects addresses Shippo cannot validate", async () => {
  const shippo = {
    addresses: {
      create: async () => ({
        validationResults: {
          isValid: false,
          messages: [{ text: "House number is missing." }],
        },
      }),
    },
  };

  await assert.rejects(
    () => validateShippoAddress({ shippo, address: addressTo }),
    (error) => {
      assert.equal(error instanceof AddressValidationError, true);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /House number is missing/);
      return true;
    }
  );
});

test("normalizeAddress accepts postal_code and country_code inputs from checkout", () => {
  assert.deepEqual(normalizeAddress(addressTo), {
    name: "Reader",
    street1: "123 Main St",
    city: "Brooklyn",
    state: "NY",
    postal_code: "11201",
    zip: "11201",
    country: "US",
  });
});

test("createShipments builds the book and sticker package used by quotes and orders", async () => {
  const shippo = createFakeShippo();
  const shipments = await createShipments({
    shippo,
    addressFrom,
    addressTo,
    bookQuantity: 2,
    otherPhysicalQuantity: 3,
    printQuantity: 0,
    isInternational: false,
  });

  assert.equal(shipments.length, 1);
  assert.equal(shippo.calls.customsDeclarations.length, 0);
  assert.deepEqual(shippo.calls.shipments[0], {
    addressFrom,
    addressTo: {
      ...normalizeAddress(addressTo),
      name: "Reader",
    },
    parcels: [
      {
        weight: "3.32",
        length: "9",
        width: "9",
        height: "5",
        massUnit: "lb",
        distanceUnit: "in",
      },
    ],
  });
});

test("createShipments builds one print shipment for every two prints", async () => {
  const shippo = createFakeShippo();
  await createShipments({
    shippo,
    addressFrom,
    addressTo,
    bookQuantity: 0,
    otherPhysicalQuantity: 0,
    printQuantity: 3,
    isInternational: false,
  });

  assert.equal(shippo.calls.shipments.length, 2);
  assert.deepEqual(
    shippo.calls.shipments.map((shipment) => shipment.parcels[0]),
    [
      {
        weight: "1",
        length: "20",
        width: "4",
        height: "4",
        massUnit: "lb",
        distanceUnit: "in",
      },
      {
        weight: "1",
        length: "20",
        width: "4",
        height: "4",
        massUnit: "lb",
        distanceUnit: "in",
      },
    ]
  );
});

test("createShipments includes NOEEI customs declarations for international shipments", async () => {
  const shippo = createFakeShippo();
  await createShipments({
    shippo,
    addressFrom,
    addressTo: {
      ...addressTo,
      country_code: "GB",
      country: undefined,
    },
    bookQuantity: 0,
    otherPhysicalQuantity: 2,
    printQuantity: 0,
    isInternational: true,
  });

  assert.equal(shippo.calls.customsDeclarations.length, 1);
  assert.deepEqual(shippo.calls.customsDeclarations[0], {
    contentsType: "MERCHANDISE",
    contentsExplanation: "Stickers and Bookmarks",
    nonDeliveryOption: "RETURN",
    eelPfc: "NOEEI_30_37_a",
    certify: true,
    certifySigner: "Anil Serpin",
    items: [
      {
        description: "Stickers and Bookmarks",
        quantity: 2,
        netWeight: "0.08",
        massUnit: "lb",
        valueAmount: "20.00",
        valueCurrency: "USD",
        originCountry: "US",
      },
    ],
  });
  assert.equal(shippo.calls.shipments[0].customsDeclaration, "customs-1");
});

test("getCheapestAllowedRate ignores unsupported carriers", () => {
  assert.deepEqual(
    getCheapestAllowedRate([
      { provider: "DHL", amount: "1.00", objectId: "dhl" },
      { provider: "UPS", amount: "9.00", objectId: "ups" },
      { provider: "USPS", amount: "8.50", objectId: "usps" },
    ]),
    { provider: "USPS", amount: "8.50", objectId: "usps" }
  );
});
