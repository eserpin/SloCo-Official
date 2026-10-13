const assert = require("node:assert/strict");
const test = require("node:test");
const { buildOrderShipmentRecord } = require("./orderShipments");

test("buildOrderShipmentRecord captures label and tracking details", () => {
  assert.deepEqual(
    buildOrderShipmentRecord({
      order: { id: 42 },
      paymentTransactionId: "pi_123",
      shipment: { objectId: "shipment_123" },
      transaction: {
        objectId: "transaction_123",
        trackingNumber: "TRACK123",
        trackingUrlProvider: "https://carrier.example/TRACK123",
        labelUrl: "https://label.example/label.pdf",
      },
      rate: {
        provider: "USPS",
        servicelevel: { name: "Ground Advantage" },
      },
    }),
    {
      orderId: "42",
      paymentTransactionId: "pi_123",
      shippoShipmentId: "shipment_123",
      shippoTransactionId: "transaction_123",
      carrier: "USPS",
      service: "Ground Advantage",
      trackingNumber: "TRACK123",
      trackingUrl: "https://carrier.example/TRACK123",
      labelUrl: "https://label.example/label.pdf",
      status: "label_created",
      customerTrackingEmailSentAt: null,
      errorDetails: null,
    }
  );
});
