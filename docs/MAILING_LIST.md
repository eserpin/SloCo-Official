# Checkout mailing list

Both checkouts offer an optional, preselected signup: “Subscribe to our email list to be notified about future projects.” Customers can uncheck it. A saved unchecked choice stays unchecked on payment retries and returns. It is separate from the required purchase email address and transactional receipts. Stripe redirect state retains the checkbox choice; Stripe and PayPal fulfillment payloads include a strict boolean `newsletterOptIn`.

After payment verification and order creation, a selected signup is recorded in `newsletter_consents`: transaction ID, email, name, checkout source, exact checkbox wording and timestamp. No newsletter record is created when the checkbox is unchecked. The table is created on first signup using the same database as orders.

The server calls Kit V4's subscriber upsert with `KIT_API_KEY`. New subscribers become active when checkout's signup checkbox is selected. This does not send a welcome email or enroll anyone in a sequence. Kit preserves existing subscriber states, including unsubscribed and bounced, so checkout retries cannot reactivate those subscribers. Announcements are sent from Kit, which manages unsubscribe links.

Configure a **V4 API key** in the server environment only. Use the ignored `server/.env.staging.local` for local staging. Add the key separately to the production server's environment when releasing. Never put it in a `REACT_APP_` variable. Kit account/sender settings should use Slow Comics and slow.comics.publishing@gmail.com; sender verification and any required account activation are managed in Kit.

Consent records are unique per transaction. A database lease prevents concurrent duplicate submissions; Kit also upserts contacts by email across separate purchases. Provider errors/timeouts leave records pending without interrupting fulfillment. Stale leases can be retried after two minutes. If the consent database write itself fails, the server logs the affected transaction for review; retrying the original opted-in fulfillment request attempts recording again.

From `server`, run `$env:APP_ENV='staging'; npm run newsletter:retry` to retry up to 100 pending/stale signups. There is no automatic background retry schedule yet. The command reports attempted records; inspect `newsletter_consents.status` / `last_error` to confirm success. `synced` means Kit accepted the contact, while `subscriber_state` shows whether the contact is active or remains unsubscribed/inactive.

Tests use mocked Kit calls and never subscribe their example addresses. A live test is authorized only for erenserpin@gmail.com.
