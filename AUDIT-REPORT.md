# End-to-end release audit — Classy Apparels by Sana

Audit date: 25 August 2026  
Audited domain: `https://classyapparelsbysana.com`  
Source: attached Hostinger package  
Verdict: **NO-GO for public payments until the remaining environment tests below are complete.**

## Direct answer: are orders and payments saved?

Yes. The application is designed to persist operational commerce data in Hostinger MySQL.

| Data | Storage |
| --- | --- |
| Customer name, email and phone | `orders` |
| Full delivery address and optional mapped coordinates | `orders` |
| Product, size, quantity and price snapshot | `order_items` |
| Subtotal, shipping, discount, coupon and final total | `orders` |
| Razorpay order ID, payment ID and verified signature | `orders` |
| Payment, fulfilment and refund status | `orders` |
| Refund ID/reason and one-time stock restoration marker | `orders` |
| Courier, AWB/tracking URL and delivery timestamps | `orders` |
| Card number, CVV, UPI PIN and bank credentials | **Never stored by this application; entered at Razorpay** |

The attached source did not have sufficiently safe transaction boundaries around this data. Those defects are fixed in this release candidate, but the live database still needs to be inspected after deployment.

## Critical and high-risk defects fixed in the release candidate

- Payment capture, inventory decrement and coupon usage now commit atomically. A crash can no longer leave a captured order without its matching inventory update.
- Duplicate checkout verification and duplicate Razorpay webhook delivery are idempotent.
- A failed Razorpay attempt no longer releases the reservation immediately because the same Razorpay order can be retried.
- Expired reservation cleanup now claims each order before releasing stock, preventing double release during concurrent checkouts.
- Checkout reservation and local order/line-item creation now use one database transaction.
- Late successful payments either consume genuinely available stock or are recorded as `refund_pending`; they are never silently treated as fulfilable.
- Refund requests use Razorpay's refund-idempotency header and a stable request body. Repeated clicks or network retries cannot intentionally create duplicate refunds.
- Refunded stock is restored at most once using `stock_restored_at`.
- A manual Admin Studio Razorpay reconciliation action can recover a captured payment after a missed client callback or webhook.
- Admin fulfilment transitions now require a captured payment, enforce valid order-state transitions, and require courier/AWB before `shipped`.
- Product updates, images and inventory save in one transaction. Restock emails fire only on a real zero-to-positive stock transition.
- Repeated deployments no longer duplicate product gallery rows. Migration `0001_release_hardening.sql` removes existing duplicates and adds a unique product/image constraint.
- Invalid `000000` PIN codes are rejected, while every valid Indian PIN is accepted for nationwide manual fulfilment. Optional PIN rows only refine the fee and delivery estimate.
- Checkout includes all 36 Indian states/union territories and all 249 ISO country choices. International postal formats and calling codes are validated, and the country code is stored with the order.
- International delivery uses a manual WhatsApp quote until a reviewed `INTERNATIONAL_SHIPPING_PAISE` value is configured; the website never invents or silently omits an international courier charge.
- Server-provided shipping cost is reflected in checkout instead of relying only on a browser-side estimate.
- MySQL inventory release now uses the scalar `GREATEST(0, value)` function rather than aggregate `MAX(0, value)`. This fixes the 25 August checkout failure reported from the live backend.
- Checkout reads API bodies defensively. Empty, HTML or otherwise non-JSON 500 responses now show a safe customer message instead of `Unexpected end of JSON input`.
- Expired-reservation cleanup is best-effort and can no longer block a new checkout; the route also has a final JSON error boundary.
- Hostinger builds no longer transpile `next.config.ts` with SWC. The equivalent `next.config.mjs`, Webpack build path and pinned `@next/swc-wasm-nodejs` fallback work on Hostinger servers that do not provide the GLIBC version required by native SWC.
- Admin access, OTP request/verification, order tracking, checkout and restock endpoints now have rate limits.
- OTP database state is created before email send and removed when delivery fails.
- Admin sessions were reduced to 12 hours; payment/webhook payloads gained parsing, timeout and size protections.
- Product catalogue database failures no longer silently show a fake starter product in production.
- Production uploads now require persistent `UPLOAD_DIR` storage.
- Security headers were added: CSP, HSTS, `nosniff`, frame denial, referrer, permissions and opener policies. `X-Powered-By` is disabled.
- Next.js and Nodemailer were upgraded; unused Cloudflare/Vite development tooling was removed.
- Required legal/grievance and return-shipping details are now explicit environment settings. Production checkout fails closed until they are complete.

## Automated verification completed

- `npm test`: passed.
  - 14/14 unit tests passed, including MySQL inventory-function, empty/non-JSON response, checkout JSON error-boundary, Hostinger build compatibility, nationwide PIN handling and international quote regressions.
  - TypeScript passed with no errors.
  - ESLint passed with no errors; 16 advisory `<img>` optimisation warnings remain.
- `NEXT_TEST_WASM=1 NEXT_TEST_WASM_DIR=... npx next build --webpack`: passed on Next.js 16.3.2 with native SWC deliberately disabled.
- `npm audit`: 0 known vulnerabilities across production and development dependencies.
- `npm audit --omit=dev`: 0 known production vulnerabilities.
- Hostinger reported that migration `0001_release_hardening` was successfully applied before the later Next.js build step failed. The migration journal makes subsequent deploy attempts idempotent; no rollback is required for this build failure.

## Hostinger deployment incident — 25 August 2026

- Database migration `0001_release_hardening` completed successfully and the starter catalogue seed completed.
- Hostinger's native Next.js SWC binary then failed because the server GLIBC is older than the binary's `GLIBC_2.29` requirement.
- Next.js downloaded its WASM fallback but failed while transpiling `next.config.ts`, leaving a missing generated `*.next.config` module.
- The release now uses `next.config.mjs`, `next build --webpack`, and the pinned matching `@next/swc-wasm-nodejs@16.3.2` fallback. A forced-WASM production build passes.

## Live-domain checks completed

- Home, shop, all four sitemap product URLs, checkout, login, account redirect, wishlist redirect, tracking, policies, admin redirect, robots and sitemap responded.
- Public product photos loaded in desktop browser checks.
- Add-to-bag and checkout navigation worked.
- Anonymous Admin API access returned `403`.
- Cross-site checkout creation returned `403`.
- Unsigned Razorpay webhook returned `401`.
- Invalid guest tracking and restock submissions returned `400`.
- Live Razorpay key ID/secret and webhook secret appear to be present because the payment API did not return `PAYMENTS_NOT_CONFIGURED` and unsigned webhooks were rejected. This does **not** prove they are the correct mode or that Razorpay is subscribed to the right events.
- The live server currently exposes `X-Powered-By` and lacks the full security-header set; the release candidate fixes this after deployment.
- The live `000000` PIN incorrectly returned serviceable; the release candidate fixes this.
- The live Sea Mist gallery contains repeated image entries; the release migration fixes and prevents this.

## Release blockers still open

1. Redeploy the Hostinger-compatible release candidate to staging or maintenance. Migration `0001_release_hardening` is already journalled; the build should apply only `0002_manual_delivery` to add the order country and expand postal-code storage.
2. Inspect the real `orders`, `order_items`, inventory, migration journal and image-row counts. Confirm database credentials use a least-privilege application user.
3. Fill the verified legal business name, postal address, customer-care contact, grievance officer and return-shipping responsibility. Do not invent these values.
4. Review domestic and international courier charges. Optional `pincode_rules` rows can refine Indian fees/estimates; set `INTERNATIONAL_SHIPPING_PAISE` only after approving a flat international rate.
5. Confirm Razorpay test keys, webhook URL and subscriptions to `payment.captured`, `payment.failed` and `refund.processed`.
6. In Razorpay test mode, test success, failed-attempt retry, duplicate webhook, timeout, expiry/late capture, sold-out conflict, reconciliation and repeated refund.
7. Make one controlled low-value live payment and refund. Verify exactly one order, one stock decrement, expected emails, account history, guest tracking, refund ID and exactly one stock restoration.
8. Test customer OTP email, owner order email and product restock email using the real Hostinger SMTP mailbox.
9. Verify `UPLOAD_DIR` survives a redeploy, then restore one database-and-uploads backup into staging.
10. Add production error/webhook/email monitoring and prove an alert reaches the owner.
11. Test current iPhone/Android browsers and a slow mobile connection. The CSS has mobile breakpoints, but a physical-device checkout and Razorpay overlay test remains necessary.
12. Keep Google Analytics and Meta Pixel IDs blank until the business approves a consent mechanism and final privacy wording.

## Recommended release sequence

1. Back up database and uploads.
2. Complete business, shipping, SMTP, upload and Razorpay test configuration.
3. Deploy to staging/maintenance and run the migration.
4. Execute the full test-mode matrix and inspect database rows.
5. Complete one low-value live payment/refund.
6. Recheck headers, mobile layout, emails, alerts and backup restore.
7. Only then enable public promotion and accept customer payments.

Razorpay integration reference: <https://razorpay.com/docs/developer-tools/integrations/standard-checkout/>  
Razorpay idempotent refund reference: <https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/>  
India Consumer Protection (E-Commerce) Rules: <https://consumeraffairs.gov.in/public/upload/files/E%20commerce%20rules_1732703966.pdf>

---

## Payment lifecycle follow-up — 26 August 2026

Verdict: **no-go for public payments until the live test matrix and operational checks below are completed.** The source is materially safer after the fixes in this section, but source review cannot prove Razorpay dashboard setup, deployed webhook reachability, capture settings, delivery email, database backup/restore or mobile checkout behaviour.

### Fixed in this follow-up

| Finding | Risk | Resolution |
| --- | --- | --- |
| Closing Razorpay left inventory reserved until expiry. | A cancelled checkout could make a size unavailable for up to 20 minutes. | The Razorpay dismissal callback calls an authenticated cancellation endpoint that atomically marks the local order cancelled and releases its reservation. Script/window-load failure uses the same release path. |
| A Razorpay `payment.failed` event was presented as a pending order. | Confusing order history and inaccurate customer tracking. | The order now changes to `payment_failed`, while retaining its reservation so Razorpay’s permitted retry on the same payment order can still succeed. |
| Cancelled/unpaid checkout attempts appeared in **My orders** and retained customer/cart data for 30 days. | Misleading customer history and unnecessary growth of personal checkout data. | **My orders** now includes only captured or refunded payments. On customer close, expiry, admin cancellation or payment-order setup failure, inventory is released, line items are deleted and customer/address data is replaced immediately. Only a minimal Razorpay/local-ID reconciliation stub remains for four days; a late captured cancellation is automatically marked for refund, never fulfilled. |
| Retry or late capture after a failed attempt could miss the existing reservation. | Reserved units could be stranded or incorrectly treated as unreserved. | Captured finalization now converts reservations for both `pending_payment` and `payment_failed` orders; expiry/cancellation handles both states. |
| Checkout permitted anonymous delivery-address entry and payment order creation. | Did not match the required account-first customer flow; orders were not reliably linked to an account. | Checkout shows sign-in/create-account before the address form. Server-side create, payment verification and cancellation endpoints also enforce account ownership and the account email. |
| Webhook capture handling did not bind its amount/currency before inventory finalization. | A signed but unexpected event could affect a local order. | Signed events must now also match the stored Razorpay order, local amount and INR currency. `order.paid` is supported alongside `payment.captured`. |
| Coupon limit could change during checkout without an atomic capture-time claim. | A limited discount could be granted more times than intended. | Coupon usage is now incremented only by a conditional transaction update at capture. If the limit has been reached, fulfilment rolls back, the reservation releases, and a full refund is requested. |
| A captured order that could not be fulfilled left its reservation stranded and only said a refund was automatic. | Stock could remain blocked; refund depended on manual work despite customer messaging. | The rollback case releases the reservation and makes a full Razorpay refund request after the response, using Razorpay’s stable `X-Refund-Idempotency` header. Failures remain visible as `refund_pending` for admin retry. |
| An async `refund.processed` webhook did not restore units chosen for “Refund & restock”. | A successful customer refund could permanently reduce sellable stock. | Migration `0006_refund_restock` persists restock intent; the webhook restores stock once through `stock_restored_at`. |
| A partial/manual refund webhook could previously mark a full order refunded, and an admin restock could happen while Razorpay still showed the refund as pending. | A partially refunded order could disappear from fulfilment or stock could be returned before the customer’s refund was confirmed. | The signed webhook must now match the local full amount, INR currency and recorded refund ID. Stock returns only after Razorpay confirms a full refund; `stock_restored_at` keeps that action idempotent. |
| The Orders screen mixed payment attempts, refunds and paid fulfilment work in one dense table. | A payment failure or refund-pending order was easy to mistake for a shipment. | The default **To pack** view contains only `captured` payments in a valid fulfilment state, with delivery address, phone, email and items. Failed/cancelled/refund cases are isolated in **Payment review** with no shipping controls. |
| Ten-digit order numbers had only a two-digit random suffix. | Low but real order-number uniqueness collision during busy checkout. | New orders use a fourteen-digit `CAS` number; tracking accepts historic ten-digit and new fourteen-digit formats. |

### Razorpay implementation check

The source now follows the core Standard Checkout requirements: a server-created Razorpay Order is passed to checkout, the browser response is server-side HMAC verified using the local order ID, the payment is fetched from Razorpay before customer success is shown, and fulfilment waits for `captured`. Webhook HMAC uses the raw request body. Capture and refund events additionally bind the stored payment/order IDs, local amount and INR currency before changing fulfilment or stock. `payment.captured`, `order.paid`, `payment.failed` and `refund.processed` should be configured in the Razorpay Dashboard. See Razorpay’s [Standard Checkout guide](https://razorpay.com/docs/developer-tools/integrations/standard-checkout/), [payment-event reference](https://razorpay.com/docs/webhooks/payments/) and [idempotent refund API](https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/).

### Verification performed on this source

- `npm run test:unit`: 11/11 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with no errors. Existing image-optimisation advisory warnings remain.
- `npm audit --omit=dev --offline`: 0 production vulnerabilities found.
- Environment variable presence was checked without reading values; all required local payment, database, SMTP, legal, authentication and upload settings are populated. This does **not** verify they are correct in Hostinger or in Razorpay test/live mode.

### Required before the public go-live decision

1. Deploy this source and all pending migrations to staging, then verify the migration journal entries, including `0006_refund_restock` and `0007_homepage_editor`.
2. In Razorpay **test mode**, test: success; modal close/cancel; failed payment then retry; payment with browser closed; delayed capture; duplicate `payment.captured`/`order.paid`; invalid signature; sold-out capture; coupon-limit race; a partial/manual refund webhook; and immediate and asynchronous full refunds with exactly one restock.
3. Confirm Dashboard auto-capture is enabled for Orders API payments and that the public HTTPS webhook responds correctly in **live mode**. Subscribe to the four events above; monitor failed deliveries.
4. Verify one low-value live payment and refund end-to-end: one database order, one stock decrement, emails, account history, tracking, refund ID and exactly one restock.
5. Add a durable queue/alerting mechanism for webhook/refund/email failures. The current post-response automatic-refund attempt is idempotent and leaves `refund_pending` for Admin retry, but it is not a durable background worker.
6. Complete the existing legal, shipping-price, backup-restore and physical mobile-device checks in the launch checklist.
