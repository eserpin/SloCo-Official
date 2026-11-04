# Sandbox checkout verification — October 30, 2026

No Git push, production deployment, production database write, live payment, or delivered email was performed.
The tests used local Express checkout routes, Stripe test keys, Shippo test credentials, the isolated Neon branch,
and Nodemailer's local JSON capture transport. Credentials and raw logs are excluded from Git.

## Actual sandbox outcomes

| Scenario | Outcome | Evidence |
| --- | --- | --- |
| Digital Visa payment | Passed | Stripe `succeeded`; one `digital_orders` row; one token with three uses; two captured emails |
| Repeated digital fulfillment | Passed | Same order/token returned; no extra email |
| Declined digital Visa payment | Passed | Stripe `requires_payment_method`; zero order rows and emails |
| Unconfirmed physical payment | Passed | Order endpoint rejected it; zero order rows and emails |
| Book checkout | Passed | One paid order, one test label, tracking saved, two captured emails |
| Sticker-only checkout | Passed | One paid order, one test label, tracking saved, two captured emails |
| Book plus three prints | Passed | One paid order, three shipment rows and test labels; customer email contains all tracking links |
| Repeated completed physical fulfillment | Passed | No additional order, shipment row, or email |
| Canadian book checkout | Passed | Paid order, customs creation, test label, tracking, captured emails; completed-order retry safe |
| Actual React/Stripe.js browser card checkout | Requires manual check | Product → cart → checkout and real Stripe payment UI loaded; Stripe human verification prevented automated card entry |
| User-operated physical browser checkout | Payment and fulfillment verified | Stripe test payment `pi_3UWRLAAjoj6fyL5z0V7lOCPe` succeeded for USD 33.10; exactly one book order and one USPS Ground Advantage test shipment; customer/admin emails captured |

The first API run encountered a test-harness mismatch with Nodemailer's recipient representation, and the second
encountered an HTML-escaped tracking URL assertion. The application had created the physical orders and labels.
Both assertions were corrected. The existing multi-package payment was reverified without creating another payment.
No application changes were needed for these sandbox API outcomes.

Local evidence files:

- `server/sandbox-results/27eca811-e3e2-4b1c-a6b9-c04aa5c9cb16.json`: all six core API scenarios passed (includes reused passing evidence and reverified multi-package payment).
- `server/sandbox-results/fa2f80c3-7171-4643-b8d3-b533299a1055.json`: international checkout passed.
- `server/sandbox-results/62d4b421-ea61-42dc-a060-d2484233700d-browser.json`: browser attempt and missing-control error.
- Its matching `-frames.json` records Stripe's hCaptcha frame requesting verification; its `-failed.png` records the page.

Synthetic records and test payment objects remain available for inspection.

## Limits before production release

The API tests confirm real sandbox payment-to-order creation. A subsequent user-operated physical checkout also
produced a verified successful Stripe test payment, order, test label/tracking, and captured emails. The assistant
did not independently observe that manual checkout's thank-you page or cart state.
Manual Stripe decline, 3DS/redirect and mobile behavior, PayPal sandbox buyer approval,
actual test-asset PDF delivery, and deployed Vercel preview connectivity remain unverified.
Captured emails prove content generation, not SMTP delivery. Duplicate checks cover sequential completed-order retries,
not simultaneous submissions or retry recovery after partially completed fulfillment.

Production remains unapproved pending the remaining applicable release checks in the testing guide.

## Address-form follow-up

After the form rework, 41 backend checks, 34 desktop/mobile browser checks, and the optimized build passed.
Browser coverage includes actual native Chromium address autofill (including apartment), manual entry with Google
blocked, mocked Google selection, inline validation, and discarding stale quote/payment-setup responses.
The running local app also returned real Shippo test shipping quotes for both a manually entered address with
Google blocked and an address selected from actual Google suggestions. Screenshots were inspected at mobile
and desktop sizes; mobile checkout did not overflow horizontally. No payment was confirmed during those quote checks.
Evidence: ignored `server/sandbox-results/address-form-verification.json`, `address-manual-mobile.png`, and `address-google-desktop.png`.
Saved-address autofill in Safari and on real mobile devices still requires a manual check.

The subsequent summary/layout update passed the optimized build and all 36 desktop/mobile browser checks.
Coverage verifies catalog thumbnails load, shipping updates the summary total, the desktop card stays at the top
of the viewport while scrolling, and the mobile summary starts compact and expands without horizontal overflow.

## Fulfillment fallback follow-up

Run `server/sandbox-results/2aa79953-02fe-4130-8460-08154ff107e5.json` passed all six actual sandbox scenarios
after adding per-package attempt persistence and retry checks. Read-back verified one, one, and three
`label_created` records for book, sticker-only, and book/three-print orders respectively, with original package
counts and customer confirmation timestamps preserved. No extra labels/emails were created by completed-order retries.
The regression suites passed 53 backend cases, 6 PayPal payload cases, and 36 browser cases.
Mocked failure cases verify Shippo ERROR/WAITING/QUEUED, missing URLs, network uncertainty, absent rates,
address and shipment-creation failures, customer-email failure, partial-package success, and incomplete retries.

## Bundle sandbox verification — November 3, 2026

Used the new, user-confirmed isolated Neon test branch, real Stripe test payments, Shippo test-mode labels,
and captured customer/admin emails. No production deployment or delivered email was performed.

| Coverage | Final result |
| --- | --- |
| Collectible-print bundle | Passed domestic and Canadian payment, quote, order, labels, emails, and completed-order retry |
| Sticker bundle | Passed all ten domestic design choices and a Canadian representative |
| Base-print bundle | Passed both domestic design choices and a Canadian representative |
| Ambassador bundle | Passed domestic and Canadian checkout; one book, three prints, ten stickers; two packages |
| Two Ambassador bundles | Passed; two books, six prints, twenty stickers; three packages, with prints separate from books |
| Declined/unconfirmed bundle payments | Rejected fulfillment; no order or email created |
| Completed-order retries | No duplicate order, shipment record, or email |
| Label audit | All 31 labels from both runs retrieved as Shippo test-mode SUCCESS transactions and downloaded as PDF files; representative domestic/international PDFs rendered and inspected |
| PayPal | Sandbox authentication passed; buyer approval/capture remains unverified because no sandbox buyer login is available |
| Email delivery | Content, bundle/design names, admin label links and customer tracking links verified using local captures; SMTP/inbox delivery unverified |

The first run passed 17 of 21 scenarios. Four Canadian cases exposed a carrier rejection:
USPS limits `customs_declaration.contents_explanation` to 25 characters, while the existing book-package description exceeded it.
The application now uses `Graphic novel` or `Books and stickers`; a regression test covers the carrier limit.
Fresh test orders then passed all four Canadian cases. The four original paid test orders remain in manual review with
their original attempt evidence and partial labels; no labels were automatically repurchased for them.

Across successful checkouts, 19 synthetic paid orders each generated a customer/admin email pair (38 confirmations).
The initial four failed Canadian orders also generated four manual-fulfillment alerts. Synthetic records remain for inspection.

Evidence in ignored `server/sandbox-results/`:

- `141ddbaa-3d69-4617-9670-491366f867cf.json`: 14 domestic/design cases, bulk Ambassador case, negative payment cases, and original international failures.
- `c3771392-1a2c-4efd-8f56-252c2e1fb270.json`: all four corrected international cases passed.
- Matching `-label-audit.json` reports and PDFs: 24 initial-run labels plus seven corrected international labels.
- `bundle-service-preflight.json`: Stripe/PayPal sandbox authentication and real Shippo quotes for every bundle.
- `bundle-regression-tests.log`: 97 backend cases passed after the customs fix.
- `bundle-full-browser-tests.log`: 55 desktop/mobile browser cases passed, one desktop-only-inapplicable case skipped; browser payments/APIs mocked.

The React payment-payload tests (6) and optimized production build passed. These API sandbox checks do not establish
real Stripe.js card entry, 3DS/redirect UI completion, PayPal capture, SMTP delivery, or deployed-preview connectivity.

### Mixed-cart examples

Follow-up run `2c9aab82-742d-47bd-bda8-8f933027a2a0` passed both requested examples:

- One standalone physical book plus one collectible-print bundle: two books and one print; $107 subtotal + $11.71 shipping = $118.71. Actual Stripe sandbox payment, one saved order, two test labels, both captured emails, and duplicate-safe retry verified. Both label PDFs passed the provider/download audit.
- One digital book plus the physical collectible-print bundle: payment setup returned HTTP 400 with the existing separate-checkout message. No payment or email was created. This is a blocked-cart example, not a combined order.

Both appear in the local order/email review at port 4176 alongside the earlier examples. Run with `npm --prefix server run test:sandbox -- --mixed-examples` to repeat against the configured isolated test branch.

### Direct digital checkout and print-shipping notices

The book's digital option now opens a dedicated checkout without adding to or clearing the physical cart.
Pending digital payment state and the Stripe return URL use the dedicated digital route.
The optimized build, six React PayPal payload cases, and 61 desktop/mobile browser cases passed (one skipped).
New browser coverage checks direct digital success, decline, and Stripe return while preserving the physical cart
and pending checkout. Payment SDKs and backend responses are mocked in these browser cases; PayPal capture remains unverified.
Print-bundle pages and book/print checkout show the domestic versus international package-charge explanation before payment.

### Direct digital sandbox purchase — November 3, 2026

- API run `55ee076a-a2ce-47a3-bfef-e3ae06a27ee9` passed actual Stripe digital payment/order/token/email creation, completed-order retry without duplicates, and declined-payment rejection.
- Real Stripe.js browser run `4e32a4d1-4040-4117-966b-fab6cb88bdc4` opened the direct checkout and filled the real test-card form. Payment completion stalled with Stripe/hCaptcha human-verification UI; the raw run records a fulfillment-response timeout. This automated browser run is not a successful purchase.
- The user then operated the connected sandbox preview at `http://127.0.0.1:4175/checkout/digital`. Independent read-back confirmed test payment `pi_3UXqHOAjoj6fyL5z1ue5ZVgU` succeeded for $27, digital order `2500d4bc-2695-4088-94ab-3f342a097103`, one token with four uses, and two captured emails. Evidence: `server/sandbox-results/direct-digital-manual-verification.json`.
- The assistant did not independently observe the user's final thank-you screen or cart state. Automated mocked browser checks previously verified physical-cart preservation on success, decline, and Stripe return.
- Test PDF assets and Drive credentials are not configured in this sandbox, so actual book-file downloading remains unverified. SMTP/inbox delivery is also unverified; the emails are local captures.

The actual digital order and captured plain-text customer/admin emails are previewed locally at `http://127.0.0.1:4176/digital-order.html`.
# Mailing list checkout — November 3, 2026

Implemented optional, unchecked Kit signup on physical and direct digital checkout. Validation: 5 newsletter service tests, 30 checkout route tests, 8 React/PayPal tests, 43 desktop/mobile checkout browser tests passed (1 mobile-only check skipped on desktop); normal and sandbox production builds passed.

Actual Stripe sandbox digital purchase for the authorized test address completed successfully. Isolated staging order `46b27eed-e715-40e0-8265-8d288a76decf`, payment `pi_3UXtzYAjoj6fyL5z0d2hwL04`; one order, one 4-use download token and two locally captured transactional emails. Retrying did not duplicate the order, token, emails or consent. No transactional emails were delivered externally.

Kit initially rejected the saved key with HTTP 401 (`The API key is invalid`). The single affirmative consent record stayed pending after initial order and duplicate-request attempts, verifying that a Kit failure cannot block digital fulfillment and that signup survives for retry. Local initial report: ignored `server/sandbox-results/866fb0e3-482e-42a5-8ac3-1dbd06e5e8ee.json`.

After the user replaced the key, the account endpoint returned HTTP 200 for Slow Comics with the expected verified sender address. Retried the existing test consent without another payment: status `synced`, subscriber ID `4372172123`, subscriber state `active`, attempt count 3, last error cleared. A separate Kit subscriber GET confirmed erenserpin@gmail.com is active. Repeating the consent call left the attempt count unchanged, confirming no additional Kit submission. Restarted the local staging API to load the replacement key. No welcome email/sequence is configured, and inbox delivery has not been tested. Production deployment remains pending.

## Bundle release checks — November 4, 2026

User deferred PayPal buyer testing and authorized a deployed preview, SMTP tests, and simultaneous-order tests. Found a digital token/email race between the existing-order check and token creation. Both order routes now use a durable, payment-keyed database processing claim. Competing requests return HTTP 409 while the original request works; finished requests release the claim before responding. Crashed requests retain claims for manual review. Existing payment verification, shipping-attempt safeguards and completed-order behavior remain in place.

The backend regression suite passed all 108 checks. Actual sandbox run `dfbb4935-776a-4a20-8cdc-f727a50e42b9` passed concurrent digital and Ambassador fulfillment: six requests per test payment, one saved order, one digital token or two physical labels, and one customer/admin email pair each. Concurrent response codes were 200/409; no duplicate tokens, labels or emails. Completed-order retries passed.

Using the configured Gmail sender, SMTP verification succeeded and both representative Ambassador customer/admin receipts were accepted for erenserpin@gmail.com, with no rejected recipients. Subjects begin `[SANDBOX TEST]`; no other address received these test emails. Provider message IDs/responses are retained in ignored `server/sandbox-results/bundle-smtp-verification.json`. The user confirmed both emails arrived and that the bundle contents, tracking links, and admin label links look correct.

Preview prepared on branch `codex/bundle-release-checks`. After the user specifically approved copying credentials to Vercel, the test settings were stored only in that branch's Preview environment. SMTP is restricted to erenserpin@gmail.com. Production has not changed.

### Deployed preview verification — November 4, 2026

Final application commit: `bbdc5b45a4c9b23f3362996fdb5fe9eea4373597`. Both projects reached READY as Preview deployments, with deployment protection retained:

- Frontend: `dpl_66wER6heUgWGqVyhBBZCtnJVsKHC`, https://slo-co-official-nzlt-doz750l1j-eserpins-projects.vercel.app (React build about 22 seconds).
- Backend: `dpl_49RNR9KiY45YnHwEg84TPYYo9XC1`, https://slo-co-official-g3vdohk7m-eserpins-projects.vercel.app (Express build about 33 seconds).

All four bundles passed from deployed shop selection through cart, address entry, actual shipping quote/payment setup, Stripe return, saved order, test labels, emails, thank-you screen and cart clearing. Base-print and Canadian checks used mobile browser viewports. The Canadian Ambassador case charged both packages; domestic cases charged the highest package rate. Five initial purchases plus a final Ambassador smoke test produced six orders, eleven test labels with downloadable PDF signatures, and twelve SMTP-accepted emails with no rejected recipients. Read-back verified each label as a Shippo test-mode SUCCESS transaction and confirmed tracking-email timestamps.

Deployed Ambassador tests sent five competing requests during the browser's fulfillment request. All five competitors returned `409 ORDER_PROCESSING`; the original succeeded. Saved rows, labels and SMTP logs showed no duplicates. Completed-order retries also passed. The test found invalid bundle designs returned HTTP 500; the final commit fixes this to HTTP 400 before payment creation. Deployed negative checks then passed for invalid designs (400), mixed digital/physical carts (400), and a declined card (fulfillment rejected, no order or labels). Public JavaScript did not contain the configured database, Stripe secret, Shippo or Kit key. All 109 backend regressions passed after the fix.

These automated browser purchases used **Stripe sandbox API confirmation followed by the real Stripe.js return flow**, with no SDK or endpoint mocks. They do not establish direct card-entry/Pay-button completion. A separate automated card-entry attempt was blocked by Stripe's hCaptcha screen; the unpaid test PaymentIntent was canceled after verifying no order existed. The subsequent user-operated deployed card checkout passed, as independently verified below. PayPal buyer testing is deferred at the user's request. Actual book-file downloads remain outside this bundle verification.

Ignored evidence directories under `server/sandbox-results/`:

- `deployed-15f44105-97da-440b-ab0b-7d179cace568`: sticker checkout.
- `deployed-7f90b70b-a6cb-4425-936e-cfbd131b5a91`: US print/collectible/Ambassador and Canadian Ambassador, including deployed concurrency.
- `deployed-d70deefc-c543-47cf-8838-753301008dc9`: final negative checks and client secret-exposure scan.
- `deployed-d98cb8f7-e76a-4d1f-8def-1915e6a14172`: final-commit Ambassador smoke/concurrency test.
- `deployed-307bb854-14c4-48c3-b9bd-d8d81f1a857a`: blocked card-entry attempt and hCaptcha frame diagnostics. Raw diagnostics contain test client secrets; do not publish them.

Production deployment IDs and main commit were independently checked and remain `dpl_AWNWKy48ufn417b8pe3gM1p7YGbQ` / `dpl_GbfdHc7yLVkQvA6gf5s8Cbft8LzE`, commit `a07ea664fff7f31b736bfe76a7881a4a8d4fcb60`. No production deployment, live charge, or production database write occurred. Frontend and backend share links expire; renew the backend link and redeploy the frontend relay if preview access expires.

### User-operated deployed card checkout — November 4, 2026

The user completed a test-card purchase in the deployed preview and reported reaching `/thank-you`. Independent Stripe, database, Shippo and runtime-log read-back verified:

- Payment `pi_3UXzT2Ajoj6fyL5z0w75RxMs`: `succeeded`, `livemode=false`, USD 148.63 received ($142 items + $6.63 shipping). No automated-run metadata; this is the user-operated purchase.
- Exactly one order, `a1553339-d499-4f7e-9778-cc199e12e07a`. Cart contained Book + Sticker (Nandi/Mesca design), Book + Collectible Gold Foil Print, one standalone Dragon Sticker, and one standalone book. Expanded contents: three books, two stickers and one print.
- Exactly two saved `label_created` shipments; both independently retrieved as Shippo test-mode SUCCESS transactions. Both label PDFs downloaded with valid PDF signatures, tracking URLs present, and customer tracking-email timestamps recorded. No processing claim remained.
- The same deployed request logged exactly two SMTP acceptances, no rejected recipients, and successful customer/admin confirmations. Test SMTP remained restricted to erenserpin@gmail.com.
- The order's affirmative mailing-list consent was recorded as `synced`, with Kit subscriber state `active`.

This completes the requested deployed bundle checkout checks, including the manual card-entry path. The assistant did not independently inspect the user's final browser cart state; automated deployed return-flow tests separately verified cart clearing. Detailed read-back is in ignored `server/sandbox-results/deployed-manual-bundle-verification.json`. Production release is still separate; PayPal remains deferred.

## Production release — November 4, 2026

The user authorized pushing the tested changes live and specifically approved copying the tested Kit key into the existing production backend. A read-only production database preflight confirmed the order/token/shipment tables and permission to create the new processing-claim and consent tables. Other production credentials were preserved; Preview-only database/payment/mail settings were not copied into production.

Released the backend first, verified its public API rejected an invalid bundle choice with HTTP 400 without creating a payment, then fast-forwarded main to application commit `d2becbb8df28c6437847c647d116bdfc2bd5fcee` and pushed. Both automatic main deployments reached production READY:

- Backend: `dpl_7Br4Ph9wwriXVAPt4KaMdjPpGPaA` at https://slo-co-official.vercel.app.
- Frontend: `dpl_9vm9Me7Dva56AtkVkXM3CWdaTNUj` at https://slowcomics.com.

Production browser smoke checks confirmed four bundle cards, selecting a base-print design, adding it to the cart, entering checkout, and optional unchecked mailing-list boxes on both physical and direct digital checkout. The public build uses a live Stripe publishable key, contains no configured sandbox endpoint or literal server secret, and produced no client exceptions. These post-release checks did not create a live customer payment, order or shipping label. PayPal remains deferred. The release-record follow-up changes only documentation.
