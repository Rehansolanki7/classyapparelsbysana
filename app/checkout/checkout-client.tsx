"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CatalogProduct } from "../../lib/catalog";
import { readJsonResponse } from "../../lib/http";
import { COUNTRIES, INDIA_STATES, countryName } from "../../lib/locations";

export type CheckoutSelection = { productId: string; size: string; quantity: number };

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
}: {
  products: CatalogProduct[];
  initialItems: CheckoutSelection[];
  initialCustomer?: { name: string; email: string };
}) {
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [manualShippingNeeded, setManualShippingNeeded] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponNotice, setCouponNotice] = useState("");
  const [success, setSuccess] = useState<{ orderNumber: string; captured: boolean; refundPending?: boolean; message?: string } | null>(null);
  const [shippingQuote, setShippingQuote] = useState<{ subtotal: number; shipping: number } | null>(null);
  const [form, setForm] = useState({
    name: initialCustomer?.name ?? "",
    email: initialCustomer?.email ?? "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "Maharashtra",
    countryCode: "IN",
    postalCode: "",
  });

  const lines = useMemo(() => items.flatMap((item, index) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const variant = product?.variants.find((candidate) => candidate.size === item.size && candidate.active);
    return product && variant ? [{ item, index, product, variant }] : [];
  }), [items, products]);
  const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.item.quantity, 0);
  const domestic = form.countryCode === "IN";
  const shipping = shippingQuote?.subtotal === subtotal ? shippingQuote.shipping : (domestic ? (subtotal >= 1499 ? 0 : 99) : 0);
  const shippingNeedsQuote = !domestic && !shippingQuote;
  const total = subtotal + shipping - discount;
  const itemCount = lines.reduce((sum, line) => sum + line.item.quantity, 0);
  const whatsappText = encodeURIComponent([
    "Hi Sana, I would like to complete this order.",
    "",
    "Order:",
    ...lines.map((line) => `${line.item.quantity} × ${line.product.name} — size ${line.item.size}`),
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
    shippingNeedsQuote ? "Shipping: Please confirm a manual international quote." : `Order total: ${money(total)}`,
    "Please help me confirm delivery and payment details.",
  ].join("\n"));

  function update(name: keyof typeof form, value: string | number | null) {
    setForm((current) => ({ ...current, [name]: value }));
    if (["postalCode", "countryCode"].includes(name)) {
      setShippingQuote(null);
      setDeliveryNote("");
      setManualShippingNeeded(false);
    }
  }

  function updateCountry(countryCode: string) {
    setForm((current) => ({ ...current, countryCode, state: countryCode === "IN" ? "Maharashtra" : "", postalCode: "" }));
    setShippingQuote(null);
    setDeliveryNote("");
    setManualShippingNeeded(false);
  }

  async function checkDestination() {
    const postalReady = domestic ? /^[1-9]\d{5}$/.test(form.postalCode) : form.postalCode.trim().length >= 2;
    if (!postalReady) { setDeliveryNote(""); return; }
    try {
      const response = await fetch(`/api/shipping/serviceability?countryCode=${encodeURIComponent(form.countryCode)}&postalCode=${encodeURIComponent(form.postalCode)}&subtotalPaise=${Math.round(subtotal * 100)}`);
      const result = await readJsonResponse<{ serviceable?: boolean; manualQuoteRequired?: boolean; shippingPaise?: number; deliveryDaysMin?: number; deliveryDaysMax?: number; note?: string }>(response);
      setShippingQuote(response.ok && result.serviceable ? { subtotal, shipping: (result.shippingPaise ?? 0) / 100 } : null);
      setManualShippingNeeded(Boolean(result.manualQuoteRequired));
      setDeliveryNote(result.note || (response.ok && result.serviceable ? `Delivery estimate: ${result.deliveryDaysMin}–${result.deliveryDaysMax} working days.` : "Delivery availability could not be confirmed. Please message Sana for help."));
    } catch {
      setShippingQuote(null);
      setManualShippingNeeded(!domestic);
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
    setManualShippingNeeded(false);
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
        productName?: string;
        subtotalPaise?: number;
        shippingPaise?: number;
        discountPaise?: number;
      }>(orderResponse);
      if (!orderResponse.ok) {
        if (order.code === "PAYMENTS_NOT_CONFIGURED") setSetupNeeded(true);
        if (order.code === "MANUAL_SHIPPING_QUOTE_REQUIRED") setManualShippingNeeded(true);
        throw new Error(order.error || "Checkout is temporarily unavailable. Please try again; no payment was taken.");
      }
      if (typeof order.shippingPaise === "number") setShippingQuote({ subtotal: (order.subtotalPaise ?? Math.round(subtotal * 100)) / 100, shipping: order.shippingPaise / 100 });
      if (typeof order.discountPaise === "number") setDiscount(order.discountPaise / 100);
      const loaded = await loadRazorpay();
      if (!loaded || !window.Razorpay || !order.keyId || !order.razorpayOrderId || !order.localOrderId || !order.amount || !order.currency) throw new Error("Secure payment window could not load. Please try again.");
      const localOrderId = order.localOrderId;
      const gateway = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Classy Apparels",
        description: order.productName || `${lines.length} item${lines.length === 1 ? "" : "s"}`,
        order_id: order.razorpayOrderId,
        prefill: { name: form.name, email: form.email, contact: form.phone.startsWith("+") || !domestic ? form.phone : `+91${form.phone}` },
        theme: { color: "#5d9798" },
        timeout: 1200,
        retry: { enabled: true, max_count: 4 },
        modal: { confirm_close: true, ondismiss: () => setBusy(false) },
        handler: async (result) => {
          try {
            const verifyResponse = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ localOrderId, ...result }),
            });
            const verified = await readJsonResponse<{ error?: string; orderNumber?: string; captured?: boolean; refundPending?: boolean; message?: string }>(verifyResponse);
            if (!verifyResponse.ok && verifyResponse.status !== 202) setError(verified.error || "We could not verify this payment. Please contact Sana before retrying.");
            else {
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (success) {
    return (
      <main className="checkout-shell checkout-success">
        <Link className="checkout-wordmark" href="/"><span>Classy Apparels</span></Link>
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
        <Link className="checkout-wordmark" href="/"><span>Classy Apparels</span></Link>
        <span className="checkout-lock">Secure checkout</span>
      </header>
      <div className="checkout-grid">
        <form className="checkout-form" onSubmit={submit}>
          <div className="checkout-title"><p className="kicker">Delivery details</p><h1>Where should we send it?</h1><p>Enter the complete delivery address exactly as it should appear on the parcel.</p></div>
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
          {error && <div className={`checkout-error ${setupNeeded || manualShippingNeeded ? "setup" : ""}`} role="alert"><strong>{setupNeeded ? "Online payment setup is pending" : manualShippingNeeded ? "International shipping quote needed" : "We couldn’t continue"}</strong><p>{error}</p>{(setupNeeded || manualShippingNeeded) && <><a className="button whatsapp-checkout-button" href={`https://wa.me/917715910151?text=${whatsappText}`} target="_blank" rel="noreferrer">{manualShippingNeeded ? "Request shipping quote on WhatsApp" : "Complete this order on WhatsApp"} <span aria-hidden="true">→</span></a><small className="whatsapp-checkout-note">This opens WhatsApp with your order and complete delivery details.</small></>}</div>}
          {manualShippingNeeded && !error && <div className="checkout-error setup"><strong>International delivery is available</strong><p>Shipping is arranged manually. Request the final courier quote before payment.</p><a className="button whatsapp-checkout-button" href={`https://wa.me/917715910151?text=${whatsappText}`} target="_blank" rel="noreferrer">Request shipping quote on WhatsApp <span aria-hidden="true">→</span></a></div>}
          {!manualShippingNeeded && <button className="button button-dark pay-button" disabled={busy || !lines.length}>{busy ? "Checking delivery…" : shippingNeedsQuote ? "Check international delivery" : `Pay securely · ${money(total)}`}</button>}
          <p className="payment-note">{shippingNeedsQuote ? "International shipping is confirmed manually before payment." : "Payment is processed by Razorpay. Card and UPI credentials never pass through or remain on this website."}</p>
        </form>

        <aside className="checkout-summary">
          <p className="kicker">Your order · {itemCount} item{itemCount === 1 ? "" : "s"}</p>
          <div className="checkout-products">
            {lines.map(({ item, index, product, variant }) => <div className="checkout-product" key={`${item.productId}-${index}`}><img src={product.images[0]} alt="" /><div><h2>{product.name}</h2><div className="checkout-selectors"><label>Size<select value={item.size} onChange={(event) => updateItem(index, { size: event.target.value })}>{product.variants.filter((candidate) => candidate.active && candidate.stock > 0).map((candidate) => <option key={candidate.id} value={candidate.size}>{candidate.size}</option>)}</select></label><label>Qty<select value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })}>{Array.from({ length: Math.max(1, Math.min(5, variant.stock)) }, (_, optionIndex) => optionIndex + 1).map((value) => <option key={value}>{value}</option>)}</select></label></div><strong>{money(product.price * item.quantity)}</strong>{lines.length > 1 && <button type="button" className="checkout-remove" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}</div></div>)}
          </div>
          <div className="coupon-box"><label><span>Discount code</span><div><input value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); setDiscount(0); }} placeholder="Enter code" /><button type="button" onClick={applyCoupon}>Apply</button></div></label>{couponNotice && <small>{couponNotice}</small>}</div>
          <div className="checkout-totals"><div><span>Subtotal</span><span>{money(subtotal)}</span></div><div><span>Shipping</span><span>{shippingNeedsQuote ? "Manual quote" : shipping === 0 ? "Complimentary" : money(shipping)}</span></div>{discount > 0 && <div><span>Discount</span><span>−{money(discount)}</span></div>}<div className="total"><strong>{shippingNeedsQuote ? "Product total" : "Total"}</strong><strong>{money(total)}</strong></div></div>
          <div className="checkout-promise"><strong>Shopping with Sana</strong><p>Honest product photos · size help on WhatsApp · secure server-verified payments</p></div>
        </aside>
      </div>
    </main>
  );
}
