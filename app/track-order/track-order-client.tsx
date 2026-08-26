"use client";

import { useState } from "react";
import Link from "next/link";
import { countryName } from "../../lib/locations";
import { whatsappHref } from "../../lib/whatsapp";
import BrandLogo from "../components/brand-logo";

type TrackedOrder = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  customerName: string;
  city: string;
  state: string;
  countryCode: string;
  postalCode: string;
  totalPaise: number;
  courierName: string;
  trackingNumber: string;
  trackingUrl: string;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  items: Array<{ productName: string; size: string; quantity: number; totalPaise: number }>;
};

const steps = [
  { key: "paid", label: "Order confirmed", copy: "Your payment is confirmed and the order is with Sana." },
  { key: "processing", label: "Preparing your order", copy: "Your pieces are being checked and packed." },
  { key: "shipped", label: "On the way", copy: "The parcel has left with the courier." },
  { key: "delivered", label: "Delivered", copy: "The order has reached its destination." },
];

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

function date(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export default function TrackOrderClient({ initialOrderNumber }: { initialOrderNumber: string }) {
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber.toUpperCase());
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setOrder(null);
    const response = await fetch("/api/orders/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderNumber, email }),
    });
    const result = (await response.json()) as { order?: TrackedOrder; error?: string };
    if (!response.ok || !result.order) setError(result.error || "We couldn't find that order");
    else setOrder(result.order);
    setBusy(false);
  }

  const currentIndex = order ? steps.findIndex((step) => step.key === order.status) : -1;
  const exceptional = order && ["cancelled", "payment_failed"].includes(order.status);

  return (
    <main className="tracking-page">
      <header className="tracking-header"><Link href="/">← Home</Link><BrandLogo className="checkout-wordmark" priority /><span><Link href="/account">My orders</Link> · <Link href="/shop">Shop</Link></span></header>
      <section className="tracking-hero">
        <p className="kicker">Order updates</p>
        <h1>Track your order.</h1>
        <p>Enter the order number from your confirmation and the email used at checkout. No account or password is needed.</p>
        <form onSubmit={submit} className="tracking-form">
          <label><span>Order number</span><input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value.toUpperCase())} placeholder="CAS1234567890" autoCapitalize="characters" required /></label>
          <label><span>Checkout email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
          <button className="button button-dark" disabled={busy}>{busy ? "Finding your order…" : "Show order status"}</button>
        </form>
        {error && <div className="tracking-error" role="alert">{error}<a href={whatsappHref(`Hi Sana, I need help tracking order ${orderNumber || "my order"}.`)} target="_blank" rel="noreferrer">Ask Sana for help</a></div>}
      </section>

      {order && <section className="tracking-result" aria-live="polite">
        <div className="tracking-summary"><div><p className="kicker">{order.orderNumber}</p><h2>{exceptional ? (order.status === "cancelled" ? "Order cancelled" : "Payment not completed") : `Hello ${order.customerName.split(" ")[0]}, here’s the latest.`}</h2><p>Placed {date(order.createdAt)} · Delivery to {order.city}, {order.state} {order.postalCode}, {countryName(order.countryCode)}</p></div><strong>{money(order.totalPaise)}</strong></div>
        {exceptional ? <div className="tracking-exception"><strong>{order.status === "cancelled" ? "This order is no longer active." : "The payment was not completed."}</strong><p>Please message Sana if you believe this status is incorrect.</p></div> : <div className="tracking-timeline">{steps.map((step, index) => <div key={step.key} className={index <= currentIndex ? "complete" : ""}><span>{index < currentIndex ? "✓" : index + 1}</span><div><strong>{step.label}</strong><p>{step.copy}</p>{step.key === "shipped" && order.shippedAt && <small>{date(order.shippedAt)}</small>}{step.key === "delivered" && order.deliveredAt && <small>{date(order.deliveredAt)}</small>}</div></div>)}</div>}
        {order.status === "shipped" && (order.courierName || order.trackingNumber || order.trackingUrl) && <div className="courier-card"><div><span>Courier</span><strong>{order.courierName || "Shipping partner"}</strong></div><div><span>Tracking number</span><strong>{order.trackingNumber || "Updating shortly"}</strong></div>{order.trackingUrl && <a className="button button-dark" href={order.trackingUrl} target="_blank" rel="noreferrer">Track with courier →</a>}</div>}
        <div className="tracking-items"><h3>Order contents</h3>{order.items.map((item, index) => <div key={`${item.productName}-${item.size}-${index}`}><span>{item.productName}<small>Size {item.size} · Qty {item.quantity}</small></span><strong>{money(item.totalPaise)}</strong></div>)}</div>
      </section>}
    </main>
  );
}
