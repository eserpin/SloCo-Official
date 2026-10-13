let didEnsureOrderShipmentsTable = false;

const getRateServiceName = (rate = {}) =>
  rate.servicelevel?.name || rate.serviceLevel?.name || rate.servicelevel?.token || rate.serviceLevel?.token || null;

const buildOrderShipmentRecord = ({
  order,
  paymentTransactionId,
  shipment,
  transaction,
  rate,
  status = "label_created",
  errorDetails = null,
}) => ({
  orderId: order?.id ? String(order.id) : null,
  paymentTransactionId,
  shippoShipmentId: shipment?.objectId || null,
  shippoTransactionId: transaction?.objectId || null,
  carrier: rate?.provider || null,
  service: getRateServiceName(rate),
  trackingNumber: transaction?.trackingNumber || null,
  trackingUrl: transaction?.trackingUrlProvider || null,
  labelUrl: transaction?.labelUrl || null,
  status,
  customerTrackingEmailSentAt: null,
  errorDetails,
});

const ensureOrderShipmentsTable = async (pool) => {
  if (didEnsureOrderShipmentsTable) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_shipments (
      id SERIAL PRIMARY KEY,
      order_id TEXT,
      payment_transaction_id TEXT NOT NULL,
      shippo_shipment_id TEXT,
      shippo_transaction_id TEXT UNIQUE,
      carrier TEXT,
      service TEXT,
      tracking_number TEXT,
      tracking_url TEXT,
      label_url TEXT,
      status TEXT NOT NULL DEFAULT 'label_created',
      customer_tracking_email_sent_at TIMESTAMPTZ,
      error_details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  didEnsureOrderShipmentsTable = true;
};

const saveOrderShipment = async ({ pool, record }) => {
  await ensureOrderShipmentsTable(pool);

  const query = `
    INSERT INTO order_shipments (
      order_id,
      payment_transaction_id,
      shippo_shipment_id,
      shippo_transaction_id,
      carrier,
      service,
      tracking_number,
      tracking_url,
      label_url,
      status,
      customer_tracking_email_sent_at,
      error_details
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (shippo_transaction_id) DO UPDATE SET
      carrier = EXCLUDED.carrier,
      service = EXCLUDED.service,
      tracking_number = EXCLUDED.tracking_number,
      tracking_url = EXCLUDED.tracking_url,
      label_url = EXCLUDED.label_url,
      status = EXCLUDED.status,
      customer_tracking_email_sent_at = EXCLUDED.customer_tracking_email_sent_at,
      error_details = EXCLUDED.error_details,
      updated_at = NOW()
    RETURNING *;
  `;

  const values = [
    record.orderId,
    record.paymentTransactionId,
    record.shippoShipmentId,
    record.shippoTransactionId,
    record.carrier,
    record.service,
    record.trackingNumber,
    record.trackingUrl,
    record.labelUrl,
    record.status,
    record.customerTrackingEmailSentAt,
    record.errorDetails ? JSON.stringify(record.errorDetails) : null,
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
};

const markCustomerTrackingEmailsSent = async ({ pool, shippoTransactionIds }) => {
  if (!shippoTransactionIds.length) return;
  await ensureOrderShipmentsTable(pool);

  await pool.query(
    `
      UPDATE order_shipments
      SET customer_tracking_email_sent_at = NOW(),
          updated_at = NOW()
      WHERE shippo_transaction_id = ANY($1::text[]);
    `,
    [shippoTransactionIds]
  );
};

module.exports = {
  buildOrderShipmentRecord,
  markCustomerTrackingEmailsSent,
  saveOrderShipment,
};
