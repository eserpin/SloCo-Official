# Final pre-release review

Reviewed the local fulfillment commit `997f1e8` plus the working tree against the recorded production baseline
`origin/main` (`8f327a9`). No commit, push, deployment, live payment, or production database change was performed.
The GitHub remote was not refreshed in this review. Verdict: hold production until the findings below are addressed.
Subsequent requested fixes addressed all four findings. This does not authorize a production push;
remaining manual/deployment checks are listed in TESTING.md.

## Findings

1. **P1 — Shippo label rejection is treated as successful fulfillment.**
   **Resolved in follow-up:** labels require Shippo `SUCCESS`, a label URL, and transaction ID. Each package
   is recorded before external requests; returned failures/pending statuses and unknown network outcomes
   are persisted and routed to the existing manual-fulfillment alert. Other packages are still attempted.
   `server/api/routes/orders.js:152` checks only `transaction.error`, but the installed Shippo SDK returns
   transaction statuses such as `ERROR`, `WAITING`, and `SUCCESS`. An isolated reproduction returning
   `{ status: 'ERROR', labelUrl: null }` received HTTP 200 with "Labels created" and generated both confirmation
   emails. The new shipment record also defaults to `label_created`. Require a successful transaction with a
   usable label before recording successful fulfillment; route failures through the manual-review response.

2. **P1 — Email logo crosses the separate backend deployment boundary.**
   **Resolved in follow-up:** the logo is now backend-local at `server/api/assets/email-logo.png`, attached
   as a PNG buffer. Both an automated packaging test and the complete backend-root trace include the asset.
   `server/api/services/emailTemplates.js:4` resolves the attachment inside `client/src/images/Logo.png`.
   The installed Vercel file tracer includes that asset when the base is the entire repository but excludes it
   when the base is `server`. The standalone backend can therefore fail sending both order emails after payment
   and label creation. Package a backend-local logo asset and verify the backend-root function artifact.

3. **P1 — Canonical international country codes become US in PayPal checkout.**
   **Resolved in follow-up:** PayPal accepts canonical ISO codes and legacy country names. Six component
   regression cases inspect the actual PayPal create-order payload; all pass.
   `client/src/components/Checkout.jsx:378` uses `countryCodes[address.country] || 'US'`.
   The new address form and Shippo normalization store ISO country codes. Evaluating the actual PayPal
   `createOrder` function with `country: 'CA', country_code: 'CA'` produced `country_code: 'US'`.
   Accept the canonical ISO code as well as the old full-name representation. Test a non-US PayPal address.

4. **P1 — Retry hides an incomplete paid order.**
   **Resolved in follow-up:** retry reads recorded package counts, label statuses, URLs/IDs, and confirmation
   markers. Incomplete orders remain HTTP 202/manual review without repurchasing labels; completed orders
   return success without new labels/emails. This covers sequential retries, not concurrent submissions.
   `server/api/routes/orders.js:93` returns HTTP 200 for any existing order regardless of fulfillment state.
   A reproduction with a saved order followed by a failed label request returned 202 initially, then 200
   "Order already exists" on retry, with no successful label. The frontend treats the second response as
   completed fulfillment. Distinguish fully fulfilled records from paid orders awaiting manual recovery.
   This short-circuit predates the changes, but interacts with the new post-payment persistence and
   frontend 202 handling; it remains a release concern in the current checkout flow.

Reproductions used mocked providers/database/mail and local Express only. No real labels or orders were created.
The ignored diagnostic is `server/sandbox-results/review-checkout-edges.cjs`.

## Verification

- Backend suite: 41 checks passed.
- Optimized frontend build passed.
- Desktop/mobile browser suite: 36 checks passed after making the city-label selector case-insensitive.
  The visible City / Town capitalization was preserved. The final run used two workers after one Chrome
  process crashed during the initial eight-worker run; all 36 checks passed at the lower concurrency.
- Candidate scan: 48 changed/untracked non-ignored files checked; no supplied Stripe, Shippo, or Neon
  credential patterns were found. Ignored local secret files remain excluded.
- Git whitespace check passed.
- Earlier actual Stripe/Shippo/Neon sandbox checks remain documented in SANDBOX_RESULTS.md.
  These passing tests cover success paths and selected failures, not the missing cases reproduced above.

PayPal buyer approval and deployed Vercel preview connectivity remain unverified. This review did not inspect
production environment values or repository branch-protection settings. No implementation fixes were applied
as part of this review; test selectors alone were adjusted for the existing capitalization change.

## Follow-up verification

After the user-requested fixes: 53 backend tests, 6 PayPal payload tests, and 36 desktop/mobile browser tests
passed. Actual Stripe/Shippo/Neon sandbox run `2aa79953-02fe-4130-8460-08154ff107e5` passed all six scenarios,
including successful fulfillment with the new attempt records and safe completed-order retries.
New failed/pending/partial/network/retry cases use mocked providers; they create no actual failed Shippo purchases.
