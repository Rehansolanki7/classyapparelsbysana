import { and, eq, gt, or, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orderItems, orders, products, productVariants } from "../../../../db/schema";
import { rejectCrossSite } from "../../../../lib/security";
import { isValidIndianPincode, isValidInternationalPostalCode, shippingForDestination } from "../../../../lib/shipping";
import { couponDiscount } from "../../../../lib/coupons";
import { cancelPendingOrderAndRelease, releaseExpiredReservations } from "../../../../lib/orders";
import { businessConfiguration } from "../../../../lib/business";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../../lib/rate-limit";
import { normalizeCountryCode } from "../../../../lib/locations";
import { errorCode, recordEvent } from "../../../../lib/logging";
import { currentUser } from "../../../../lib/auth";

type CheckoutItemPayload = { productId?: string; size?: string; quantity?: number };
type CheckoutPayload = {
  items?: CheckoutItemPayload[];
  productId?: string;
  size?: string;
  quantity?: number;
  couponCode?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    countryCode?: string;
    postalCode?: string;
    formattedAddress?: string;
    placeId?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
};

type ReservedItem = {
  productId: string;
  productName: string;
  pricePaise: number;
  variantId: number;
  size: string;
  quantity: number;
  packedWeightGrams: number;
};

class ReservationError extends Error {}

function clean(value: string | undefined, max: number) {
  return (value ?? "").trim().replace(/[<>]/g, "").slice(0, max);
}

function validateCustomer(payload: CheckoutPayload) {
  const customer = payload.customer ?? {};
  const latitude = Number(customer.latitude);
  const longitude = Number(customer.longitude);
  const countryCode = normalizeCountryCode(customer.countryCode);
  const normalized = {
    name: clean(customer.name, 100),
    email: clean(customer.email, 180).toLowerCase(),
    phone: clean(customer.phone, 20).replace(/[^0-9+]/g, ""),
    addressLine1: clean(customer.addressLine1, 220),
    addressLine2: clean(customer.addressLine2, 220),
    city: clean(customer.city, 100),
    state: clean(customer.state, 100),
    countryCode,
    postalCode: countryCode === "IN"
      ? clean(customer.postalCode, 20).replace(/\D/g, "")
      : clean(customer.postalCode, 20).toUpperCase().replace(/[^A-Z0-9 /-]/g, ""),
    formattedAddress: clean(customer.formattedAddress, 400),
    placeId: clean(customer.placeId, 220),
    latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? latitude : null,
    longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? longitude : null,
  };
  if (!normalized.countryCode) return { error: "Select a valid delivery country" } as const;
  if (normalized.name.length < 2) return { error: "Enter your full name" } as const;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) return { error: "Enter a valid email" } as const;
  const phoneDigits = normalized.phone.replace(/\D/g, "");
  if (phoneDigits.length < 7 || phoneDigits.length > 15) return { error: "Enter a valid phone number with country code" } as const;
  if (normalized.countryCode !== "IN" && !normalized.phone.startsWith("+")) return { error: "Include the country calling code in your phone number" } as const;
  if (normalized.addressLine1.length < 5 || !normalized.city || !normalized.state) return { error: "Enter your complete delivery address" } as const;
  if (normalized.countryCode === "IN" && !isValidIndianPincode(normalized.postalCode)) return { error: "Enter a valid 6-digit Indian PIN code" } as const;
  if (normalized.countryCode !== "IN" && !isValidInternationalPostalCode(normalized.postalCode)) return { error: "Enter a valid postal or ZIP code; use N/A if your country has no postal codes" } as const;
  return { customer: normalized } as const;
}

function normalizeItems(payload: CheckoutPayload) {
  const requested = payload.items?.length ? payload.items : [{ productId: payload.productId, size: payload.size, quantity: payload.quantity }];
  if (!requested.length || requested.length > 10) return { error: "Your bag has an invalid number of items" } as const;
  const grouped = new Map<string, Required<CheckoutItemPayload>>();
  for (const item of requested) {
    const productId = clean(item.productId, 100);
    const size = clean(item.size, 20);
    const quantity = Math.floor(Number(item.quantity));
    if (!productId || !size || !Number.isInteger(quantity) || quantity < 1 || quantity > 5) return { error: "Invalid product selection" } as const;
    const key = `${productId}\u0000${size}`;
    const existing = grouped.get(key);
    const totalQuantity = (existing?.quantity ?? 0) + quantity;
    if (totalQuantity > 5) return { error: "A maximum of 5 units is allowed for one size" } as const;
    grouped.set(key, { productId, size, quantity: totalQuantity });
  }
  return { items: [...grouped.values()] } as const;
}

async function createOrder(request: Request) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  const rate = checkRateLimit(`checkout:${clientAddress(request)}`, 10, 15 * 60 * 1000, 30 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  const user = await currentUser();
  if (!user || user.adminAuthenticated) {
    return Response.json({ error: "Sign in or create an account before adding a delivery address and checking out.", code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  const keys = process.env;
  if (!keys.RAZORPAY_KEY_ID || !keys.RAZORPAY_KEY_SECRET) return Response.json({ error: "Online payments are not activated yet", code: "PAYMENTS_NOT_CONFIGURED" }, { status: 503 });
  if (process.env.NODE_ENV === "production" && !businessConfiguration().ready) {
    return Response.json({ error: "Checkout is temporarily unavailable while the required business and grievance details are being completed.", code: "LEGAL_CONFIGURATION_REQUIRED" }, { status: 503 });
  }

  let payload: CheckoutPayload;
  try {
    payload = (await request.json()) as CheckoutPayload;
  } catch {
    return Response.json({ error: "Invalid checkout request" }, { status: 400 });
  }
  const validated = validateCustomer(payload);
  if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });
  if (validated.customer.email !== user.email) {
    return Response.json({ error: "Use the email address on your signed-in account for this order." }, { status: 400 });
  }
  const normalizedItems = normalizeItems(payload);
  if ("error" in normalizedItems) return Response.json({ error: normalizedItems.error }, { status: 400 });

  try {
    await releaseExpiredReservations();
  } catch (error) {
    // Cleanup is maintenance work. A cleanup failure must not turn a new
    // customer checkout into an empty 500 response.
    await recordEvent({ severity: "warning", eventType: "checkout.reservation_cleanup_failed", detail: errorCode(error) });
  }
  const db = getDb();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [recent] = await db.select({ count: sql<number>`count(*)` }).from(orders).where(and(gt(orders.createdAt, tenMinutesAgo), or(eq(orders.phone, validated.customer.phone), eq(orders.email, validated.customer.email))));
  if ((recent?.count ?? 0) >= 3) return Response.json({ error: "Too many checkout attempts. Wait a few minutes or message Sana." }, { status: 429 });

  const selected: ReservedItem[] = [];
  for (const requested of normalizedItems.items) {
    const [selection] = await db.select({
      productId: products.id,
      productName: products.name,
      pricePaise: products.pricePaise,
      packedWeightGrams: products.packedWeightGrams,
      status: products.status,
      variantId: productVariants.id,
      variantActive: productVariants.active,
    }).from(products).innerJoin(productVariants, eq(productVariants.productId, products.id)).where(and(eq(products.id, requested.productId), eq(productVariants.size, requested.size))).limit(1);
    if (!selection || selection.status !== "active" || !selection.variantActive) return Response.json({ error: "One of the selected items is no longer available" }, { status: 409 });
    if (selection.packedWeightGrams <= 0) return Response.json({ error: "This product is not yet configured for delivery. Please message Sana for a shipping quote before payment.", code: "PRODUCT_SHIPPING_WEIGHT_MISSING" }, { status: 409 });
    selected.push({ ...selection, size: requested.size, quantity: requested.quantity });
  }

  const subtotalPaise = selected.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0);
  const cartWeightGrams = selected.reduce((sum, item) => sum + item.packedWeightGrams * item.quantity, 0);
  const coupon = await couponDiscount(payload.couponCode, subtotalPaise);
  if (coupon.error) return Response.json({ error: coupon.error }, { status: 400 });
  const serviceability = await shippingForDestination(validated.customer.countryCode, validated.customer.postalCode, { cartWeightGrams, state: validated.customer.state });
  if (!serviceability.serviceable) {
    if (serviceability.manualQuoteRequired) {
      return Response.json({ error: serviceability.note, code: "MANUAL_SHIPPING_QUOTE_REQUIRED" }, { status: 409 });
    }
    return Response.json({ error: serviceability.note || "We could not confirm this delivery address." }, { status: 409 });
  }
  const shippingPaise = serviceability.shippingPaise;
  const totalPaise = subtotalPaise + shippingPaise - coupon.discountPaise;
  const localOrderId = crypto.randomUUID();
  // The old two-digit suffix allowed collisions during a busy launch minute.
  // Fourteen numeric digits remain easy to quote to customer support while
  // making a collision astronomically unlikely before the DB uniqueness check.
  const orderNumber = `CAS${Date.now().toString().slice(-8)}${crypto.getRandomValues(new Uint32Array(1))[0].toString().padStart(10, "0").slice(-6)}`;
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

  try {
    await db.transaction(async (tx) => {
      for (const item of selected) {
        const claimed = await tx
          .update(productVariants)
          .set({ reservedStock: sql`${productVariants.reservedStock} + ${item.quantity}` })
          .where(and(
            eq(productVariants.id, item.variantId),
            sql`${productVariants.stock} - ${productVariants.reservedStock} >= ${item.quantity}`,
          ));
        if (!claimed[0].affectedRows) throw new ReservationError(`${item.productName} in size ${item.size} just sold out. Please update your bag.`);
      }
      await tx.insert(orders).values({
        id: localOrderId,
        orderNumber,
        customerName: validated.customer.name,
        email: validated.customer.email,
        phone: validated.customer.phone,
        addressLine1: validated.customer.addressLine1,
        addressLine2: validated.customer.addressLine2,
        city: validated.customer.city,
        state: validated.customer.state,
        countryCode: validated.customer.countryCode,
        postalCode: validated.customer.postalCode,
        formattedAddress: validated.customer.formattedAddress,
        deliveryPlaceId: validated.customer.placeId,
        deliveryLatitude: validated.customer.latitude === null ? null : String(validated.customer.latitude),
        deliveryLongitude: validated.customer.longitude === null ? null : String(validated.customer.longitude),
        subtotalPaise,
        shippingPaise,
        totalPaise,
        couponCode: coupon.code || null,
        discountPaise: coupon.discountPaise,
        expiresAt: expiresAt.slice(0, 19).replace("T", " "),
      });
      await tx.insert(orderItems).values(selected.map((item) => ({
        orderId: localOrderId,
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        size: item.size,
        quantity: item.quantity,
        unitPricePaise: item.pricePaise,
        totalPaise: item.pricePaise * item.quantity,
      })));
    });
  } catch (error) {
    if (error instanceof ReservationError) return Response.json({ error: error.message }, { status: 409 });
    await recordEvent({ severity: "error", eventType: "checkout.reservation_failed", detail: errorCode(error) });
    return Response.json({ error: "We could not reserve your bag. Please try again." }, { status: 500 });
  }

  let razorpayOrder: { id?: string; amount?: number; currency?: string } | null = null;
  try {
    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${keys.RAZORPAY_KEY_ID}:${keys.RAZORPAY_KEY_SECRET}`)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ amount: totalPaise, currency: "INR", receipt: orderNumber, notes: { local_order_id: localOrderId, item_count: selected.length } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (razorpayResponse.ok) razorpayOrder = await razorpayResponse.json() as { id?: string; amount?: number; currency?: string };
  } catch {
    // The local reservation is released below.
  }
  if (!razorpayOrder?.id || razorpayOrder.amount !== totalPaise || razorpayOrder.currency !== "INR") {
    await cancelPendingOrderAndRelease(localOrderId, true);
    await recordEvent({ severity: "error", eventType: "checkout.payment_order_unavailable", entityType: "order", entityId: localOrderId });
    return Response.json({ error: "Payment service is temporarily unavailable. Please try again." }, { status: 502 });
  }
  try {
    await db.update(orders).set({ razorpayOrderId: razorpayOrder.id, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(orders.id, localOrderId));
  } catch {
    await cancelPendingOrderAndRelease(localOrderId, true);
    await recordEvent({ severity: "error", eventType: "checkout.payment_order_save_failed", entityType: "order", entityId: localOrderId });
    return Response.json({ error: "We could not finish preparing the payment. Please try again." }, { status: 500 });
  }
  return Response.json({
    keyId: keys.RAZORPAY_KEY_ID,
    localOrderId,
    orderNumber,
    razorpayOrderId: razorpayOrder.id,
    amount: totalPaise,
    subtotalPaise,
    shippingPaise,
    cartWeightGrams: serviceability.cartWeightGrams,
    billedWeightGrams: serviceability.billedWeightGrams,
    discountPaise: coupon.discountPaise,
    currency: "INR",
    productName: selected.length === 1 ? selected[0].productName : `${selected.length} items from Classy Apparels`,
  });
}

export async function POST(request: Request) {
  try {
    return await createOrder(request);
  } catch (error) {
    const databaseError = error as { name?: string; code?: string; cause?: { code?: string } };
    await recordEvent({ severity: "error", eventType: "checkout.order_creation_failed", detail: errorCode(databaseError) });
    return Response.json(
      { error: "Checkout is temporarily unavailable. Please try again; no payment was taken." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
