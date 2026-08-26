"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CatalogProduct } from "../../../lib/catalog";
import { readJsonResponse } from "../../../lib/http";
import WhatsAppFloat from "../../components/whatsapp-float";
import BrandLogo from "../../components/brand-logo";

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

export default function ProductDetail({ product }: { product: CatalogProduct }) {
  const router = useRouter();
  const [image, setImage] = useState(0);
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [showGuide, setShowGuide] = useState(false);
  const [saved, setSaved] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [wishlistNotice, setWishlistNotice] = useState("");
  const [restockEmail, setRestockEmail] = useState("");
  const [restockNotice, setRestockNotice] = useState("");
  const [restockBusy, setRestockBusy] = useState(false);
  const selectedStock = product.variants.find((variant) => variant.size === size)?.stock ?? 0;
  const images = product.images.length ? product.images : ["/products/sea-mist-01.webp"];
  const fabric = product.fabric.trim().toLowerCase() === "confirm in admin" ? "" : product.fabric;
  const whatsappMessage = `Hi Sana, I’m interested in the ${product.name}${product.color ? ` in ${product.color}` : ""}${size ? `, size ${size}` : ""}${quantity > 1 ? `, quantity ${quantity}` : ""}. Could you help me with sizing and availability?`;
  useEffect(() => {
    let active = true;
    fetch("/api/wishlist")
      .then((response) => response.ok ? response.json() as Promise<{ productIds?: string[] }> : null)
      .then((result) => {
        if (active && result?.productIds) setSaved(result.productIds.includes(product.id));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [product.id]);
  async function toggleWishlist() {
    if (wishlistBusy) return;
    setWishlistBusy(true);
    setWishlistNotice("");
    try {
      const response = await fetch("/api/wishlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.id }) });
      if (response.status === 401) { router.push(`/login?return_to=${encodeURIComponent(`/products/${product.slug}`)}`); return; }
      const result = (await response.json()) as { saved?: boolean; error?: string };
      if (response.ok) setSaved(Boolean(result.saved));
      else setWishlistNotice(result.error || "We could not update your wishlist.");
    } catch {
      setWishlistNotice("We could not update your wishlist. Please try again.");
    } finally {
      setWishlistBusy(false);
    }
  }
  async function subscribeRestock(event: React.FormEvent) {
    event.preventDefault();
    setRestockBusy(true);
    setRestockNotice("");
    const variantId = product.variants.find((variant) => variant.size === size)?.id ?? null;
    try {
      const response = await fetch("/api/restock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: restockEmail, productId: product.id, variantId }) });
      const result = await readJsonResponse<{ error?: string }>(response);
      setRestockNotice(response.ok ? "You’re on the list. We’ll email when this size returns." : result.error || "We could not save that request.");
    } catch {
      setRestockNotice("We could not save that request. Check your connection and try again.");
    } finally {
      setRestockBusy(false);
    }
  }
  return (
    <main className="product-page">
      <header className="product-page-header"><Link href="/shop">← Shop</Link><BrandLogo className="checkout-wordmark" priority /><div className="product-page-actions"><Link href="/account">Account</Link><Link href="/track-order">Track</Link><Link href="/shop?bag=open">Bag</Link></div></header>
      <div className="product-page-grid">
        <section className="product-page-gallery"><div className="product-page-main"><img src={images[image] ?? images[0]} alt={`${product.name}, view ${image + 1}`} fetchPriority="high" decoding="async" /></div><div className="product-page-thumbs">{images.map((url, index) => <button key={url} className={image === index ? "active" : ""} onClick={() => setImage(index)} aria-label={`View product image ${index + 1}`} aria-pressed={image === index}><img src={url} alt="" loading="lazy" decoding="async" /></button>)}</div></section>
        <section className="product-page-copy">
          <p className="kicker">{product.eyebrow}</p>
          <h1>{product.name}</h1>
          <div className="price-line"><strong>{money(product.price)}</strong>{product.compareAt > product.price && <del>{money(product.compareAt)}</del>}</div>
          <p className="tax-note">Inclusive of all taxes</p>
          <p className="product-description">{product.description}</p>
          <dl><div><dt>Colour</dt><dd>{product.color || "As shown"}</dd></div><div><dt>Fabric</dt><dd>{fabric || "Ask Sana before ordering"}</dd></div><div><dt>Includes</dt><dd>{product.includes}</dd></div></dl>
          <div className="product-choice-heading"><strong>Choose size</strong><button type="button" onClick={() => setShowGuide(!showGuide)} aria-expanded={showGuide} aria-controls="product-size-guide">Size guide</button></div>
          {showGuide && <div className="inline-size-guide" id="product-size-guide"><div><strong>Size</strong><strong>Bust</strong><strong>Waist</strong><strong>Hip</strong></div>{[["S","36","32","40"],["M","38","34","42"],["L","40","36","44"],["XL","42","38","46"],["XXL","44","40","48"],["XXXL","46","42","50"],["4XL","48","44","52"]].map((row) => <div key={row[0]}>{row.map((value) => <span key={value}>{value}</span>)}</div>)}<small>General body measurements in inches. Fit can vary by piece—ask Sana before ordering if you are between sizes.</small></div>}
          <div className="size-options">{product.variants.filter((variant) => variant.active).map((variant) => <button type="button" key={variant.id} className={size === variant.size ? "selected" : ""} onClick={() => { setSize(variant.size); setQuantity((current) => Math.max(1, Math.min(current, Math.max(1, variant.stock)))); }} aria-pressed={size === variant.size}>{variant.size}{variant.stock <= 0 ? " · sold out" : ""}</button>)}</div>
          {size && selectedStock <= 3 && selectedStock > 0 && <p className="stock-note">Only {selectedStock} left in {size}</p>}
          {size && selectedStock <= 0 && <form className="restock-form" onSubmit={subscribeRestock}><label><span>Size sold out — email me when it returns</span><input type="email" value={restockEmail} onChange={(event) => setRestockEmail(event.target.value)} placeholder="you@example.com" required disabled={restockBusy} /></label><button type="submit" disabled={restockBusy}>{restockBusy ? "Saving…" : "Notify me"}</button>{restockNotice && <small role="status">{restockNotice}</small>}</form>}
          <label className="product-quantity">Quantity<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={!size || selectedStock <= 0}>{Array.from({ length: Math.max(1, Math.min(5, selectedStock)) }, (_, index) => index + 1).map((value) => <option key={value}>{value}</option>)}</select></label>
          {size && selectedStock > 0 ? <Link className="button button-dark product-buy" href={`/checkout?product=${encodeURIComponent(product.id)}&size=${encodeURIComponent(size)}&qty=${quantity}`}>Buy securely · {money(product.price * quantity)}</Link> : <button type="button" className="button button-dark product-buy" disabled aria-describedby="size-selection-help">{size ? "This size is sold out" : "Choose a size to buy securely"}</button>}
          {!size && <p className="stock-note" id="size-selection-help">Choose your preferred size before checkout.</p>}
          <button type="button" className={`wishlist-button ${saved ? "is-active" : ""}`} onClick={toggleWishlist} disabled={wishlistBusy}>{wishlistBusy ? "Saving…" : saved ? "Saved to wishlist" : "Save to wishlist"}</button>
          {wishlistNotice && <p className="field-notice" role="alert">{wishlistNotice}</p>}
          <div className="product-assurances"><span>Secure server-verified payment</span><span>Size exchange support</span><span>Online order tracking</span></div>
        </section>
      </div>
      <section className="product-page-story"><p className="kicker">Look closer</p><h2>Real photos. Every useful angle.</h2><p>Phone-shot details stay uncropped on a softly balanced canvas, so the colour, length and finishing remain easy to judge.</p></section>
      <WhatsAppFloat message={whatsappMessage} />
    </main>
  );
}
