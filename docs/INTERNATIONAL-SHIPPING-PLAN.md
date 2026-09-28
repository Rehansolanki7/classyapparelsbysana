# International shipping and trusted checkout plan

## Decision

Keep international customers on the website. Start with **admin-managed country and weight-band rates in INR**, not a live courier API. This gives the shop control over the countries, prices and delivery promises it can actually fulfil while allowing an eligible customer to see a final total and pay through the existing checkout.

WhatsApp should remain an optional support channel, never the normal international checkout path. If a destination cannot be priced automatically, keep the customer's bag and address on the site and create a trackable quote request instead of sending them away to start again.

This is intentionally a phased plan. Do not enable every country at once.

## Why the current journey loses trust

The checkout already collects an international country, postal code, phone number and address. However, `shippingForDestination` marks every non-India destination as requiring a manual quote, and the checkout then replaces payment with a WhatsApp link. From a customer's point of view this changes a structured, secure purchase into an untracked conversation just before payment.

The improved journey should answer four questions before the payment window opens:

1. **Can you ship to me?** Show availability immediately after country and postal code are entered.
2. **What will it cost?** Show one server-calculated shipping amount in the order summary.
3. **When should it arrive?** Show an honest range and state that customs can add time.
4. **Will I pay anything later?** State whether duties and import taxes are included or payable by the recipient.

## Recommended customer experience

### Eligible destination

1. Customer chooses a country and enters the full address and postal code.
2. The site obtains a server-side quote using destination country and packed cart weight.
3. Checkout shows:
   - `International tracked shipping`;
   - the shipping price;
   - the estimated dispatch and delivery ranges;
   - the courier/service when one is fixed;
   - the duties policy;
   - a short rate-validity message.
4. The customer continues to the existing secure payment window without leaving the site.
5. The order confirmation and tracking pages show the same shipping service and duties policy captured at checkout.

### Destination needing review

Do not redirect to WhatsApp. Show an in-site **Request a shipping quote** action which:

- saves the signed-in customer's bag, address, packed weight and contact email;
- creates a quote reference visible in admin;
- emails the customer immediately to confirm the request was received;
- lets the administrator add a price, delivery range, expiry time and note;
- emails a secure `Review and pay` link when the quote is ready; and
- recalculates product price, stock and coupon eligibility when the customer returns, while preserving the approved shipping price until its expiry.

WhatsApp can appear as `Need help?`, alongside email support, but it must not be required to complete the order.

### Unsupported destination

Show a clear message before the customer completes the full form: `We do not deliver to this country yet.` Offer an email notification for future availability. Do not imply that payment might work.

## Custom shipping model

### 1. International shipping zones

Create named zones made from explicit ISO country codes, for example:

| Example zone | Initial countries | Purpose |
| --- | --- | --- |
| Gulf | AE, BH, KW, OM, QA, SA | A small first market with one reviewed courier contract |
| UK | GB | Separate rates and customs messaging |
| North America | US, CA | Separate price and delivery bands |

These are examples, not launch configuration. Operations must choose only countries covered by a verified courier account. A country may belong to only one active zone.

### 2. Weight-band rates

For each zone, store one or more inclusive packed-weight bands such as 500 g, 1 kg and 2 kg. Each band should contain:

- carrier charge in paise;
- international handling/packaging charge in paise;
- delivery-day minimum and maximum;
- optional courier and service names;
- a `serviceable` switch;
- the date the rate was last reviewed; and
- an optional expiry date.

Calculate shipping for the complete cart, once, by selecting the smallest active band whose limit covers the packed cart weight. Never trust a price or weight sent by the browser. The existing product `packedWeightGrams` values and server-side cart calculation can remain the source of truth.

For the first release, charge and settle in INR. The UI may later show an explicitly labelled approximate local-currency conversion, but the payment amount, order record, email and refund must all use the same settlement currency. Confirm international card/payment-method activation and supported customer countries in the payment provider account before launch.

### 3. Country overrides and exclusions

Support a country-level override for cases where one country in a zone costs more, has a different delivery range, or must be disabled. Postal-code exceptions can be added later only where the courier's data proves they are needed; avoid maintaining worldwide postal rules manually at launch.

Use this precedence order:

1. disabled country override;
2. active country-specific rate for the cart weight;
3. active zone rate for the cart weight;
4. in-site manual quote request.

### 4. Duties and taxes

Add one required policy to each international zone:

- **Duties prepaid/included** only when the courier and business process genuinely support it; or
- **Duties not included** with a plain-language notice that the recipient may be charged by local customs before delivery.

Store the policy shown to the customer on the order. Do not rely only on current admin settings, because those can change after purchase. Have the final wording and destination restrictions reviewed by the courier/accountant or other qualified adviser before launch.

## Proposed data changes

Keep the existing domestic `shipping_rate_cards` and `pincode_rules` unchanged. Add separate international tables so the stable India flow is not made more complex.

### `international_shipping_zones`

- `id`, `name`, `active`
- `handling_charge_paise`
- `delivery_days_min`, `delivery_days_max`
- `duties_policy` (`included` or `recipient_pays`)
- `customer_notice`
- `last_reviewed_at`, `created_at`, `updated_at`

### `international_shipping_countries`

- `id`, `zone_id`, `country_code`
- `active`
- optional `delivery_days_min`, `delivery_days_max` overrides
- optional `customer_notice`
- unique constraint on `country_code`

### `international_shipping_rates`

- `id`, `zone_id`
- optional `country_code` for an override
- `weight_limit_grams`
- `carrier_charge_paise`
- optional `courier_name`, `service_name`
- `active`, `valid_until`, `last_reviewed_at`
- unique constraint on zone/country/weight band

### Order quote snapshot

Add order fields for `shipping_zone`, `shipping_service`, `shipping_currency`, `billed_weight_grams`, `delivery_days_min`, `delivery_days_max`, `duties_policy` and `shipping_notice`. Continue storing `shippingPaise`, but treat all these fields as the immutable quote accepted at payment time.

### `international_quote_requests` (fallback phase)

Store the customer, address, cart snapshot, cart weight, status, quoted shipping amount, expiry and an opaque single-use payment-link token. Never put address or payment details in the link itself. Apply the same authentication, rate limiting, retention and audit practices used by checkout.

## Application work by area

### Shipping domain

- Extend the shipping types with an international quote type and explicit quote source (`rate_card`, `country_override`, or `manual`).
- Add a pure `calculateInternationalShippingFromCards` function so rate selection can be tested without a database.
- Update `shippingForDestination` to load international configuration for non-India countries instead of immediately returning a WhatsApp quote.
- Return machine-readable reason codes such as `COUNTRY_UNAVAILABLE`, `RATE_NOT_FOUND`, `RATE_EXPIRED` and `WEIGHT_OVER_LIMIT` in addition to customer-safe copy.
- Keep the domestic calculation and its fixed handling fee unchanged.

### Admin shipping workspace

Add an `International` section beside the existing India rate editor:

- activate/deactivate countries;
- group countries into zones;
- edit weight bands, handling, courier, delivery estimate and expiry;
- preview a quote by country and cart weight;
- warn about missing bands, overlapping country assignments and stale rates;
- require duties policy acknowledgement before publishing; and
- log every publish action without logging customer data.

Publishing must validate the complete configuration on the server and update it transactionally, following the existing domestic shipping endpoint pattern.

### Checkout

- Debounce destination checks instead of depending only on field blur.
- Show a loading state, quoted state, unavailable state and review-required state without replacing the whole checkout with an error.
- Display `Products`, `International tracked shipping`, `Discount` and `Total` as separate rows.
- Display duties and delivery copy directly above the pay button and require no hidden consent.
- Submit only destination and cart selections; recalculate the entire quote inside order creation.
- Use the server response as the final displayed total before opening payment.
- Keep the bag intact if quoting or payment fails.

### Payment and orders

- Verify in the live payment account that international payments are enabled before exposing any country.
- Continue creating the gateway order only after stock reservation and authoritative shipping calculation succeed.
- Save the international quote snapshot in the same database transaction as the order and items.
- Ensure signatures, webhooks, reconciliation, refunds and notification emails work for an international test card in provider test mode.
- Keep INR as the only charged currency in the first release unless the entire order/refund/email model is deliberately migrated to multi-currency.

### Fulfilment and tracking

- Show destination country, billed weight, duties policy and selected shipping service in the admin order view.
- Require courier, tracking number and URL before marking an international order shipped.
- Include the tracking link and customs notice in customer email and order tracking.
- Document the commercial-invoice/customs workflow outside the software and train the fulfiller before enabling live orders.

## Delivery phases

### Phase 0 — operational readiness

1. Select one courier/service and request written rates for a small set of target countries and weight bands.
2. Confirm prohibited items, packaging/volumetric-weight rules, pickup process, address requirements, loss coverage, returns and customs paperwork.
3. Confirm the payment account can accept international customers in test and live mode.
4. Decide the duties policy and have customer-facing wording reviewed.
5. Audit every active product's packed weight; products with zero weight must remain unavailable for automatic international checkout.

**Exit:** there is an owner-approved rate sheet, service promise and exception process.

### Phase 1 — trusted fixed-rate checkout (recommended MVP)

1. Add international zone, country, rate and order-snapshot migrations.
2. Add pure quote calculation and server-side validation.
3. Add admin management and preview.
4. Update checkout totals and trust copy.
5. Add confirmation, admin-order and tracking details.
6. Launch behind an `INTERNATIONAL_CHECKOUT_ENABLED` feature flag for one or two countries.

**Exit:** an eligible international customer can receive a final server-calculated total and complete payment entirely on the site.

### Phase 2 — in-site manual quotes

Add the quote-request inbox and secure review-and-pay link for destinations outside automatic bands. This replaces the current mandatory WhatsApp escape hatch while allowing unusual orders to be handled safely.

**Exit:** review-required customers remain identifiable and recoverable in the website journey.

### Phase 3 — carrier API, only if volume justifies it

Integrate a courier aggregator or carrier for live rates, labels and tracking after fixed rates reveal actual demand. Cache short-lived quotes, apply timeouts, keep an admin fallback rate, and never let a carrier outage silently produce free shipping. Keep the stored order quote immutable even if the carrier later changes its price.

## Test and acceptance checklist

### Automated tests

- country maps to exactly one active zone;
- smallest eligible weight band is selected at boundary weights;
- handling is added exactly once per cart;
- inactive, expired, overweight and unknown-country quotes cannot reach payment;
- country override wins over its zone;
- domestic shipping results do not change;
- the browser cannot alter item price, packed weight, shipping price or duties policy;
- create-order and serviceability return the same quote for the same server-side inputs;
- order stores the accepted quote snapshot;
- coupon, reservation, cancellation, webhook and refund paths include international shipping correctly; and
- admin rejects duplicate countries, duplicate bands, invalid ranges and incomplete duties policy.

### Manual launch tests

- test the lightest, exact-boundary and heaviest supported carts for every launch country;
- test mobile checkout with a real international address format and calling code;
- complete provider test payments for success, dismissal, failure and delayed webhook;
- verify admin notification, customer email, tracking page, cancellation and full refund;
- compare the checkout charge with the courier's rate sheet;
- confirm the duties message is visible before payment and repeated after purchase; and
- disable the feature flag and confirm India checkout remains available.

## Rollout and monitoring

1. Enable staff-only/test accounts, then one country, then a small country group.
2. Review the first 10 orders manually before dispatch and compare quoted versus actual courier cost.
3. Track quote success rate, checkout completion by country, actual-minus-charged shipping, delivery time, customs issues, refunds and support contacts.
4. Alert on missing/expired rates and repeated quote or gateway failures.
5. Review rates on a fixed schedule and automatically stop quoting expired bands.
6. Use the feature flag or country switch as the kill switch; never edit code during an operational incident.

## Definition of done

International checkout is ready only when:

- customers in enabled countries see availability, shipping cost, delivery estimate and duties policy before payment;
- eligible customers stay on the site from bag to confirmation;
- every charged amount is recalculated on the server and snapshotted on the order;
- unsupported and review-required customers receive an honest in-site next step;
- operations can change or disable countries and rates without a deployment;
- payment, refund, email, tracking and fulfilment have been tested end to end; and
- India checkout has passed regression tests unchanged.
