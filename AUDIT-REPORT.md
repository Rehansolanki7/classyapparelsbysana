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
