# Site to-do list

Updated November 3, 2026. Work in this priority order.

## 1. Bundles — released November 4, 2026

- Book + Collectible Gold Foil Print: $80 ($97 value).
- Book + any sticker: $30 ($32 value).
- Book + a base print (Nandi Cover or Blue Dragon): $37 ($42 value).
- Slow Comics Ambassador Bundle: One of Everything!: $130 ($177 value); one physical book, all three prints, and all ten stickers. Listed last, with a collage of all 14 products.
- Show all bundles on the book product page; show the matching bundle on each print page, with that print selected. No bundle options on sticker pages.
- Add a Bundles shop section linking to the book page with the bundle preselected.
- Keep each bundle as one cart line, distinguish selected designs, and expand its contents for shipping. Validate prices and choices on the server. Include contents in checkout and order emails.
- Source: chat “Recall recent changes and plans,” October 13, 2026.

Implementation includes server-calculated prices, selected designs and shipping quantities; a shared four-physical-book cart limit across bundles and standalone books; and bundle contents in checkout, recorded shipment details, and order emails. Client/server bundle catalogs are checked for agreement in tests so each Vercel project can deploy independently.

Print packaging: up to five prints per package, always separate from the book package. One Ambassador Bundle uses two packages (book/stickers and prints).

Validation: backend/React regressions, production build, desktop/mobile browser checks, and actual Stripe/Shippo/staging-database bundle runs passed. Deployed Preview tests passed all four bundles, Canadian shipping, orders/labels, browser Stripe returns, thank-you/cart clearing, SMTP delivery, duplicate retries, and simultaneous requests. A user-operated deployed mixed bundle/standalone card purchase passed independent payment, order, label, SMTP and Kit-consent read-back. Released to main and both production projects November 4; public-site bundle selection/cart and both signup checkboxes passed smoke checks, with live Stripe settings and no client errors. PayPal buyer testing remains deferred. Details: [Sandbox results](SANDBOX_RESULTS.md#production-release--november-4-2026).

## 2. Pay what you wish for digital downloads — implemented locally; awaiting review/release

- Digital UX prerequisite implemented: selecting digital on the book page opens a direct "Buy digital copy" checkout at `/checkout/digital`, without adding a download to the cart or clearing existing physical items. Digital payment-return state is stored separately from the physical checkout.
- The digital buy page and checkout both use an editable, initially blank price with a $1 minimum and $10,000 maximum. The buy-page choice pre-fills checkout, where it can be edited. The user revised the original no-maximum request on November 4 to use the lower shared provider limit; PayPal can cap transactions at $10,000.
- Both pages say "Pay what you wish"; checkout shows the editable USD amount near the top. Invalid amounts disable payment, and the summary/payment setup updates when the price changes.
- The backend validates whole cents and preserves authoritative physical/bundle pricing. Stripe digital fulfillment requires an exact match to the paid amount/currency. Digital orders store `amount_paid_cents` and `currency`; receipts use canonical item names and the chosen amount.
- Actual sandbox purchases at $1, $20 and $23.45 passed order, receipt, token and retry checks. Boundary setup at $10,000 passed and was canceled; out-of-range requests were rejected. All 120 backend, 12 React and 71 browser checks passed (one skipped). Fixed a digital redirect completion race found in browser tests. Production is unchanged; implementation is on `codex/pay-what-you-want`.

## 3. Private order portal — queued

- Access limited to the two brothers.
- View database orders in a list; sort date oldest/newest first; search customer names.
- Show shipping label status and relevant label/tracking details.
- Review and clean up test orders without deleting real orders.
- Review existing `order_shipments` data before adding any necessary order/shipping fields.
- Consider editable internal notes and handled/needs-attention markers.

## Mailing list — released November 4, 2026

- Add an optional, unchecked checkbox to both physical and direct digital checkout: "Subscribe to our email list to be notified about future projects."
- Subscribe only customers who opt in; retain consent and avoid duplicate subscriptions on payment/order retries.
- Keep a mailing-list service failure from blocking a successful purchase; retain the signup for retry.
- Use the provider for announcements and unsubscribe management. Existing order/download emails remain independent of marketing opt-in.
- Kit chosen: Slow Comics, slow.comics.publishing@gmail.com. Backend integration, consent records and manual retry command implemented; see [mailing list setup](MAILING_LIST.md). Test signup and the user's deployed Preview checkout synced affirmative consent; duplicate retries did not resubmit. The user explicitly approved the production Kit key, which was configured before the November 4 release. Both production checkouts show the optional unchecked signup box. No welcome email/sequence configured.
