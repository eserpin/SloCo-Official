let didEnsureOrderShipmentsTable = false;

const getLabelAttemptStatus = (transaction) => {
  if (!transaction) return 'not_attempted';
  if (!transaction.error && transaction.status === 'SUCCESS' && transaction.labelUrl && transaction.objectId) return 'label_created';
  if (['WAITING', 'QUEUED'].includes(transaction.status)) return 'label_pending';
  return 'label_failed';
};

const getRateServiceName = (rate = {}) =>
  rate.servicelevel?.name || rate.serviceLevel?.name || rate.servicelevel?.token || rate.serviceLevel?.token || null;

const buildOrderShipmentRecord = ({
  order,
  paymentTransactionId,
  shipment,
  transaction,
  rate,
  status = getLabelAttemptStatus(transaction),
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

const saveOrderShipment = async ({ pool, record, recordId }) => {
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

  const updateQuery = `
    UPDATE order_shipments SET
      order_id = $1, payment_transaction_id = $2, shippo_shipment_id = $3,
      shippo_transaction_id = $4, carrier = $5, service = $6, tracking_number = $7,
      tracking_url = $8, label_url = $9, status = $10,
      customer_tracking_email_sent_at = $11, error_details = $12, updated_at = NOW()
    WHERE id = $13 RETURNING *;
  `;
  const { rows } = recordId
    ? await pool.query(updateQuery, [...values, recordId])
    : await pool.query(query, values);
  return rows[0];
};

const getOrderFulfillment = async ({ pool, paymentTransactionId, expectedPackageCount }) => {
  await ensureOrderShipmentsTable(pool);
  const { rows } = await pool.query(
    `SELECT id, status, shippo_shipment_id, shippo_transaction_id, label_url,
            customer_tracking_email_sent_at, error_details
     FROM order_shipments WHERE payment_transaction_id = $1 ORDER BY id`,
    [paymentTransactionId]
  );
  // New attempt records retain the original count; retries cannot lower it by changing the cart.
  const originalCounts = rows.map(row => row.error_details?.expectedPackages).filter(count => Number.isInteger(count) && count > 0);
  const expected = originalCounts.length ? Math.max(...originalCounts) : expectedPackageCount;
  const created = rows.filter(row => row.status === 'label_created' && row.label_url && row.shippo_transaction_id);
  return {
    expectedPackages: expected,
    labelsCreated: created.length,
    complete: expected > 0 && rows.length === expected && created.length === expected && created.every(row => row.customer_tracking_email_sent_at),
    attempts: rows,
  };
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
  getOrderFulfillment,
  getLabelAttemptStatus,
};
