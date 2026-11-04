// Read back actual sandbox labels and download their PDFs after a bundle checkout run.
process.env.APP_ENV = 'staging';
const { loadEnvironment, assertSafeEnvironment } = require('../config/environment');
loadEnvironment(); assertSafeEnvironment();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../config/db');
const { shippo } = require('../config/shippo');
const directory = path.resolve(__dirname, '../../sandbox-results');
const runId = process.argv[2];
assert.match(runId || '', /^[a-f0-9-]{36}$/);
const report = JSON.parse(fs.readFileSync(path.join(directory, `${runId}.json`), 'utf8'));
const audit = { runId, auditedAt: new Date().toISOString(), results: [] };
async function main() {
  for (const result of report.results.filter(result => result.paymentId || report.scenarioPayments?.[result.name])) {
    const paymentId = result.paymentId || report.scenarioPayments[result.name];
    const { rows } = await pool.query('SELECT order_id, shippo_transaction_id, label_url, error_details FROM order_shipments WHERE payment_transaction_id = $1 ORDER BY id', [paymentId]);
    for (const [index, row] of rows.entries()) {
      if (!row.label_url) continue;
      try {
        const transaction = await shippo.transactions.get(row.shippo_transaction_id);
        assert.equal(transaction.status, 'SUCCESS');
        assert.equal(transaction.test, true);
        assert.ok(transaction.trackingNumber);
        assert.ok(transaction.metadata.includes(paymentId));
        const response = await fetch(row.label_url, { signal: AbortSignal.timeout(30000) });
        assert.equal(response.status, 200);
        const pdf = Buffer.from(await response.arrayBuffer());
        assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
        const file = `${runId}-order-${row.order_id}-package-${index + 1}.pdf`;
        fs.writeFileSync(path.join(directory, file), pdf);
        audit.results.push({ scenario: result.name, orderId: row.order_id, package: index + 1, status: 'passed',
          shippoTest: true, providerStatus: transaction.status, pdfFile: file, bytes: pdf.length, parcel: row.error_details?.parcel });
      } catch (error) {
        audit.results.push({ scenario: result.name, orderId: row.order_id, package: index + 1, status: 'failed',
          detail: error.code || error.name });
      }
      fs.writeFileSync(path.join(directory, `${runId}-label-audit.json`), JSON.stringify(audit, null, 2));
    }
  }
  console.log(JSON.stringify({ runId, labelsChecked: audit.results.length, passed: audit.results.filter(result => result.status === 'passed').length,
    failed: audit.results.filter(result => result.status === 'failed').length }));
  if (audit.results.some(result => result.status === 'failed')) process.exitCode = 1;
}
main().catch(error => { console.error(`Sandbox label audit failed (${error.code || error.name}).`); process.exitCode = 1; }).finally(() => pool.end());
