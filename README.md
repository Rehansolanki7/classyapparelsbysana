# Classy Apparels by Sana — Hostinger package

This is the release-candidate source package for `classyapparelsbysana.com`. Do not enable public payments until every item in `LAUNCH-CHECKLIST.md` has been verified on the deployed domain.

It is a standard Next.js application for a Hostinger Node.js Web App. It does **not** use ChatGPT sign-in, Cloudflare D1, R2, Supabase, or the three temporary test administrators.

## What is included

- Normal email-code customer sign-in and account recovery.
- `shop@classyapparelsbysana.com` as the permanent owner account.
- One private Hostinger admin access key at `/admin/login`.
- Hostinger MySQL schema, migration, and the existing Sea Mist starter catalogue.
- Product, inventory, order, tracking, and secure photo-upload foundations.
- Razorpay server-side order creation, signature verification, and webhook verification.
- Order-confirmation and owner-notification email code through the Hostinger mailbox SMTP settings.
- SEO metadata using the final domain and the existing product image set.

## Deploy once the package is uploaded

1. In Hostinger, create a **Node.js Web App** for `classyapparelsbysana.com` using Node 22 or newer.
2. Upload this source package (not `node_modules` or `.next`). Set the build command to `npm install && npm run build` and the start command to `npm start`. The build now safely creates any missing MySQL tables and the starter catalogue automatically.
3. Add every value from `.env.example` in Hostinger's environment-variable settings. Keep all real passwords and API keys there only. Use `DB_HOST=127.0.0.1` (not `localhost`) on Hostinger.
4. No separate database command is needed: the build runs the safe, repeatable database migration automatically. Confirm the Sea Mist product appears in `/admin` after deployment.
5. Create a writable `uploads` folder beside `public_html` on the domain, then set `UPLOAD_DIR` to that folder's absolute Hostinger path and `UPLOAD_PUBLIC_PATH=/media`. The application serves the files itself, so the storage folder does not need to be public.
6. Set `ADMIN_ACCESS_KEY` to a unique value of at least 32 characters, then visit `/admin/login` and enter it. Customer email-code login stays at `/login`.

## Before accepting a real payment

Do these in the listed order:

1. Test email login from a customer email address.
2. Confirm product photos remain visible after a deployment.
3. Add Razorpay **test** keys and complete one test UPI/card order.
4. Set the Razorpay webhook to `https://classyapparelsbysana.com/api/payments/webhook`, subscribe to `payment.captured`, `payment.failed` and `refund.processed`, and verify the webhook secret.
5. Confirm the owner and customer receive the paid-order emails.
6. Switch to Razorpay live keys only after all previous tests pass.

## Important notes

- There is no COD flow.
- Shipping is intentionally manual at launch: add verified delivery PINs to `pincode_rules`, then set courier, AWB and tracking in the Admin Studio after dispatch. Unknown PINs fail closed by default.
- Confirm Hostinger backup coverage and perform a restore drill; do not assume a backup is usable until it has been tested. Keep a monthly off-site database and uploads export.
- Never send database, mailbox SMTP, Razorpay, or Instagram passwords in chat or put them in source files.

## Verification commands

- `npm test` runs unit checks, lint and TypeScript validation.
- `npm run build` applies database migrations and creates the production build; run it only with the intended Hostinger database variables.
- `npm audit --omit=dev` checks production dependencies.
