const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildAdminOrderEmail,
  buildOrderConfirmationEmail,
  getCarrierTrackingUrl,
} = require("./emailTemplates");

test("getCarrierTrackingUrl uses Shippo tracking URLs first", () => {
  assert.equal(
    getCarrierTrackingUrl({
      carrier: "USPS",
      trackingNumber: "9400",
      trackingUrl: "https://tracking.example/9400",
    }),
    "https://tracking.example/9400"
  );
});

test("getCarrierTrackingUrl can build UPS and USPS fallback links", () => {
  assert.equal(
    getCarrierTrackingUrl({ carrier: "USPS", trackingNumber: "9400 1234" }),
    "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400%201234"
  );
  assert.equal(
    getCarrierTrackingUrl({ carrier: "UPS", trackingNumber: "1Z999" }),
    "https://www.ups.com/track?tracknum=1Z999"
  );
});

test("buildOrderConfirmationEmail renders one track button per shipment with a link", () => {
  const email = buildOrderConfirmationEmail({
    cartSummary: "- Book x 1 @ $20.00 = $20.00",
    normalizedOrderNote: "Please sign it to Reader.",
    total: 29.04,
    transactionId: "pi_123",
    shippingAddressText: "Reader\n123 Main St\nBrooklyn, NY 11201\nUS",
    shipmentDetails: [
      {
        carrier: "USPS",
        service: "Ground Advantage",
        trackingNumber: "9400",
        trackingUrl: "https://tracking.example/9400",
      },
      {
        carrier: "UPS",
        service: "Ground Saver",
        trackingNumber: "1Z999",
        trackingUrl: "https://tracking.example/1Z999",
      },
    ],
  });

  assert.match(email.html, /Order confirmed!/);
  assert.equal((email.html.match(/Track your package/g) || []).length, 2);
  assert.match(email.html, /https:\/\/tracking\.example\/9400/);
  assert.match(email.html, /https:\/\/tracking\.example\/1Z999/);
  assert.match(email.text, /Tracking URL: https:\/\/tracking\.example\/9400/);
  assert.match(email.text, /Tracking URL: https:\/\/tracking\.example\/1Z999/);
});

test("buildOrderConfirmationEmail renders a fallback when no tracking links exist", () => {
  const email = buildOrderConfirmationEmail({
    cartSummary: "- Book x 1 @ $20.00 = $20.00",
    normalizedOrderNote: "",
    total: 20,
    transactionId: "pi_456",
    shippingAddressText: "Reader\n123 Main St\nBrooklyn, NY 11201\nUS",
    shipmentDetails: [],
  });

  assert.match(email.html, /We will get started on your order as soon as possible/);
  assert.equal((email.html.match(/Track your package/g) || []).length, 0);
  assert.match(email.text, /If you would like a tracking link/);
});

test("buildAdminOrderEmail highlights order summary and fulfillment links", () => {
  const email = buildAdminOrderEmail({
    cartSummary: "- Book x 1 @ $20.00 = $20.00",
    customerEmail: "reader@example.com",
    customerName: "Reader",
    labelUrls: ["https://label.example/1.pdf"],
    normalizedOrderNote: "Please sign it.",
    paymentMethod: "Stripe",
    paypalReviewNote: "",
    shippingAddressText: "Reader\n123 Main St\nBrooklyn, NY 11201\nUS",
    shippingPrice: 9.04,
    total: 29.04,
    trackingUrls: ["https://tracking.example/1"],
    transactionId: "pi_123",
  });

  assert.match(email.html, /New order received/);
  assert.match(email.html, /Purchase details/);
  assert.match(email.html, /Shipping labels/);
  assert.match(email.html, /Tracking links/);
  assert.match(email.text, /Purchase Details:/);
});
