"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CatalogProduct } from "../../lib/catalog";
import type { StorefrontSettings } from "../../lib/storefront-settings";
import WhatsAppFloat from "../components/whatsapp-float";
import BrandLogo from "../components/brand-logo";
import { useOverlayDialog } from "../components/use-overlay-dialog";
import { whatsappHref } from "../../lib/whatsapp";

type BagItem = { productId: string; size: string; quantity: number };
const BAG_KEY = "classy-apparels-bag-v1";
const BAG_COOKIE = "classy_apparels_bag";

function storedBag(): BagItem[] {
  const local = window.localStorage.getItem(BAG_KEY);
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(`${BAG_COOKIE}=`))?.slice(BAG_COOKIE.length + 1);
  return JSON.parse(local || (cookie ? decodeURIComponent(cookie) : "[]")) as BagItem[];
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function BagIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>;
}

export default function ShopClient({ products, settings, initialQuery, initialBagOpen = false }: { products: CatalogProduct[]; settings: StorefrontSettings; initialQuery: string; initialBagOpen?: boolean }) {
  const [query, setQuery] = useState(initialQuery);
  const [colour, setColour] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [priceLimit, setPriceLimit] = useState("all");
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [bag, setBag] = useState<BagItem[]>([]);
  const [bagOpen, setBagOpen] = useState(initialBagOpen);
  const [noticeId, setNoticeId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const closeBag = useCallback(() => setBagOpen(false), []);
  const bagDialogRef = useOverlayDialog<HTMLElement>(bagOpen, closeBag);
  const colours = useMemo(() => [...new Set(products.map((product) => product.color.trim()).filter(Boolean))].sort(), [products]);
  const visible = useMemo(() => products.filter((product) => {
    const matchesQuery = `${product.name} ${product.color} ${product.description}`.toLowerCase().includes(query.trim().toLowerCase());
    const totalStock = product.variants.filter((variant) => variant.active).reduce((sum, variant) => sum + variant.stock, 0);
    const matchesColour = colour === "all" || product.color === colour;
    const matchesAvailability = availability === "all" || (availability === "in_stock" ? totalStock > 0 : totalStock === 0);
    const matchesPrice = priceLimit === "all" || product.price <= Number(priceLimit);
    return matchesQuery && matchesColour && matchesAvailability && matchesPrice;
  }), [products, query, colour, availability, priceLimit]);
  const whatsappMessage = `Hi Sana, I’m browsing the Classy Apparels shop${query.trim() ? ` and looking for ${query.trim()}` : ""}${colour !== "all" ? ` in ${colour}` : ""}. Could you help me choose a piece?`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = storedBag();
        if (Array.isArray(stored)) {
          setBag(stored.slice(0, 10).flatMap((item) => {
            const product = products.find((candidate) => candidate.id === item.productId);
            const variant = product?.variants.find((candidate) => candidate.active && candidate.stock > 0 && candidate.size === item.size);
            if (!product || !variant) return [];
            return [{ productId: product.id, size: variant.size, quantity: Math.max(1, Math.min(5, variant.stock, Math.floor(Number(item.quantity) || 1))) }];
          }));
        }
      } catch {
        window.localStorage.removeItem(BAG_KEY);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [products]);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(BAG_KEY, JSON.stringify(bag));
  }, [bag, hydrated]);

  useEffect(() => {
    document.body.classList.toggle("no-scroll", bagOpen);
    return () => document.body.classList.remove("no-scroll");
  }, [bagOpen]);

  const bagLines = useMemo(() => bag.flatMap((item, index) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const variant = product?.variants.find((candidate) => candidate.size === item.size);
    return product && variant ? [{ item, product, variant, index }] : [];
  }), [bag, products]);
  const bagCount = bagLines.reduce((sum, line) => sum + line.item.quantity, 0);
  const bagSubtotal = bagLines.reduce((sum, line) => sum + line.product.price * line.item.quantity, 0);
  const checkoutHref = `/checkout?cart=${encodeURIComponent(JSON.stringify(bag))}`;

  function saveBag(next: BagItem[]) {
    const serialized = JSON.stringify(next.slice(0, 10));
    try { window.localStorage.setItem(BAG_KEY, serialized); } catch { /* Cookie backup remains available. */ }
    // eslint-disable-next-line react-hooks/immutability -- document.cookie is the navigation-safe cart fallback.
    document.cookie = `${BAG_COOKIE}=${encodeURIComponent(serialized)}; path=/; max-age=2592000; samesite=lax`;
    return next;
  }

  function addToBag(product: CatalogProduct) {
    const size = selectedSizes[product.id] ?? "";
    const variant = product.variants.find((item) => item.size === size && item.active && item.stock > 0);
    if (!variant) {
      setNoticeId(product.id);
      return;
    }
    const index = bag.findIndex((item) => item.productId === product.id && item.size === size);
    const next = index < 0 ? [...bag, { productId: product.id, size, quantity: 1 }] : bag.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.min(item.quantity + 1, variant.stock, 5) } : item);
    saveBag(next);
    setBag(next);
    setNoticeId("");
    setBagOpen(true);
  }

  function changeQuantity(index: number, quantity: number) {
    const next = bag.flatMap((item, itemIndex) => {
      if (itemIndex !== index) return [item];
      if (quantity <= 0) return [];
      const product = products.find((candidate) => candidate.id === item.productId);
      const stock = product?.variants.find((variant) => variant.size === item.size)?.stock ?? 1;
      return [{ ...item, quantity: Math.min(quantity, stock, 5) }];
    });
    saveBag(next);
    setBag(next);
  }

  return (
    <main className="shop-page">
      <div className="shop-content" inert={bagOpen || undefined} aria-hidden={bagOpen || undefined}>
      <div className="shop-announcement"><span>{settings.promotionText}</span><Link href={settings.promotionCtaHref}>{settings.promotionCtaLabel} →</Link></div>
      <header className="shop-header"><Link href="/" className="checkout-back">← Home</Link><BrandLogo className="checkout-wordmark" priority /><div className="shop-header-actions"><Link href="/wishlist">Wishlist</Link><Link href="/account">My orders</Link><Link href="/track-order">Track order</Link><a href={whatsappHref(whatsappMessage)} target="_blank" rel="noreferrer">Need help?</a><Link className="shop-mobile-account" href="/account" aria-label="My account">Account</Link><Link className="shop-mobile-track" href="/track-order">Track</Link><button className="shop-bag-button" onClick={() => setBagOpen(true)} aria-label={`Open bag with ${bagCount} items`} aria-expanded={bagOpen} aria-controls="shop-bag"><BagIcon />{bagCount > 0 && <span>{bagCount}</span>}</button></div></header>
      <section className="shop-heading"><p className="kicker">The Sana edit</p><h1>Pieces worth<br /><em>making plans for.</em></h1><p>Small drops, honest phone photography and sizing help from a real person.</p></section>
      <div className="shop-controls shop-controls-simple"><strong>Shop</strong><label><span className="sr-only">Search products</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or colour" /></label><select aria-label="Filter by colour" value={colour} onChange={(event) => setColour(event.target.value)}><option value="all">All colours</option>{colours.map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label="Filter by availability" value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="all">All availability</option><option value="in_stock">In stock</option><option value="sold_out">Sold out</option></select><select aria-label="Filter by price" value={priceLimit} onChange={(event) => setPriceLimit(event.target.value)}><option value="all">Any price</option><option value="1499">Up to ₹1,499</option><option value="2499">Up to ₹2,499</option><option value="3999">Up to ₹3,999</option></select><span>{visible.length} piece{visible.length === 1 ? "" : "s"}</span></div>
      {visible.length ? <section className="shop-grid">{visible.map((product) => {
        const stock = product.variants.filter((variant) => variant.active).reduce((sum, variant) => sum + variant.stock, 0);
        const sizes = product.variants.filter((variant) => variant.active && variant.stock > 0);
        return <article className="shop-card" key={product.id}><a href={`/products/${product.slug}`} className="shop-card-image"><img src={product.images[0]} alt={product.name} loading="lazy" decoding="async" />{stock <= 3 && <span>{stock === 0 ? "Sold out" : `Only ${stock} left`}</span>}</a><div><p>{product.color || "Sana edit"}</p><h2><a href={`/products/${product.slug}`}>{product.name}</a></h2><div className="shop-price"><strong>{money(product.price)}</strong>{product.compareAt > product.price && <del>{money(product.compareAt)}</del>}</div><p className="card-sizes">{sizes.map((variant) => variant.size).join(" · ") || "Restocking soon"}</p><div className="shop-quick-add"><label><span className="sr-only">Choose size for {product.name}</span><select value={selectedSizes[product.id] ?? ""} onChange={(event) => { setSelectedSizes((current) => ({ ...current, [product.id]: event.target.value })); setNoticeId(""); }} disabled={!sizes.length || !hydrated}><option value="">Select size</option>{sizes.map((variant) => <option value={variant.size} key={variant.id}>{variant.size}{variant.stock <= 2 ? ` · ${variant.stock} left` : ""}</option>)}</select></label><button onClick={() => addToBag(product)} disabled={!sizes.length || !hydrated}>Add to bag</button></div>{noticeId === product.id && <p className="quick-add-notice" role="alert">Choose a size first.</p>}</div></article>;
      })}</section> : <div className="shop-empty"><h2>No pieces match that search.</h2><button className="text-link" onClick={() => setQuery("")}>Clear search</button></div>}
      <section className="shop-help"><div><p className="kicker">Not sure about fit?</p><h2>Sana can help you choose.</h2></div><p>Send your usual size or measurements on WhatsApp. We’ll compare them with the garment before you order.</p><a className="button button-dark" href={whatsappHref(whatsappMessage)} target="_blank" rel="noreferrer">Ask on WhatsApp</a></section>
      <footer className="shop-footer"><span>© 2026 Classy Apparels by Sana</span><div><Link href="/account">My orders</Link><Link href="/track-order">Track order</Link><a href="/policies">Shipping · Exchanges · Privacy</a></div></footer>

      <WhatsAppFloat message={whatsappMessage} />
      </div>

      <button type="button" className={`overlay ${bagOpen ? "show" : ""}`} onClick={closeBag} aria-label="Close bag" tabIndex={bagOpen ? 0 : -1} />
      <aside ref={bagDialogRef} id="shop-bag" className={`side-panel cart-panel shop-cart-panel ${bagOpen ? "open" : ""}`} aria-hidden={!bagOpen} aria-labelledby="shop-bag-title" aria-modal="true" inert={!bagOpen} role="dialog" tabIndex={-1}>
        <div className="panel-header"><span id="shop-bag-title">Your bag · {bagCount}</span><button className="icon-button" onClick={closeBag} aria-label="Close bag">×</button></div>
        {!bagLines.length ? <div className="empty-cart"><BagIcon /><h2>Your bag is waiting</h2><p>Choose a size and add a piece from the Sana edit.</p><button className="button button-dark" onClick={closeBag}>Continue shopping</button></div> : <div className="cart-content"><div className="shop-bag-items">{bagLines.map(({ item, product, index }) => <div className="shop-bag-item" key={`${item.productId}-${item.size}`}><img src={product.images[0]} alt="" loading="lazy" decoding="async" /><div><strong>{product.name}</strong><span>Size {item.size}</span><small>{money(product.price * item.quantity)}</small><div className="quantity-control"><button onClick={() => changeQuantity(index, item.quantity - 1)} aria-label="Decrease quantity">−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(index, item.quantity + 1)} aria-label="Increase quantity">+</button></div></div><button className="bag-remove" onClick={() => changeQuantity(index, 0)} aria-label={`Remove ${product.name}`}>×</button></div>)}</div><div className="cart-summary"><div><span>Subtotal</span><strong>{money(bagSubtotal)}</strong></div><small>Shipping is calculated from packed weight and destination at checkout.</small></div><a href={checkoutHref} className="button button-dark checkout-button">Secure checkout <span>→</span></a><p className="secure-line">Protected checkout · UPI · Cards</p></div>}
      </aside>
    </main>
  );
}
