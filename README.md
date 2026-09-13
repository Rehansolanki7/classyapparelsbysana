# Classy Apparels by Sana

This repository contains a Next.js ecommerce application for a boutique apparel store.

Deployment-specific identifiers and credentials are intentionally not documented here. Configure them through the deployment provider's environment-variable settings and never commit real secrets.

## Included features

- Customer email-code sign-in, account recovery, addresses and order history.
- Protected administrator workspace for products, inventory, orders, shipping and site content.
- MySQL schema with repeatable migrations and starter catalogue data.
- Razorpay order creation, signature verification, payment webhooks and refund handling.
- Secure product-image uploads served through the application.
- Order confirmation and administrator notification emails.
- Guest order tracking using an order number and checkout email.

## Requirements

- Node.js 22 or newer.
- npm.
- MySQL-compatible database.

## Local development

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values for your own development environment. Keep `.env` private and do not paste credentials into issues, chat or source files.

3. Apply database migrations when database variables are configured:

   ```sh
   npm run db:migrate
   ```

4. Start the development server:

   ```sh
   npm run dev
   ```

The local fallback catalogue is disabled by default. Keep `ALLOW_CATALOG_FALLBACK=false` except for an intentional, non-production catalogue demo.

## Environment configuration

`.env.example` is the source of truth for supported configuration names. Values commonly required in a deployed environment include:

- `SITE_URL`, owner/customer-care contact settings and required legal/business details.
- `AUTH_SECRET` and `ADMIN_ACCESS_KEY`, each generated as a unique private random value.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD`.
- SMTP settings for transactional email.
- `UPLOAD_DIR` and `UPLOAD_PUBLIC_PATH` for product media.
- Razorpay credentials and webhook secret.
- Optional Instagram and analytics integration values.

Do not copy production values into this repository. Use the deployment provider's secret/environment-variable manager.

## Deployment

For a Node.js deployment:

1. Use Node.js 22 or newer.
2. Upload the source without `node_modules` or `.next`.
3. Configure all required values from `.env.example` in the provider dashboard.
4. Use `npm install && npm run build` as the build command and `npm start` as the start command.
5. Ensure the configured media directory is writable by the application.
6. Confirm the admin login, customer login, email delivery, product images, order creation and fulfilment workflow after deployment.

The build applies the repeatable database migrations before creating the production build. Run it only while the intended database variables are configured.

## Payment readiness

Before enabling live payments:

1. Complete a customer sign-in test.
2. Verify product images and inventory on the deployed application.
3. Configure Razorpay test credentials and complete a test payment.
4. Configure the webhook endpoint as `https://<your-domain>/api/payments/webhook` and verify its secret.
5. Confirm administrator and customer notification emails.
6. Switch to live credentials only after the complete test flow succeeds.

## Verification commands

```sh
npm test
npm run build
npm audit --omit=dev
```

`npm test` runs unit tests, lint and TypeScript validation. `npm run build` also runs database migrations, so use it with a correctly configured database.

## Security notes

- Never commit `.env`, database passwords, SMTP passwords, payment keys, webhook secrets or third-party access tokens.
- Never place private credentials in README files, screenshots, logs or support messages.
- Keep database and media backups protected and test restores regularly.
- Use a unique administrator access key of at least 32 characters.
- Keep production-only integrations and live payment credentials disabled until they have been verified.
