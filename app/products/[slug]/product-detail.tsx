"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CatalogProduct } from "../../../lib/catalog";

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

export default function ProductDetail({ product }: { product: CatalogProduct }) {
  const router = useRouter();
  const [image, setImage] = useState(0);
  const [size, setSize] = useState(product.variants.find((variant) => variant.active && variant.stock > 0)?.size ?? "");
  const [quantity, setQuantity] = useState(1);
  const [showGuide, setShowGuide] = useState(false);
  const [saved, setSaved] = useState(false);
  const [restockEmail, setRestockEmail] = useState("");
  const [restockNotice, setRestockNotice] = useState("");
  const selectedStock = product.variants.find((variant) => variant.size === size)?.stock ?? 0;
  const images = product.images.length ? product.images : ["/products/sea-mist-01.webp"];
  async function toggleWishlist() {
    const response = await fetch("/api/wishlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.id }) });
    if (response.status === 401) { router.push(`/login?return_to=${encodeURIComponent(`/products/${product.slug}`)}`); return; }
    const result = (await response.json()) as { saved?: boolean };
    if (response.ok) setSaved(Boolean(result.saved));
  }
  async function subscribeRestock(event: React.FormEvent) {
    event.preventDefault();
    const variantId = product.variants.find((variant) => variant.size === size)?.id ?? null;
    const response = await fetch("/api/restock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: restockEmail, productId: product.id, variantId }) });
    const result = (await response.json()) as { error?: string };
    setRestockNotice(response.ok ? "You’re on the list. We’ll email when this size returns." : result.error || "We could not save that request.");
  }
  return (
    <main className="product-page">
      <header className="product-page-header"><Link href="/shop">← Shop</Link><Link className="checkout-wordmark" href="/"><span>Classy Apparels</span></Link><Link href="/track-order">Track order</Link></header>
      <div className="product-page-grid">
        <section className="product-page-gallery"><div className="product-page-main"><img src={images[image] ?? images[0]} alt={`${product.name}, view ${image + 1}`} /></div><div className="product-page-thumbs">{images.map((url, index) => <button key={url} className={image === index ? "active" : ""} onClick={() => setImage(index)}><img src={url} alt="" /></button>)}</div></section>
        <section className="product-page-copy"><p className="kicker">{product.eyebrow}</p><h1>{product.name}</h1><div className="price-line"><strong>{money(product.price)}</strong>{product.compareAt > product.price && <del>{money(product.compareAt)}</del>}</div><p className="tax-note">Inclusive of all taxes</p><p className="product-description">{product.description}</p><dl><div><dt>Colour</dt><dd>{product.color || "As shown"}</dd></div><div><dt>Fabric</dt><dd>{product.fabric || "Ask Sana"}</dd></div><div><dt>Includes</dt><dd>{product.includes}</dd></div></dl><div className="product-choice-heading"><strong>Choose size</strong><button onClick={() => setShowGuide(!showGuide)}>Size guide</button></div>{showGuide && <div className="inline-size-guide"><div><strong>Size</strong><strong>Bust</strong><strong>Waist</strong><strong>Hip</strong></div>{[["S","36","32","40"],["M","38","34","42"],["L","40","36","44"],["XL","42","38","46"],["XXL","44","40","48"],["XXXL","46","42","50"],["4XL","48","44","52"]].map((row) => <div key={row[0]}>{row.map((value) => <span key={value}>{value}</span>)}</div>)}<small>Body measurements in inches.</small></div>}<div className="size-options">{product.variants.filter((variant) => variant.active).map((variant) => <button key={variant.id} className={size === variant.size ? "selected" : ""} onClick={() => setSize(variant.size)}>{variant.size}{variant.stock <= 0 ? " · sold out" : ""}</button>)}</div>{size && selectedStock <= 3 && selectedStock > 0 && <p className="stock-note">Only {selectedStock} left in {size}</p>} {size && selectedStock <= 0 && <form className="restock-form" onSubmit={subscribeRestock}><label><span>Size sold out — email me when it returns</span><input type="email" value={restockEmail} onChange={(event) => setRestockEmail(event.target.value)} placeholder="you@example.com" required /></label><button type="submit">Notify me</button>{restockNotice && <small>{restockNotice}</small>}</form>}<label className="product-quantity">Quantity<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={selectedStock <= 0}>{Array.from({ length: Math.max(1, Math.min(5, selectedStock)) }, (_, index) => index + 1).map((value) => <option key={value}>{value}</option>)}</select></label><a className={`button button-dark product-buy ${!size || selectedStock <= 0 ? "disabled" : ""}`} href={size && selectedStock > 0 ? `/checkout?product=${encodeURIComponent(product.id)}&size=${encodeURIComponent(size)}&qty=${quantity}` : undefined}>Buy securely · {money(product.price * quantity)}</a><button className="wishlist-button" onClick={toggleWishlist}>{saved ? "♥ Saved to wishlist" : "♡ Save to wishlist"}</button><a className="button whatsapp-product-button" href={`https://wa.me/917715910151?text=${encodeURIComponent(`Hi Sana, I have a question about ${product.name}${size ? ` in size ${size}` : ""}.`)}`} target="_blank" rel="noreferrer">Ask before buying</a><div className="product-assurances"><span>Secure server-verified payment</span><span>Size exchange support</span><span>Online order tracking</span></div></section>
      </div>
      <section className="product-page-story"><p className="kicker">Look closer</p><h2>Real photos. Every useful angle.</h2><p>Phone-shot details stay uncropped on a softly balanced canvas, so the colour, length and finishing remain easy to judge.</p></section>
    </main>
  );
}
