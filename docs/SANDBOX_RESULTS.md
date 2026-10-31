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
