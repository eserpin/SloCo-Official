const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildAdminOrderEmail,
  buildOrderConfirmationEmail,
  getCarrierTrackingUrl,
  getEmailLogoAttachment,
  buildDigitalOrderConfirmationEmail,
  buildAdminDigitalOrderEmail,
} = require("./emailTemplates");

test('digital customer receipt includes the exact price, download button and access terms in HTML and text', () => {
  const email = buildDigitalOrderConfirmationEmail({
    amountPaidCents: 321, cartSummary: 'Nandi <Digital> x 1 @ $3.21',
    downloadLink: 'https://shop.example/download/test?full=1&small=2', transactionId: 'pi_digital',
  });
  assert.match(email.html, /cid:slow-comics-logo/);
  assert.match(email.html, /href="https:\/\/shop.example\/download\/test\?full=1&amp;small=2"/);
  assert.match(email.html, /Download your book/);
  assert.match(email.html, /\$3\.21 USD/);
  assert.match(email.html, /4 downloads total/);
  assert.match(email.html, /1 week/);
  assert.match(email.html, /Nandi &lt;Digital&gt;/);
  assert.match(email.text, /Amount paid: \$3\.21 USD/);
  assert.match(email.text, /https:\/\/shop.example\/download\/test\?full=1&small=2/);
  assert.doesNotMatch(email.html, /Shipping to|Track your package/);
});

test('digital admin receipt escapes customer input and includes payment, notes and the customer link', () => {
  const email = buildAdminDigitalOrderEmail({
    amountPaidCents: 101, cartSummary: 'Nandi Digital Copy', downloadLink: 'https://shop.example/download/test',
    transactionId: 'pi_admin', customerName: '<script>reader</script>', customerEmail: 'reader@example.com',
    paymentMethod: 'Stripe', normalizedOrderNote: '<b>Thank you</b>',
  });
  assert.match(email.html, /cid:slow-comics-logo/);
  assert.match(email.html, /\$1\.01 USD/);
  assert.match(email.html, /&lt;script&gt;reader&lt;\/script&gt;/);
  assert.match(email.html, /&lt;b&gt;Thank you&lt;\/b&gt;/);
  assert.match(email.html, /Customer download link/);
  assert.match(email.text, /Amount paid: \$1\.01 USD/);
  assert.doesNotMatch(email.html, /Shipping labels|Shipping address|<script>/);
});

test("email logo is a backend-local PNG included by backend-root deployment tracing", async () => {
  const path = require("node:path");
  const { nodeFileTrace } = require("@vercel/nft");
  const attachment = getEmailLogoAttachment();
  assert.equal(attachment.cid, "slow-comics-logo");
  assert.ok(Buffer.isBuffer(attachment.content));
  assert.equal(attachment.content.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const result = await nodeFileTrace([require.resolve("./emailTemplates")], { base: path.resolve(__dirname, "../..") });
  assert.ok([...result.fileList].some(file => file.replace(/\\/g, "/") === "api/assets/email-logo.png"));
  assert.ok(![...result.fileList].some(file => file.replace(/\\/g, "/").startsWith("../client/")));
});

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
