# Local checks and isolated staging

Production deploys from `main`. Do not push or merge to `main` until the release checklist passes.
The existing fulfillment commit is `997f1e8`. The working tree also includes an address-entry redesign:
editable structured fields, native browser autofill, and optional Google suggestions.

## Repeatable automated checks (no secrets)

Use Node 22 LTS or newer. From the repository root:

```powershell
npm ci
npm ci --prefix server
npm ci --prefix client
npx playwright install chromium
npm run check
```

On Linux CI, install browsers with `npx playwright install --with-deps chromium`.
Native address-autofill tests need the full browser rather than Playwright's lightweight headless shell.
On Windows the suite uses installed Google Chrome; Linux CI uses full Chromium.
Set `PLAYWRIGHT_CHANNEL` to override the browser channel when necessary.
Individual commands are `npm test`, `npm run test:build`, and `npm run test:browser`.
`npm run test:client` verifies PayPal's generated checkout payload for canonical and legacy country values.
The backend suite also checks that Vercel's backend-root file trace includes the local email logo.
Rebuild the client before browser checks whenever application source changes.
View failures with `npm run test:browser:report`; traces and screenshots are saved on failure.

Backend route tests use real Express middleware and replace external service clients before routes load.
They cover quotes, address rejection, label/tracking persistence, existing-order retries,
payment failure, fulfillment failure after payment, server-side pricing, mixed fulfillment,
international phone requirements, digital order tokens, and signed Stripe webhooks.
The environment tests reject live Stripe/Shippo keys, unrestricted databases, and live mail in staging.
Physical fulfillment creates one persistent attempt row per expected package before contacting Shippo.
Statuses distinguish `not_attempted`, `label_attempting`, `label_pending`, `label_failed`, `label_unknown`,
and `label_created`. Only Shippo `SUCCESS` with a label URL and transaction ID counts as a created label.
Attempt metadata retains package dimensions, original package count, delivery address, and provider errors.
Shippo IDs are saved when returned. No dashboard entry is guaranteed when Shippo never creates a transaction.
The manual-fulfillment alert lists every package, existing label links, Shippo references, and failure details.
An incomplete paid order remains in manual review on a sequential retry; no label is automatically repurchased.
Pending/unknown attempts must be checked in Shippo before manual retry to avoid duplicate label purchases.

Browser tests run the optimized React build on localhost in desktop and mobile Chromium.
They block nonlocal traffic and use a fake Stripe widget plus mocked API responses.
They cover cart persistence, checkout routing, quote invalidation, standardized-address display,
shipping errors, physical/digital fulfillment, declined payments, manual-review responses, and stylesheet loading.
They include native Chromium address autofill and mocked Google selection; they do not prove actual card entry, real Google service availability, Safari/browser autofill on other platforms, PayPal capture,
database schema compatibility, email delivery, or third-party availability. Those require the sandbox checks below.
Mobile Chromium is emulation, not an actual iPhone/Safari check. Layout is not fully covered by these functional checks.

GitHub Actions runs the same checks on pull requests and non-main pushes. No secrets are needed.
Configure the `checks` job as a required branch-protection check on `main` before release.
The workflow itself does not change repository settings or block Vercel production deploys automatically.

## Create an isolated Neon database first

The connection supplied in chat points to production. Do not use it for staging or run test writes against it.
In Neon, create a **schema-only branch**, e.g. `checkout-staging`, from the production branch.
This copies table definitions without copying customer data. Use the branch's own connection string.
Confirm `orders`, `digital_orders`, `download_tokens`, and `otps` exist. The fulfillment code creates
`order_shipments` on first use, so confirm the staging role has CREATE permission.
Seed only synthetic orders if testing reader/OTP access. Do not copy real customer records.
Keep production and staging passwords/configuration separate. Do not check credentials into Git.

## Local sandbox configuration

1. Copy `server/.env.staging.example` to `server/.env.staging.local`.
2. Fill in the isolated Neon URL and its exact hostname in `STAGING_DATABASE_HOST` after checking it in Neon.
   The hostname allowlist prevents accidental use of another connection; it cannot identify a production database by itself.
3. Add the Stripe test secret, PayPal sandbox credentials, and Shippo test token.
   The webhook signing secret is optional for normal checkout/order-creation tests.
   Keep `APP_ENV=staging` and `EMAIL_MODE=capture`.
4. Copy values from `client/.env.staging.example` into `client/.env.development.local`, overriding `.env.local`.
   Use the matching Stripe **publishable test key**, PayPal sandbox client ID, and local API URL.
5. Start the backend with `npm --prefix server run start:staging` and frontend with `npm --prefix client start`.
6. Optionally, to test the missing-order alert separately, forward Stripe sandbox webhooks to `http://localhost:5000/api/stripeWebhook` using Stripe CLI.
   Use the signing secret returned by that forwarding session locally, not the deployed endpoint secret.

Before creating sandbox orders, run `npm --prefix server run check:staging-db`.
This checks the required checkout columns and whether tables contain rows in a read-only transaction.
It does not create tables or modify records. An empty schema-only branch needs synthetic test orders.

Captured local emails are JSON files in `server/test-emails/`; they are never delivered.
Their bodies include digital links and OTPs for local testing. This directory is ignored by Git.
Reader/image/download tests require separate test assets and test R2/Google Drive access.
`PDF_SERVICE_KEY={}` allows the download route to initialize but cannot download a real PDF.
Do not add production storage credentials simply to make checkout testing start.

## Two Vercel projects

Use a dedicated non-production Git branch such as `codex/test-environment` for both projects.
Do not change either project's Production settings or production branch.
No branch has been pushed or preview deployed by this setup.

In the **backend project's Preview environment**, scope these values to that branch:

- `APP_ENV=staging`, `EMAIL_MODE=capture`
- `DATABASE_URL` and confirmed `STAGING_DATABASE_HOST` for the Neon test branch
- Stripe test secret and Preview endpoint's test `STRIPE_WEBHOOK_SECRET`
- PayPal sandbox ID/secret, Shippo test token, `GMAIL_USER=checkout-test@example.com`
- `BACKEND_URL=https://<backend-preview-host>/` (include trailing slash)
- `PDF_SERVICE_KEY={}` unless configured with test Drive assets
- Optional test storage values for reader tests

In the **frontend project's Preview environment**, scope these values to the same branch:

- `REACT_APP_API_URL=https://<backend-preview-host>/` (include trailing slash)
- `STAGING_API_HOST=<backend-preview-host>` (independently confirmed backend preview hostname)
- `REACT_APP_ENV=staging`
- `REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...`
- `REACT_APP_PAYPAL_CLIENT_ID` for the sandbox
- `REACT_APP_GOOGLE_MAPS_KEY` restricted to the staging frontend origin
- `REACT_APP_DISABLE_ANALYTICS=true`

Backend Preview startup fails unless staging isolation checks pass. Configure variables **before** creating previews;
Frontend Preview builds also reject non-test Stripe keys, a mismatched API hostname, and enabled analytics.
Vercel can otherwise inherit existing Preview values. Do not copy production values wholesale.
Redeploy after changing environment variables; React values are baked into its build.
Use the backend's stable branch-preview URL or a dedicated staging domain, updating the frontend URL if it changes.
Preview access protection must allow the frontend to call the backend and Stripe to deliver webhooks;
configure staging access deliberately rather than disabling production protection.
Register the backend preview URL `/api/stripeWebhook` in the Stripe sandbox for `payment_intent.succeeded`.
Vercel logs capture email subject metadata only; they do not retain email bodies. Inspect bodies locally.

Google Maps browser keys are public by design, but billable: restrict the staging key by website origin and APIs.
Prefer a separate staging key. Do not broadly loosen the production key or allow all `*.vercel.app` sites.

## Sandbox release checklist

- [ ] Separate Neon branch confirmed; production database untouched.
- [ ] Automated suite passes on the candidate commit and GitHub checks are required on `main`.
- [ ] Physical book, sticker-only, print-only, combined book/print and multi-package orders quote and fulfill correctly.
- [ ] Domestic/international shipping, customs phone requirements, invalid addresses, and absent rates checked.
- [ ] Stripe sandbox successful card, declined card, redirect authentication/return, and refresh/retry checked.
- [ ] PayPal sandbox buyer completes/cancels an order; manual review behavior checked.
- [ ] Order rows, `order_shipments`, tracking links, test labels, and captured emails inspected.
- [ ] Duplicate requests do not create duplicate labels; failure after payment is visible and does not claim success.
- [ ] Digital order creates a usable test download token; expiry/use limits and reader OTP checked with test assets.
- [ ] Home, products, cart, checkout, reader, and thank-you pages checked visually at desktop and mobile sizes.
- [ ] Verify Google selection and manual/browser-autofill entry under the deployed staging domain's API restrictions.
- [ ] Record candidate commit, preview URLs, actual sandbox results, and remaining issues before approving production.

No real database, Stripe/PayPal/Shippo sandbox transaction, or deployed preview is verified by the mocked suite alone.

## Opt-in tests against real sandbox services

These commands create actual **test-mode** Stripe payments, Shippo test labels, synthetic staging orders,
and local captured emails. They never run automatically in CI. Configure the isolated staging settings first.

```powershell
npm --prefix server run test:sandbox
npm --prefix server run test:sandbox -- --international
npm --prefix server run test:sandbox -- --bundles
npm --prefix server run test:sandbox -- --digital-only
```

The first command tests digital success/retry, declined payment rejection, unpaid physical order rejection,
book fulfillment, sticker-only fulfillment, and a book plus three prints (two packages).
Prints pack up to five per package and always ship separately from books.
The second tests a Canadian book order including customs creation.
`--digital-only` runs successful digital payment/order/token/email creation with safe retry, plus declined digital payment rejection.
`--bundles` checks all 14 domestic bundle/design combinations, one Canadian checkout per bundle,
two Ambassador bundles (six prints in two print packages plus one book/sticker package), and declined/unconfirmed bundle payments.
It verifies actual Stripe amounts, order book quantities, Shippo attempt statuses, bundle/design names in both captured emails,
admin label links, customer tracking links, and duplicate-safe completed-order retries.
`--bundles --international-only` runs just the four Canadian bundle cases.
The bundle runner checkpoints payment IDs before confirmation. Use `--bundles-resume <run-UUID>` to reverify an interrupted
completed payment without creating another payment. Recorded partial/unknown fulfillment stays in manual review;
the runner does not repurchase its labels. Failed cases can be rerun with fresh synthetic orders after fixing their cause.
Run `node server/api/scripts/auditSandboxBundleLabels.js <run-UUID>` from the repo root to read back Shippo transactions,
verify `SUCCESS` and test mode, and download/check every created label PDF, including partial test-order labels.
Every successful flow checks actual Neon rows and captured email bodies; completed-order retries check
for duplicate records, tokens, shipments and email captures. Test records remain for inspection.
For a completed physical payment whose report failed only during verification, use
`npm --prefix server run test:sandbox -- --resume <prior-run-UUID>` to recheck without creating another payment.

To build the local React site with the configured publishable test key and exercise its actual Stripe.js card form:

```powershell
npm run test:sandbox:browser
```

This uses dedicated local ports 4175 and 5011. It disables analytics and PayPal for this Stripe-specific check.
Stripe human-verification challenges require a manual browser check; do not bypass them or mark that step passed.
The scripts stop local servers when finished. Test-mode artifacts, screenshots, logs, and JSON reports live
in ignored `server/sandbox-results/`. Captured emails are in ignored `server/test-emails/`.
Do not publish those directories wholesale: raw logs can contain test download tokens and provider details.

Recorded outcomes: [Sandbox verification results](SANDBOX_RESULTS.md).

## Concurrent order requests and receipt delivery

## Pay what you wish for digital downloads

Run `npm --prefix server run test:sandbox -- --digital-pricing` for real Stripe test purchases at $1, $20 and $23.45, saved paid amounts, canonical receipts, token creation, safe retries and post-payment amount-mismatch rejection. `--digital-price-bounds` checks rejection below $1/above $10,000 and creates then cancels an uncharged Stripe test setup at the maximum. Both use the isolated staging database and captured emails.

Digital pricing uses validated integer `unitAmountCents`; the buy page and checkout start blank and accept $1–$10,000 USD. A valid buy-page amount is passed as the checkout amount query parameter; checkout edits update that parameter to preserve the choice on reload. Saved payment-return state takes precedence over the query parameter. This is the conservative shared cap selected after reviewing [Stripe USD limits](https://docs.stripe.com/currencies#maximum-charge-amounts) and [PayPal sending limits](https://securepayments.paypal.com/us/cshelp/article/what%E2%80%98s-the-maximum-amount-i-can-send-with-my-paypal-account-help286). Individual buyer/card limits may be lower. Physical/bundle prices remain catalog-controlled. Older open digital tabs sending only `price` remain supported after strict amount validation.

Digital payment setup prepares nullable `digital_orders.amount_paid_cents BIGINT` and `currency TEXT` columns before creating a PaymentIntent. Schema failure therefore blocks setup before a charge; retry can recover. Existing rows are left unknown until a verified retry backfills them. Deploy the backend before the frontend. Stripe fulfillment checks exact paid cents, USD and digital payment metadata; receipts and persisted values use the server-resolved amount. PayPal payload amounts are tested; real PayPal buyer capture is still deferred.

Browser checks cover blank defaults, buy-page amount transfer/editing/reload, required explicit prices and bounds, exact cents, summary/payment refresh, provider errors without retry loops, old setup responses, amount locking during payment, redirect amount restoration, single completion, and preserving physical cart/pending checkout. The public-facing download window and four-download allowance are unchanged.

## Concurrent order requests and receipt delivery

`node scripts/verify-deployed-bundles.cjs` runs the deployed bundle browser/return-flow checks. It reads ignored `server/sandbox-results/deployed-preview-access.json` containing `frontendShare` (a deployment-specific Vercel share URL) and `backendOrigin`, plus local isolated staging credentials. Use `negative` for invalid-choice/mixed-cart/declined-payment checks, `card` to attempt actual card entry, or `bundle-id:US` / `bundle-id:CA` for one configured case. The default suite uses sandbox API payment confirmation followed by the real Stripe.js browser return; it does not mock services and does not claim to complete the browser card form. Human verification requires a user-operated checkout. Evidence, screenshots, raw diagnostics and label PDFs stay ignored. Never commit access links or publish raw diagnostics.

Run `npm --prefix server run test:sandbox -- --concurrency` for six simultaneous fulfillment requests per Stripe test payment, covering digital and Ambassador purchases. The test uses the isolated staging database, real Stripe/Shippo test services, and captured emails. It verifies one order, one token or the expected labels, one customer/admin email pair, and safe completed-order retries.

Both order routes claim the payment in `order_processing_locks` after payment verification. Concurrent requests return HTTP 409 with code `ORDER_PROCESSING`; the customer can wait and retry without paying again. The claim is released before the response. A crashed process intentionally leaves its claim for review rather than expiring it and risking another label purchase. If a claim remains, inspect the order, shipment attempts, Shippo transactions, tokens, and emails, and confirm no worker is active before an operator removes that transaction's claim. Do not blindly delete all claims or retry uncertain label purchases.

Default staging mail stays captured. Explicit `EMAIL_MODE=sandbox-smtp` permits real SMTP tests only when `SANDBOX_EMAIL_RECIPIENT` contains one email address. The mailer replaces all To/Cc/Bcc and envelope recipients with that test address and prefixes subjects with `[SANDBOX]`. Production rejects staging mode. Never promote a sandbox deployment or copy its configuration to production.

## Address form verification

### Protected Vercel checkout previews

The `codex/checkout-preview` branch uses branch-specific Preview variables in both Vercel projects.
The backend requires the isolated Neon host, Stripe/Shippo test keys, and captured email mode.
The frontend uses `REACT_APP_API_URL=/sandbox/` so requests stay on the current deployment's origin.
Do not use an absolute branch-alias URL: deployment URLs would make cross-origin requests that
Vercel Authentication redirects during preflight. Its server-side relay forwards only the four checkout
POST endpoints to the pinned backend preview, using a deployment-specific expiring share link.
The relay returns 404 outside Vercel Preview and keeps its access token and cookie out of the browser.
Production variables and protection settings are unchanged.

The backend share expires after seven days. To renew it, create another expiring share link for the
intended backend preview, update only this branch's `SANDBOX_BACKEND_SHARE` (and backend URL/host if
changing deployments), and redeploy the frontend Preview. A 502 from `/sandbox/` can indicate expired
access. Never copy a project-wide production bypass secret into a public `REACT_APP_` variable.
Both the frontend branch alias and individual deployment URLs use their own authenticated origin.
Confirmation emails are captured rather than delivered. Reader assets/downloads are outside this
checkout-only preview configuration.

The shipping form always renders its own controlled street, apartment, city, state/province, postal-code,
and country fields. Country defaults to US; street/apartment and city/state/ZIP use compact desktop rows,
stacking on mobile. The apartment input stays present so browser autofill can preserve unit numbers.
Google's existing Places integration enhances the street input without gating form availability.
Suggestions populate editable fields and native autocomplete attributes remain enabled.
Missing/invalid fields are reported inline; known US/CA/AU region and US/CA/AU/GB postal requirements
are checked locally, with Shippo performing final carrier address validation for all destinations.
Editing address details invalidates shipping/payment state and pending responses for the old address are discarded.
Desktop checkout uses a sticky order-summary sidebar; mobile uses a compact expandable price summary above the form.
Summary items use the first catalog image, quantities, line totals, and live shipping/total amounts.
On mobile, a separate always-open subtotal/shipping/total card appears next to payment after a quote is obtained.
It disappears when address edits invalidate the quote. Prints and stickers show quantity without a physical-copy label.

Print bundles show a persistent shipping-policy notice below their description and again before shipping calculation
when the cart includes books and prints. Domestic checkout charges the highest package rate; international checkout
charges the sum of package rates. The text accounts for more than two packages in larger orders.

Digital purchases use a direct `/checkout/digital` route from the book's "Buy digital copy" link. They bypass the
shopping cart, preserve its physical items on success/decline/redirect, and keep pending payment state under
`slowComicsPendingDigitalCheckout`, separate from the physical checkout. Existing digital-only carts still work.
The browser suite covers successful/declined direct digital checkout and restoring a Stripe return without clearing
the physical cart or its pending checkout. These checks mock Stripe and the backend.

`npm run check` covers manual entry with Google blocked, native Chromium autofill including apartments,
Google component parsing, postal/region fields, international phone requirements, quote invalidation,
and delayed shipping/payment responses on desktop/mobile.
`node scripts/check-sandbox-address.cjs` exercises the running localhost:3000 app with actual Google suggestions
and Shippo test quotes, without confirming payments or creating labels/orders.

References: [Vercel Preview variables](https://vercel.com/docs/environment-variables),
[Neon schema-only branches](https://neon.com/blog/instant-branches-schema-only-or-with-data-the-choice-is-yours),
[Playwright web server](https://playwright.dev/docs/test-webserver),
[Google Maps key restrictions](https://developers.google.com/maps/api-security-best-practices).
