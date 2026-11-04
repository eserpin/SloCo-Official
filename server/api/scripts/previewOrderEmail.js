const fs = require("node:fs");
const path = require("node:path");
const {
  buildAdminOrderEmail,
  buildOrderConfirmationEmail,
  getEmailLogoAttachment,
  buildDigitalOrderConfirmationEmail,
  buildAdminDigitalOrderEmail,
} = require("../services/emailTemplates");

const outputDir = path.resolve(__dirname, "..", "..", "email-previews");
const logoAttachment = getEmailLogoAttachment();
const logoDataUri = `data:image/png;base64,${logoAttachment.content.toString("base64")}`;

const inlinePreviewImages = (html) =>
  html.replace(`cid:${logoAttachment.cid}`, logoDataUri);

fs.mkdirSync(outputDir, { recursive: true });

const basePayload = {
  cartSummary: "- Nandi and the Castle in the Sea x 1 @ $20.00 = $20.00\n- Blue Dragon Print x 1 @ $15.00 = $15.00",
  normalizedOrderNote: "Please sign it to Anil.",
  shippingAddressText: "Anil Serpin\n108 Saddlewood Drive\nHillsdale, NJ 07642\nUS",
  total: 44.04,
  transactionId: "TEST-ORDER-123",
};

const withTracking = buildOrderConfirmationEmail({
  ...basePayload,
  shipmentDetails: [
    {
      carrier: "USPS",
      service: "Ground Advantage",
      trackingNumber: "94001361093655782326736",
      trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=94001361093655782326736",
    },
    {
      carrier: "UPS",
      service: "Ground Saver",
      trackingNumber: "1ZXXXXXXXXXXXXXXXX",
      trackingUrl: "https://www.ups.com/track?tracknum=1ZXXXXXXXXXXXXXXXX",
    },
  ],
});

const withoutTracking = buildOrderConfirmationEmail({
  ...basePayload,
  transactionId: "TEST-ORDER-456",
  shipmentDetails: [],
});

const adminEmail = buildAdminOrderEmail({
  cartSummary: basePayload.cartSummary,
  customerEmail: "reader@example.com",
  customerName: "Anil Serpin",
  labelUrls: [
    "https://deliver.goshippo.com/test-label-1.pdf",
    "https://deliver.goshippo.com/test-label-2.pdf",
  ],
  normalizedOrderNote: basePayload.normalizedOrderNote,
  paymentMethod: "Stripe",
  paypalReviewNote: "",
  shippingAddressText: `${basePayload.shippingAddressText}\nPhone: 555-555-5555`,
  shippingPrice: 9.04,
  total: basePayload.total,
  trackingUrls: [
    "https://tools.usps.com/go/TrackConfirmAction?tLabels=94001361093655782326736",
    "https://www.ups.com/track?tracknum=1ZXXXXXXXXXXXXXXXX",
  ],
  transactionId: "TEST-ORDER-123",
});

const withTrackingPath = path.join(outputDir, "order-confirmation-with-tracking.html");
const withoutTrackingPath = path.join(outputDir, "order-confirmation-no-tracking.html");
const adminPath = path.join(outputDir, "admin-order-received.html");

fs.writeFileSync(withTrackingPath, inlinePreviewImages(withTracking.html));
fs.writeFileSync(withoutTrackingPath, inlinePreviewImages(withoutTracking.html));
fs.writeFileSync(adminPath, inlinePreviewImages(adminEmail.html));

const digitalPayload = {
  cartSummary: '- Nandi and the Castle in the Sea (Digital) x 1 @ $3.21 = $3.21',
  amountPaidCents: 321,
  downloadLink: process.env.EMAIL_PREVIEW_DOWNLOAD_URL || '#preview-download',
  transactionId: 'TEST-DIGITAL-321',
};
const digitalPreview = email => inlinePreviewImages(email.html).replace('</body>',
  process.env.EMAIL_PREVIEW_DOWNLOAD_URL ? '</body>' : '<p id="preview-download" style="padding:20px;text-align:center;font:14px Arial;color:#555;">Design preview only. Use the link in your actual order email to download your book.</p></body>');
fs.writeFileSync(path.join(outputDir, 'digital-order-confirmation.html'), digitalPreview(buildDigitalOrderConfirmationEmail(digitalPayload)));
fs.writeFileSync(path.join(outputDir, 'admin-digital-order.html'), digitalPreview(buildAdminDigitalOrderEmail({
  ...digitalPayload, customerName: 'Test Reader', customerEmail: 'reader@example.com',
  paymentMethod: 'Stripe', normalizedOrderNote: '',
})));

console.log(`Wrote ${withTrackingPath}`);
console.log(`Wrote ${withoutTrackingPath}`);
console.log(`Wrote ${adminPath}`);
