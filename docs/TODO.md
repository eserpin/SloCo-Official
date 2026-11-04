# Site to-do list

Updated November 3, 2026. Work in this priority order.

## 1. Bundles — implemented locally; awaiting release

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

Validation: backend/React regressions, production build, desktop/mobile browser checks, and actual Stripe/Shippo/staging-database bundle runs passed. November 4 deployed Preview tests passed all four bundles, Canadian Ambassador shipping, order/label creation, browser Stripe returns, thank-you/cart clearing, SMTP sending, duplicate retries, and simultaneous requests. The user confirmed receipt inbox arrival and correct contents/links. Fixed an international customs-description rejection and invalid bundle-choice HTTP status. Direct deployed card-entry verification awaits the user's human-verification checkout; PayPal buyer testing is deferred. Production release remains pending. Details: [Sandbox results](SANDBOX_RESULTS.md#deployed-preview-verification--november-4-2026).

## 2. Pay what you want for digital downloads — queued

- Digital UX prerequisite implemented: selecting digital on the book page opens a direct "Buy digital copy" checkout at `/checkout/digital`, without adding a download to the cart or clearing existing physical items. Digital payment-return state is stored separately from the physical checkout.
- Let customers choose a price with a $1 minimum and no maximum.
- Validate the amount on the server and use it consistently for payment, order creation, and receipts.

## 3. Private order portal — queued

- Access limited to the two brothers.
- View database orders in a list; sort date oldest/newest first; search customer names.
- Show shipping label status and relevant label/tracking details.
- Review and clean up test orders without deleting real orders.
- Review existing `order_shipments` data before adding any necessary order/shipping fields.
- Consider editable internal notes and handled/needs-attention markers.

## Mailing list — Kit integrated and tested locally; awaiting release

- Add an optional, unchecked checkbox to both physical and direct digital checkout: "Subscribe to our email list to be notified about future projects."
- Subscribe only customers who opt in; retain consent and avoid duplicate subscriptions on payment/order retries.
- Keep a mailing-list service failure from blocking a successful purchase; retain the signup for retry.
- Use the provider for announcements and unsubscribe management. Existing order/download emails remain independent of marketing opt-in.
- Kit chosen: Slow Comics, slow.comics.publishing@gmail.com. Backend integration, consent records and manual retry command implemented; see [mailing list setup](MAILING_LIST.md). Replacement V4 key verified against the Slow Comics account; saved test signup for erenserpin@gmail.com synced and independently read back as active. Repeated signup did not make another Kit submission. No welcome email/sequence configured. Deployment remains pending.
