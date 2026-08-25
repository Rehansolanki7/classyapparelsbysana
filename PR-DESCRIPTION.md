# Suggested PR title

Harden checkout payments, inventory, refunds, and release readiness

# Summary

This PR applies the end-to-end release audit fixes for Classy Apparels by Sana.

- Makes order capture, inventory decrement and coupon usage atomic and idempotent.
- Fixes the live MySQL checkout failure by replacing scalar `MAX(0, value)` usage with `GREATEST(0, value)`.
- Prevents the checkout UI from crashing on empty or non-JSON backend failures.
- Fixes Hostinger's older-GLIBC build failure by removing SWC-dependent TypeScript config loading, using Next.js's Webpack build path and pinning the matching WASM compiler fallback.
- Makes reservation cleanup best-effort and guarantees JSON checkout errors.
- Hardens failed-attempt retries, late captures, duplicate webhooks, refunds and one-time restocking.
- Adds manual Razorpay reconciliation in the Admin Studio.
- Fixes duplicate product-image seeding and adds a cleanup/uniqueness migration.
- Rejects malformed PINs while using server-calculated shipping for every valid Indian PIN.
- Enables nationwide manual delivery for every valid Indian PIN, provides all Indian state/UT and ISO country choices, persists the destination country, and supports safe manual international shipping quotes.
- Adds rate limits, security headers, shorter admin sessions and production configuration gates.
- Upgrades vulnerable dependencies and removes unused deployment tooling.
- Adds the release checklist and full audit report.

# Reported production incident

The live build attempted:

```sql
reserved_stock = MAX(0, reserved_stock - ?)
```

`MAX` is an aggregate function in MySQL. The corrected release uses:

```sql
reserved_stock = GREATEST(0, reserved_stock - ?)
```

The backend exception previously produced an empty/non-JSON error response. Checkout called `response.json()` unconditionally, which caused `Unexpected end of JSON input`. Both the database cause and UI failure mode are fixed.

# Verification

- `npm test`: 14/14 tests passed.
- TypeScript: passed.
- ESLint: 0 errors; existing advisory image-optimisation warnings only.
- Forced-WASM `next build --webpack`: passed on Next.js 16.3.2 with native SWC disabled.
- `npm audit`: 0 known vulnerabilities.

# Deployment notes

- Back up the production database and uploads first.
- Hostinger has already applied `drizzle-hostinger/0001_release_hardening.sql`; the migration journal will skip it. The normal build applies `0002_manual_delivery.sql` once to store country codes and international postal formats.
- The build intentionally uses `next.config.mjs`, Webpack and the pinned matching WASM compiler fallback for Hostinger's older GLIBC runtime.
- Configure the required legal/business and shipping environment values.
- Test Razorpay success, failed-attempt retry, duplicate webhook, reconciliation and refund in test mode.
- Complete one controlled low-value live payment/refund before opening checkout publicly.
