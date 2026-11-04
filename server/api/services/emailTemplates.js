const path = require("node:path");
const fs = require("node:fs");

const LOGO_CID = "slow-comics-logo";
const logoPath = path.resolve(__dirname, "..", "assets", "email-logo.png");

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getCarrierTrackingUrl = ({ carrier, trackingNumber, trackingUrl }) => {
  if (trackingUrl) return trackingUrl;
  if (!trackingNumber || trackingNumber === "Not returned yet") return null;

  const normalizedCarrier = String(carrier || "").toUpperCase();
  const encodedTrackingNumber = encodeURIComponent(trackingNumber);

  if (normalizedCarrier === "USPS") {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodedTrackingNumber}`;
  }

  if (normalizedCarrier === "UPS") {
    return `https://www.ups.com/track?tracknum=${encodedTrackingNumber}`;
  }

  return null;
};

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const buildEmailShell = ({ title, preheader, body }) => `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0; padding:0; background:#ffffff; color:#2b2b2b; font-family:Arial, Helvetica, sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; width:100%;">
      <tr>
        <td style="background:#f4e9ea; border-top:12px solid #3e4421; border-bottom:1px solid #c7dcd1; padding:22px 16px; text-align:center;">
          <img src="cid:${LOGO_CID}" alt="Slow Comics" width="132" style="display:block; width:132px; max-width:50%; height:auto; margin:0 auto;">
        </td>
      </tr>
      <tr>
        <td style="padding:36px 16px; background:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; max-width:560px; margin:0 auto;">
            <tr>
              <td>
                ${body}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const getEmailLogoAttachment = () => ({
  filename: "slow-comics-logo.png",
  content: fs.readFileSync(logoPath),
  cid: LOGO_CID,
});

const renderAddressHtml = (shippingAddressText) =>
  escapeHtml(shippingAddressText).replace(/\n/g, "<br>");

const buildOrderConfirmationEmail = ({
  cartSummary,
  normalizedOrderNote,
  shipmentDetails = [],
  shippingAddressText,
  total,
  transactionId,
}) => {
  const trackableShipments = shipmentDetails
    .map((detail, index) => ({
      ...detail,
      index,
      trackingUrl: getCarrierTrackingUrl(detail),
    }))
    .filter((detail) => detail.trackingUrl);
  const hasTrackingLinks = trackableShipments.length > 0;
  const trackingBlocks = hasTrackingLinks
    ? trackableShipments
        .map((detail) => `
          <div style="margin:0 0 18px; padding:0 0 18px; border-bottom:1px solid #e7e0df;">
            <p style="margin:0 0 10px; font-size:13px; color:#555;">Package ${detail.index + 1}${detail.carrier ? ` (${escapeHtml(detail.carrier)})` : ""}</p>
            <a href="${escapeHtml(detail.trackingUrl)}" style="display:inline-block; margin:0 0 14px; padding:14px 22px; background:#3e4421; color:#f4e9ea; text-decoration:none; font-size:14px; font-weight:700; border-radius:5px;">Track your package</a>
            <p style="margin:0 0 8px; font-size:14px; line-height:1.5;"><strong>Tracking number</strong><br>${escapeHtml(detail.trackingNumber || "Not returned yet")}</p>
            <p style="margin:0; font-size:14px; line-height:1.5;"><strong>Service</strong><br>${escapeHtml(detail.service || "Shipping service")}</p>
          </div>
        `)
        .join("")
    : `
      <div style="margin:0 0 26px; padding:18px; background:#f4e9ea; border:1px solid #c7dcd1; border-radius:6px;">
        <p style="margin:0; font-size:14px; line-height:1.6;">We will get started on your order as soon as possible. If you would like a tracking link, reply to this email and we will send it over when it is available.</p>
      </div>
    `;
  const trackingText = hasTrackingLinks
    ? trackableShipments
        .map((detail) => `Package ${detail.index + 1}\nCarrier: ${detail.carrier}\nService: ${detail.service}\nTracking Number: ${detail.trackingNumber || 'Not returned yet'}\nTracking URL: ${detail.trackingUrl}`)
        .join('\n\n')
    : "We will get started on your order as soon as possible. If you would like a tracking link, reply to this email and we will send it over when it is available.";

  const html = buildEmailShell({
    title: "Order Confirmation",
    preheader: "We received your Slow Comics order.",
    body: `
      <p style="margin:0 0 18px; font-size:13px; color:#4a548a;">Order #${escapeHtml(transactionId)}</p>
      <h1 style="margin:0 0 24px; font-size:28px; line-height:1.2; color:#3e4421;">Order confirmed!</h1>
      <p style="margin:0 0 28px; font-size:15px; line-height:1.6;">Thank you for your order. We are excited to send it your way.</p>

      <h2 style="margin:0 0 12px; font-size:16px; color:#3e4421;">Tracking</h2>
      ${trackingBlocks}

      <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Order summary</h2>
      <pre style="margin:0 0 24px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.5; white-space:pre-wrap;">${escapeHtml(cartSummary)}</pre>

      <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Shipping to</h2>
      <p style="margin:0 0 24px; font-size:14px; line-height:1.5;">${renderAddressHtml(shippingAddressText)}</p>

      <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Order notes</h2>
      <p style="margin:0 0 24px; font-size:14px; line-height:1.5;">${escapeHtml(normalizedOrderNote || "None provided")}</p>

      <p style="margin:0; font-size:16px;"><strong>Total charged:</strong> ${escapeHtml(formatCurrency(total))}</p>
    `,
  });

  const text = `Order confirmed!\n\nThank you for your order. We are excited to send it your way.\n\nOrder ID: ${transactionId}\n\nTracking:\n${trackingText}\n\nOrder Summary:\n${cartSummary}\n\nShipping Address:\n${shippingAddressText}\n\nOrder Notes:\n${normalizedOrderNote || 'None provided'}\n\nTotal Charged: ${formatCurrency(total)}\n\nPlease reply to this email with any questions or concerns.`;

  return { html, text };
};

const renderLineItemsHtml = (summaryText) =>
  escapeHtml(summaryText)
    .split("\n")
    .filter(Boolean)
    .map((line) => `<div style="margin:0 0 6px;">${line}</div>`)
    .join("");

const renderLinkListHtml = (items = [], emptyText) => {
  const filteredItems = items.filter(Boolean);

  if (!filteredItems.length) {
    return `<p style="margin:0; font-size:14px; line-height:1.5;">${escapeHtml(emptyText)}</p>`;
  }

  return filteredItems
    .map((item, index) => `
      <p style="margin:0 0 8px; font-size:14px; line-height:1.5;">
        <a href="${escapeHtml(item)}" style="color:#4a548a; text-decoration:underline;">${escapeHtml(`Link ${index + 1}`)}</a>
      </p>
    `)
    .join("");
};

const buildAdminOrderEmail = ({
  cartSummary,
  customerEmail,
  customerName,
  labelUrls,
  normalizedOrderNote,
  paymentMethod,
  paypalReviewNote,
  shippingAddressText,
  shippingPrice,
  total,
  trackingUrls,
  transactionId,
}) => {
  const html = buildEmailShell({
    title: "New Order Received",
    preheader: `New Slow Comics order #${transactionId}`,
    body: `
      <p style="margin:0 0 18px; font-size:13px; color:#4a548a;">Order #${escapeHtml(transactionId)}</p>
      <h1 style="margin:0 0 24px; font-size:28px; line-height:1.2; color:#3e4421;">New order received</h1>
      ${
        paypalReviewNote
          ? `<div style="margin:0 0 24px; padding:14px; background:#f4e9ea; border:1px solid #c7dcd1; border-radius:6px; font-size:14px; line-height:1.5;">${escapeHtml(paypalReviewNote.trim())}</div>`
          : ""
      }

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin:0 0 24px;">
        <tr>
          <td style="padding:14px; background:#f4e9ea; border:1px solid #c7dcd1; border-radius:6px;">
            <p style="margin:0 0 6px; font-size:13px; color:#4a548a;">Customer</p>
            <p style="margin:0; font-size:15px; line-height:1.5;"><strong>${escapeHtml(customerName)}</strong><br>${escapeHtml(customerEmail)}</p>
          </td>
        </tr>
      </table>

      <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Purchase details</h2>
      <div style="margin:0 0 24px; font-size:14px; line-height:1.5;">${renderLineItemsHtml(cartSummary)}</div>

      <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Shipping address</h2>
      <p style="margin:0 0 24px; font-size:14px; line-height:1.5;">${renderAddressHtml(shippingAddressText)}</p>

      <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Order notes</h2>
      <p style="margin:0 0 24px; font-size:14px; line-height:1.5;">${escapeHtml(normalizedOrderNote || "None provided")}</p>

      <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Payment</h2>
      <p style="margin:0 0 24px; font-size:14px; line-height:1.6;">
        <strong>Method:</strong> ${escapeHtml(paymentMethod)}<br>
        <strong>Shipping:</strong> ${escapeHtml(formatCurrency(shippingPrice))}<br>
        <strong>Total charged:</strong> ${escapeHtml(formatCurrency(total))}
      </p>

      <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Shipping labels</h2>
      <div style="margin:0 0 24px;">${renderLinkListHtml(labelUrls, "No label URLs returned.")}</div>

      <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Tracking links</h2>
      <div style="margin:0;">${renderLinkListHtml(trackingUrls, "No tracking URLs returned yet.")}</div>
    `,
  });

  const text = `New order received!\n\nOrder ID: ${transactionId}\nPayment Method: ${paymentMethod}${paypalReviewNote || ''}\nCustomer: ${customerName}\nEmail: ${customerEmail}\n\nShipping Address:\n${shippingAddressText}\n\nPurchase Details:\n${cartSummary}\n\nOrder Notes:\n${normalizedOrderNote || 'None provided'}\n\nShipping Price: ${formatCurrency(shippingPrice)}\nTotal Charged: ${formatCurrency(total)}\n\nShipping Labels: ${labelUrls.filter(Boolean).join(', ') || 'Not returned yet'}\nTracking URLs: ${trackingUrls.filter(Boolean).join(', ') || 'Not returned yet'}`;

  return { html, text };
};

const buildDigitalOrderConfirmationEmail = ({ cartSummary, amountPaidCents, downloadLink, transactionId }) => {
  const amountPaid = `${formatCurrency(amountPaidCents / 100)} USD`;
  return {
    html: buildEmailShell({
      title: 'Your digital copy is ready',
      preheader: 'Thank you for supporting Slow Comics. Your book is ready to download.',
      body: `
        <p style="margin:0 0 18px; font-size:13px; color:#4a548a; overflow-wrap:anywhere;">Order #${escapeHtml(transactionId)}</p>
        <h1 style="margin:0 0 24px; font-size:28px; line-height:1.2; color:#3e4421;">Your digital copy is ready!</h1>
        <p style="margin:0 0 28px; font-size:15px; line-height:1.6;">Thank you for your purchase and for supporting Slow Comics. We hope you enjoy Nandi and the Castle in the Sea.</p>
        <a href="${escapeHtml(downloadLink)}" style="display:inline-block; margin:0 0 22px; padding:14px 22px; background:#3e4421; color:#f4e9ea; text-decoration:none; font-size:14px; font-weight:700; border-radius:5px;">Download your book</a>
        <div style="margin:0 0 28px; padding:18px; background:#f4e9ea; border:1px solid #c7dcd1; border-radius:6px;">
          <p style="margin:0; font-size:14px; line-height:1.6;">Your link includes <strong>4 downloads total</strong> and expires in <strong>1 week</strong>. Save a copy to keep reading anytime.</p>
        </div>
        <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Order summary</h2>
        <div style="margin:0 0 24px; font-size:14px; line-height:1.5;">${renderLineItemsHtml(cartSummary)}</div>
        <p style="margin:0 0 28px; font-size:16px;"><strong>Amount paid:</strong> ${escapeHtml(amountPaid)}</p>
        <p style="margin:0; font-size:14px; line-height:1.6; color:#555;">Need a hand with your download? Reply to this email and we will help.</p>
      `,
    }),
    text: `Thank you for your purchase!\n\nAmount paid: ${amountPaid}\n${cartSummary}\n\nYour link includes 4 downloads total and expires in 1 week.\n\nDownload your book here:\n${downloadLink}\n\nOrder ID: ${transactionId}\n\nNeed a hand with your download? Reply to this email and we will help.`,
  };
};

const buildAdminDigitalOrderEmail = ({ cartSummary, amountPaidCents, downloadLink, transactionId, customerName, customerEmail, paymentMethod, normalizedOrderNote }) => {
  const amountPaid = `${formatCurrency(amountPaidCents / 100)} USD`;
  return {
    html: buildEmailShell({
      title: 'New digital order received',
      preheader: `New Slow Comics digital order — ${amountPaid}`,
      body: `
        <p style="margin:0 0 18px; font-size:13px; color:#4a548a; overflow-wrap:anywhere;">Order #${escapeHtml(transactionId)}</p>
        <h1 style="margin:0 0 24px; font-size:28px; line-height:1.2; color:#3e4421;">New digital order received</h1>
        <div style="margin:0 0 24px; padding:14px; background:#f4e9ea; border:1px solid #c7dcd1; border-radius:6px;">
          <p style="margin:0 0 6px; font-size:13px; color:#4a548a;">Customer</p>
          <p style="margin:0; font-size:15px; line-height:1.5; overflow-wrap:anywhere;"><strong>${escapeHtml(customerName)}</strong><br>${escapeHtml(customerEmail)}</p>
        </div>
        <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Purchase details</h2>
        <div style="margin:0 0 24px; font-size:14px; line-height:1.5;">${renderLineItemsHtml(cartSummary)}</div>
        <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Payment</h2>
        <p style="margin:0 0 24px; font-size:14px; line-height:1.6;"><strong>Method:</strong> ${escapeHtml(paymentMethod)}<br><strong>Amount paid:</strong> ${escapeHtml(amountPaid)}</p>
        <h2 style="margin:0 0 10px; font-size:16px; color:#3e4421;">Order notes</h2>
        <p style="margin:0 0 24px; font-size:14px; line-height:1.5;">${escapeHtml(normalizedOrderNote || 'None provided')}</p>
        <a href="${escapeHtml(downloadLink)}" style="color:#4a548a; font-size:14px; text-decoration:underline;">Customer download link</a>
      `,
    }),
    text: `New digital order received!\n\nOrder ID: ${transactionId}\nPayment Method: ${paymentMethod}\nCustomer: ${customerName}\nEmail: ${customerEmail}\nAmount paid: ${amountPaid}\n\nPurchase Details:\n${cartSummary}\n\nOrder Notes:\n${normalizedOrderNote || 'None provided'}\n\nDownload link sent to customer: ${downloadLink}`,
  };
};

module.exports = {
  buildDigitalOrderConfirmationEmail,
  buildAdminDigitalOrderEmail,
  buildAdminOrderEmail,
  buildOrderConfirmationEmail,
  getEmailLogoAttachment,
  getCarrierTrackingUrl,
};
