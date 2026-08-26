# Launch checklist — Classy Apparels by Sana

Use this list in order. A tick only means the item is complete once it has been tested on the final domain.

## Built into this package

- [x] Standard Next.js application for Hostinger Node.js hosting.
- [x] Hostinger MySQL schema plus one-time migration and starter catalogue.
- [x] Customer email-code sign-in and recovery flow.
- [x] `shop@classyapparelsbysana.com` configured as the owner account.
- [x] One private admin access-key screen, separate from customer sign-in.
- [x] Product inventory, secure uploads, wishlist and restock sign-ups.
- [x] India-wide manual delivery, all state/UT options, international addresses with manual quotes, courier tracking and refund request code.
- [x] Razorpay order/signature/webhook verification code.
- [x] Order confirmation and owner email-notification code through business-mail SMTP.
- [x] Sitemap, robots file, canonical product URLs, product structured data, optional Google Analytics and Meta Pixel hooks.

## Must be configured and tested before real orders

- [ ] Add MySQL, owner-session, business-email and upload-folder settings in Hostinger.
- [ ] Publish the verified legal business name, postal address, customer-care contact, grievance officer and return-shipping responsibility using the required environment values. Production checkout deliberately stays disabled until these are present.
- [ ] Rebuild the app after adding MySQL settings and confirm the Sea Mist product appears in `/admin`. The safe database migration runs automatically during every build.
- [ ] Set `ADMIN_ACCESS_KEY` in Hostinger and test it at `/admin/login`.
- [ ] Test a customer sign-in with a non-owner email.
- [ ] Set Hostinger mailbox SMTP details and confirm sign-in and order emails arrive at `shop@classyapparelsbysana.com`.
- [ ] Create a writable `uploads` folder beside `public_html`, set `UPLOAD_DIR` to its absolute path and `UPLOAD_PUBLIC_PATH=/media`, then test one product image upload after a redeploy.
- [ ] Create a Razorpay account, use test keys first, then configure the production webhook for `payment.captured`, `order.paid`, `payment.failed` and `refund.processed` before adding live keys.
- [ ] Run controlled test-mode cases: successful payment; close/cancel before payment (stock returns immediately, no account order/history entry and no retained address/cart); failed attempt then retry; duplicate webhook delivery; late capture after cancellation (automatic refund, never fulfil); checkout timeout; sold-out conflict; expired reservation; full refund and repeated refund request.
- [ ] Confirm a signed-out shopper is asked to sign in or create an account before entering a delivery address; confirm a saved checkout address and order are visible in that account afterwards.
- [ ] Make one low-value live payment and refund it. Verify the MySQL order/line items/payment IDs, single stock decrement, owner email, customer email, account history and guest tracking.
- [ ] Review the ₹99 domestic fee/free-shipping threshold. Optional `pincode_rules` rows may override the fee or estimate, but cannot block a valid Indian PIN while nationwide manual delivery is enabled.
- [ ] For online international payment, set a reviewed flat `INTERNATIONAL_SHIPPING_PAISE`; otherwise international customers are safely routed to WhatsApp for a manual courier quote.
- [ ] Review and publish the final shipping, return, exchange, privacy and terms wording.
- [ ] Upload final product names, prices, stock and real product photographs.

## Requires a separate business choice or external account

- [ ] Customer photo-review moderation and display: database foundation is present; choose the review policy before enabling the customer submission page.
- [ ] Abandoned-cart email/WhatsApp reminders: requires consent wording and a sending provider/API.
- [ ] GST invoices: requires the business GSTIN, invoice-number format and tax treatment.
- [ ] Google Merchant feed and Instagram catalogue/shop: requires verified Google/Meta business accounts.
- [ ] Analytics and advertising tracking: add the Google Analytics and Meta Pixel IDs only after their accounts are created.
- [ ] Error monitoring: choose an alerting service, add its project key, and verify that failed checkout, webhook and email-notification alerts reach the owner.
- [ ] Monthly off-site backup/export: schedule database and uploads exports, then perform and document one restore drill.
