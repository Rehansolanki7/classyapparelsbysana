"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CatalogProduct } from "../../lib/catalog";
import { readJsonResponse } from "../../lib/http";
import { COUNTRIES, INDIA_STATES, countryName } from "../../lib/locations";
import { whatsappHref } from "../../lib/whatsapp";
import BrandLogo from "../components/brand-logo";
import SizeSelect from "../components/size-select";

export type CheckoutSelection = { productId: string; size: string; quantity: number };
type SavedAddress = { id: string; label: string; recipientName: string; phone: string; addressLine1: string; addressLine2: string; city: string; state: string; countryCode: string; postalCode: string; isDefault: boolean };

type PaymentResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (result: PaymentResult) => void;
  modal: { confirm_close: boolean; ondismiss: () => void };
  timeout?: number;
  retry?: { enabled: boolean; max_count: number };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export default function CheckoutClient({
  products,
  initialItems,
  initialCustomer,
  savedAddresses = [],
}: {
  products: CatalogProduct[];
  initialItems: CheckoutSelection[];
  initialCustomer?: { name: string; email: string };
  savedAddresses?: SavedAddress[];
}) {
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [paymentOrderUnavailable, setPaymentOrderUnavailable] = useState(false);
  const [manualShippingNeeded, setManualShippingNeeded] = useState(false);
  const [packedWeightMissing, setPackedWeightMissing] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponNotice, setCouponNotice] = useState("");
  const [success, setSuccess] = useState<{ orderNumber: string; captured: boolean; refundPending?: boolean; message?: string } | null>(null);
  const [shippingQuote, setShippingQuote] = useState<{ subtotal: number; cartWeightGrams: number; shipping: number } | null>(null);
  const defaultAddress = savedAddresses.find((address) => address.isDefault) ?? savedAddresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id ?? "");
  const [saveAddress, setSaveAddress] = useState(false);
  const [form, setForm] = useState({
    name: defaultAddress?.recipientName || initialCustomer?.name || "",
    email: initialCustomer?.email ?? "",
    phone: defaultAddress?.phone ?? "",
    addressLine1: defaultAddress?.addressLine1 ?? "",
    addressLine2: defaultAddress?.addressLine2 ?? "",
    city: defaultAddress?.city ?? "",
    state: defaultAddress?.state ?? "Maharashtra",
    countryCode: defaultAddress?.countryCode ?? "IN",
    postalCode: defaultAddress?.postalCode ?? "",
  });

  const lines = useMemo(() => items.flatMap((item, index) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const variant = product?.variants.find((candidate) => candidate.size === item.size && candidate.active);
    return product && variant ? [{ item, index, product, variant }] : [];
  }), [items, products]);
  const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.item.quantity, 0);
  const domestic = form.countryCode === "IN";
  const cartWeightGrams = lines.reduce((sum, line) => sum + line.product.packedWeightGrams * line.item.quantity, 0);
  const hasConfirmedShipping = shippingQuote?.subtotal === subtotal && shippingQuote.cartWeightGrams === cartWeightGrams;
  const shipping = hasConfirmedShipping ? shippingQuote!.shipping : 0;
  const shippingNeedsQuote = !domestic && !hasConfirmedShipping;
  const shippingPending = domestic && !hasConfirmedShipping && !manualShippingNeeded && !packedWeightMissing;
  const total = subtotal + shipping - discount;
  const itemCount = lines.reduce((sum, line) => sum + line.item.quantity, 0);
  const whatsappMessage = [
    "Hi Sana, I would like to complete this order.",
    "",
    "Order:",
    ...lines.map((line) => `${line.item.quantity} × ${line.product.name}${line.product.hasSizes ? ` — size ${line.item.size}` : " — no size needed"}`),
    "",
    "Delivery details:",
    `Name: ${form.name.trim() || "—"}`,
    `Email: ${form.email.trim() || "—"}`,
    `Phone: ${form.phone.trim() || "—"}`,
    `Street address: ${form.addressLine1.trim() || "—"}`,
    ...(form.addressLine2.trim() ? [`Area / landmark: ${form.addressLine2.trim()}`] : []),
    `City: ${form.city.trim() || "—"}`,
    `State / province: ${form.state.trim() || "—"}`,
    `Country: ${countryName(form.countryCode)}`,
    `${domestic ? "PIN code" : "Postal / ZIP code"}: ${form.postalCode.trim() || "—"}`,
    "",
    `Product total: ${money(subtotal - discount)}`,
    (shippingNeedsQuote || manualShippingNeeded) ? "Shipping: Please confirm a manual quote." : `Order total: ${money(total)}`,
    "Please help me confirm delivery and payment details.",
  ].join("\n");
  function update(name: keyof typeof form, value: string | number | null) {
    setForm((current) => ({ ...current, [name]: value }));
    if (name !== "email") setSelectedAddressId("");
    if (["postalCode", "countryCode", "state"].includes(name)) {
      setShippingQuote(null);
      setDeliveryNote("");
      setManualShippingNeeded(false);
      setPackedWeightMissing(false);
    }
  }

  function updateCountry(countryCode: string) {
    setForm((current) => ({ ...current, countryCode, state: countryCode === "IN" ? "Maharashtra" : "", postalCode: "" }));
    setShippingQuote(null);
    setDeliveryNote("");
    setManualShippingNeeded(false);
    setPackedWeightMissing(false);
    setSelectedAddressId("");
  }

  function chooseAddress(id: string) {
    setSelectedAddressId(id);
    const address = savedAddresses.find((item) => item.id === id);
    if (!address) return;
    setForm((current) => ({ ...current, name: address.recipientName, phone: address.phone, addressLine1: address.addressLine1, addressLine2: address.addressLine2, city: address.city, state: address.state, countryCode: address.countryCode, postalCode: address.postalCode }));
    setSaveAddress(false); setShippingQuote(null); setDeliveryNote(""); setManualShippingNeeded(false); setPackedWeightMissing(false);
  }

  async function saveCheckoutAddress() {
    if (!initialCustomer || !saveAddress || selectedAddressId) return;
    try {
      await fetch("/api/account/addresses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: { label: "Checkout address", recipientName: form.name, phone: form.phone, addressLine1: form.addressLine1, addressLine2: form.addressLine2, city: form.city, state: form.state, countryCode: form.countryCode, postalCode: form.postalCode, isDefault: !savedAddresses.length } }) });
    } catch {
      // Order confirmation has already succeeded; a failed convenience save
      // must never obscure it or invite the customer to pay again.
    }
  }

  async function cancelCheckout(localOrderId: string) {
    try {
      await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localOrderId }),
      });
    } catch {
      // The reservation has a server-side expiry as a backstop. Do not mask a
      // customer closing the payment window with an unrelated network error.
    }
  }

  async function checkDestination() {
    const postalReady = domestic ? /^[1-9]\d{5}$/.test(form.postalCode) : form.postalCode.trim().length >= 2;
    if (!postalReady) { setDeliveryNote(""); return; }
    try {
      const response = await fetch(`/api/shipping/serviceability?countryCode=${encodeURIComponent(form.countryCode)}&postalCode=${encodeURIComponent(form.postalCode)}&state=${encodeURIComponent(form.state)}&cartWeightGrams=${cartWeightGrams}`);
      const result = await readJsonResponse<{ serviceable?: boolean; manualQuoteRequired?: boolean; shippingPaise?: number; deliveryDaysMin?: number; deliveryDaysMax?: number; note?: string }>(response);
      setShippingQuote(response.ok && result.serviceable ? { subtotal, cartWeightGrams, shipping: (result.shippingPaise ?? 0) / 100 } : null);
      const missingWeight = cartWeightGrams <= 0;
      setPackedWeightMissing(missingWeight);
      setManualShippingNeeded(Boolean(result.manualQuoteRequired) && !missingWeight);
      setDeliveryNote(result.note || (response.ok && result.serviceable ? `Delivery estimate: ${result.deliveryDaysMin}–${result.deliveryDaysMax} working days.` : "Delivery availability could not be confirmed. Please message Sana for help."));
    } catch {
      setShippingQuote(null);
      setPackedWeightMissing(cartWeightGrams <= 0);
      setManualShippingNeeded(!domestic && cartWeightGrams > 0);
      setDeliveryNote("Delivery availability could not be confirmed. Please message Sana for help.");
    }
  }

  async function applyCoupon() {
    setCouponNotice("");
    try {
      const response = await fetch("/api/coupons/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: couponCode, subtotalPaise: Math.round(subtotal * 100) }) });
      const result = await readJsonResponse<{ error?: string; discountPaise?: number; code?: string }>(response);
      if (!response.ok) { setDiscount(0); setCouponNotice(result.error || "Coupon could not be applied."); }
      else { setDiscount((result.discountPaise ?? 0) / 100); setCouponNotice(result.discountPaise ? `Coupon ${result.code} applied.` : "Coupon removed."); }
    } catch {
      setDiscount(0);
      setCouponNotice("Coupon validation is temporarily unavailable.");
    }
  }

  function updateItem(index: number, patch: Partial<CheckoutSelection>) {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...patch };
      const product = products.find((candidate) => candidate.id === next.productId);
      const stock = product?.variants.find((variant) => variant.size === next.size)?.stock ?? 1;
      return { ...next, quantity: Math.max(1, Math.min(next.quantity, stock, 5)) };
    }));
    if (couponCode || discount) {
      setDiscount(0);
      setCouponNotice("Your bag changed. Reapply your discount code to update the total.");
    }
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (couponCode || discount) {
      setDiscount(0);
      setCouponNotice("Your bag changed. Reapply your discount code to update the total.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!lines.length) {
      setError("Your bag is empty. Add a product before checking out.");
      return;
    }
    setBusy(true);
    setError("");
    setSetupNeeded(false);
    setPaymentOrderUnavailable(false);
    setManualShippingNeeded(false);
    setPackedWeightMissing(false);
    let localOrderId = "";
    let paymentWindowOpened = false;
    try {
      const orderResponse = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, customer: form, couponCode }),
      });
      const order = await readJsonResponse<{
        error?: string;
        code?: string;
        keyId?: string;
        localOrderId?: string;
        razorpayOrderId?: string;
        amount?: number;
        currency?: string;
        description?: string;
        subtotalPaise?: number;
        shippingPaise?: number;
        cartWeightGrams?: number;
        discountPaise?: number;
      }>(orderResponse);
      if (!orderResponse.ok) {
        if (order.code === "PAYMENTS_NOT_CONFIGURED") setSetupNeeded(true);
        if (order.code === "PAYMENT_ORDER_UNAVAILABLE" || order.code === "PAYMENT_ORDER_SAVE_FAILED") setPaymentOrderUnavailable(true);
        if (order.code === "PRODUCT_SHIPPING_WEIGHT_MISSING") setPackedWeightMissing(true);
        if (order.code === "MANUAL_SHIPPING_QUOTE_REQUIRED") setManualShippingNeeded(true);
        throw new Error(order.error || "Checkout is temporarily unavailable. Please try again; no payment was taken.");
      }
      if (typeof order.shippingPaise === "number") setShippingQuote({ subtotal: (order.subtotalPaise ?? Math.round(subtotal * 100)) / 100, cartWeightGrams: order.cartWeightGrams ?? cartWeightGrams, shipping: order.shippingPaise / 100 });
      if (typeof order.discountPaise === "number") setDiscount(order.discountPaise / 100);
      const loaded = await loadRazorpay();
      if (!loaded || !window.Razorpay || !order.keyId || !order.razorpayOrderId || !order.localOrderId || !order.amount || !order.currency) throw new Error("Secure payment window could not load. Please try again.");
      localOrderId = order.localOrderId;
      let paymentResultReceived = false;
      const gateway = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Classy Apparels",
        description: order.description || `${lines.length} item${lines.length === 1 ? "" : "s"}`,
        order_id: order.razorpayOrderId,
        prefill: { name: form.name, email: form.email, contact: form.phone.startsWith("+") || !domestic ? form.phone : `+91${form.phone}` },
        theme: { color: "#5d9798" },
        timeout: 1200,
        retry: { enabled: true, max_count: 4 },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            // A successful handler closes the modal too. Only an actual
            // customer dismissal releases the short inventory reservation.
            if (!paymentResultReceived) {
              void cancelCheckout(localOrderId);
              setError("Payment was cancelled. Your items are available again.");
            }
            setBusy(false);
          },
        },
        handler: async (result) => {
          paymentResultReceived = true;
          try {
            const verifyResponse = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ localOrderId, ...result }),
            });
            const verified = await readJsonResponse<{ error?: string; orderNumber?: string; captured?: boolean; refundPending?: boolean; message?: string }>(verifyResponse);
            if (!verifyResponse.ok && verifyResponse.status !== 202) setError(verified.error || "We could not verify this payment. Please contact Sana before retrying.");
            else {
              await saveCheckoutAddress();
              window.localStorage.removeItem("classy-apparels-bag-v1");
              document.cookie = "classy_apparels_bag=; path=/; max-age=0; samesite=lax";
              setSuccess({ orderNumber: verified.orderNumber || "Pending", captured: Boolean(verified.captured), refundPending: verified.refundPending, message: verified.message });
            }
          } catch {
            setError("Your payment response could not be confirmed. Please do not pay again; contact Sana with your payment ID.");
          }
          setBusy(false);
        },
      });
      gateway.open();
      paymentWindowOpened = true;
    } catch (caught) {
      // If checkout could not open (for example, blocked Razorpay script or a
      // transient browser error), do not keep the customer's stock reserved.
      if (localOrderId && !paymentWindowOpened) void cancelCheckout(localOrderId);
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (success) {
    return (
      <main className="checkout-shell checkout-success">
        <BrandLogo variant="stacked" className="checkout-success-brand" priority />
        <div className="success-mark">✓</div>
        <p className="kicker">Order {success.orderNumber}</p>
        <h1>{success.refundPending ? "Your refund is being arranged." : success.captured ? "Your order is confirmed." : "Your payment is being confirmed."}</h1>
        <p>{success.message || (success.captured ? "Thank you. Sana has been notified. You can follow preparation and delivery using your order number and checkout email." : "We have your payment response and will confirm it shortly. Please do not pay again.")}</p>
        <div className="checkout-success-actions"><Link className="button button-dark" href="/account">View my orders</Link><Link className="text-link" href={`/track-order?order=${encodeURIComponent(success.orderNumber)}`}>Track as guest</Link><Link className="text-link" href="/shop">Continue shopping</Link></div>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <header className="checkout-header">
        <Link href="/shop" className="checkout-back">← Back to shop</Link>
        <BrandLogo className="checkout-wordmark" priority />
        <span className="checkout-lock">Secure checkout</span>
      </header>
      <div className="checkout-grid">
        <form className="checkout-form" onSubmit={submit}>
          <div className="checkout-title"><p className="kicker">Delivery details</p><h1>Where should we send it?</h1><p>Enter the complete delivery address exactly as it should appear on the parcel.</p><div className="checkout-shipping-callout"><strong>Shipping is added at this step</strong><span>We’ll calculate it from your destination and show the final amount before payment opens.</span></div></div>
          {savedAddresses.length > 0 && <div className="checkout-saved-address"><div><strong>Saved address</strong><small>Choose one to fill checkout instantly.</small></div><select value={selectedAddressId} onChange={(event) => chooseAddress(event.target.value)}><option value="">Enter a new address</option>{savedAddresses.map((address) => <option key={address.id} value={address.id}>{address.label} · {address.city}{address.isDefault ? " (Default)" : ""}</option>)}</select><Link href="/account">Manage addresses</Link></div>}
          <div className="checkout-fields">
            <label className="full"><span>Full name</span><input value={form.name} onChange={(event) => update("name", event.target.value)} autoComplete="name" required /></label>
            <label><span>Email</span><input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" required /></label>
            <label><span>Phone</span><input inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" placeholder={domestic ? "10-digit mobile number" : "+1 555 123 4567"} required /></label>
            <label className="full"><span>Flat, floor, building and street</span><input value={form.addressLine1} onChange={(event) => update("addressLine1", event.target.value)} autoComplete="address-line1" placeholder="Flat 4B, Sana Heights, Linking Road" required /></label>
            <label className="full"><span>Area / landmark <small>optional</small></span><input value={form.addressLine2} onChange={(event) => update("addressLine2", event.target.value)} autoComplete="address-line2" /></label>
            <label className="full"><span>Country</span><select suppressHydrationWarning value={form.countryCode} onChange={(event) => updateCountry(event.target.value)} autoComplete="country" required><option value="IN">India</option>{COUNTRIES.filter((country) => country.code !== "IN").map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
            <label><span>City</span><input value={form.city} onChange={(event) => update("city", event.target.value)} autoComplete="address-level2" required /></label>
            <label><span>{domestic ? "State / union territory" : "State / province / region"}</span>{domestic ? <select value={form.state} onChange={(event) => update("state", event.target.value)} autoComplete="address-level1" required>{INDIA_STATES.map((state) => <option key={state}>{state}</option>)}</select> : <input value={form.state} onChange={(event) => update("state", event.target.value)} autoComplete="address-level1" placeholder="Use N/A if not applicable" required />}</label>
            <label><span>{domestic ? "PIN code" : "Postal / ZIP code"}</span><input inputMode={domestic ? "numeric" : "text"} pattern={domestic ? "[1-9][0-9]{5}" : undefined} maxLength={domestic ? 6 : 16} value={form.postalCode} onChange={(event) => update("postalCode", domestic ? event.target.value.replace(/\D/g, "") : event.target.value.toUpperCase().replace(/[^A-Z0-9 /-]/g, ""))} onBlur={checkDestination} autoComplete="postal-code" placeholder={domestic ? "6-digit PIN" : "Use N/A if not applicable"} required />{deliveryNote && <small className="delivery-note">{deliveryNote}</small>}</label>
          </div>
          {initialCustomer && !selectedAddressId && <label className="checkout-save-address"><input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} /><span>Save this delivery address to my account for a faster next checkout.</span></label>}
          {error && <div className={`checkout-error ${setupNeeded || manualShippingNeeded || packedWeightMissing ? "setup" : ""}`} role="alert"><strong>{setupNeeded ? "Online payment setup is pending" : paymentOrderUnavailable ? "Payment could not start" : packedWeightMissing ? "Product shipping setup is pending" : manualShippingNeeded ? (domestic ? "Delivery quote needed" : "International shipping quote needed") : "We couldn’t continue"}</strong><p>{error}</p>{(setupNeeded || manualShippingNeeded || packedWeightMissing) && <><a className="button whatsapp-checkout-button" href={whatsappHref(whatsappMessage)} target="_blank" rel="noreferrer">{manualShippingNeeded ? "Request shipping quote on WhatsApp" : packedWeightMissing ? "Message Sana about delivery" : "Complete this order on WhatsApp"} <span aria-hidden="true">→</span></a><small className="whatsapp-checkout-note">WhatsApp will open with your order and delivery details ready to send.</small></>}</div>}
          {packedWeightMissing && !error && <div className="checkout-error setup"><strong>Product shipping setup is pending</strong><p>This product needs a confirmed packed weight before payment. Please message Sana for a delivery quote.</p><a className="button whatsapp-checkout-button" href={whatsappHref(whatsappMessage)} target="_blank" rel="noreferrer">Message Sana about delivery <span aria-hidden="true">→</span></a></div>}
          {manualShippingNeeded && !error && <div className="checkout-error setup"><strong>{domestic ? "Delivery quote needed" : "International delivery is available"}</strong><p>Shipping is arranged manually. Request the final courier quote before payment.</p><a className="button whatsapp-checkout-button" href={whatsappHref(whatsappMessage)} target="_blank" rel="noreferrer">Request shipping quote on WhatsApp <span aria-hidden="true">→</span></a></div>}
          {!manualShippingNeeded && !packedWeightMissing && <button className="button button-dark pay-button" disabled={busy || !lines.length}>{busy ? "Checking delivery…" : shippingNeedsQuote ? "Check international delivery" : shippingPending ? "Continue to secure payment" : `Pay securely · ${money(total)}`}</button>}
          <p className="payment-note">{shippingNeedsQuote ? "International shipping is confirmed manually before payment." : shippingPending ? "Shipping is calculated from packed weight and destination before the payment window opens." : "Payment is processed by Razorpay. Card and UPI credentials never pass through or remain on this website."}</p>
        </form>

        <aside className="checkout-summary">
          <p className="kicker">Your order · {itemCount} item{itemCount === 1 ? "" : "s"}</p>
          <div className="checkout-products">
            {lines.map(({ item, index, product, variant }) => <div className="checkout-product" key={`${item.productId}-${index}`}><img src={product.images[0]} alt="" loading="lazy" decoding="async" /><div><h2>{product.name}</h2><div className="checkout-selectors">{product.hasSizes ? <label>Size<SizeSelect value={item.size} options={product.variants.filter((candidate) => candidate.active && candidate.stock > 0)} onChange={(size) => updateItem(index, { size })} label={`Choose size for ${product.name}`} /></label> : <span className="checkout-no-size">No size needed</span>}<label>Qty<select value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })}>{Array.from({ length: Math.max(1, Math.min(5, variant.stock)) }, (_, optionIndex) => optionIndex + 1).map((value) => <option key={value}>{value}</option>)}</select></label></div><strong>{money(product.price * item.quantity)}</strong>{lines.length > 1 && <button type="button" className="checkout-remove" onClick={() => removeItem(index)}>Remove</button>}</div></div>)}
          </div>
          <div className="coupon-box"><label><span>Discount code</span><div><input value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); setDiscount(0); }} placeholder="Enter code" /><button type="button" onClick={applyCoupon}>Apply</button></div></label>{couponNotice && <small>{couponNotice}</small>}</div>
          <div className="checkout-totals"><div><span>Subtotal</span><span>{money(subtotal)}</span></div><div><span>Shipping</span><span>{shippingNeedsQuote || manualShippingNeeded ? "Manual quote" : shippingPending ? "Added before payment" : money(shipping)}</span></div>{discount > 0 && <div><span>Discount</span><span>−{money(discount)}</span></div>}<div className="total"><strong>{shippingNeedsQuote || manualShippingNeeded || shippingPending ? "Product total" : "Total"}</strong><strong>{money(total)}</strong></div></div>
          <div className="checkout-promise"><strong>Shopping with Sana</strong><p>Honest product photos · size help on WhatsApp · secure server-verified payments</p></div>
        </aside>
      </div>
    </main>
  );
}
