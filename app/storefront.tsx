"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CatalogProduct } from "../lib/catalog";
import type { ManagedCategory } from "../lib/categories";
import type { StorefrontSettings } from "../lib/storefront-settings";
import WhatsAppFloat from "./components/whatsapp-float";
import BrandLogo from "./components/brand-logo";
import { useOverlayDialog } from "./components/use-overlay-dialog";
import { WHATSAPP_COMMUNITY_URL, whatsappHref } from "../lib/whatsapp";

type BagItem = { productId: string; size: string; quantity: number };
const BAG_KEY = "classy-apparels-bag-v1";
const BAG_COOKIE = "classy_apparels_bag";

function storedBag(): BagItem[] {
  const local = window.localStorage.getItem(BAG_KEY);
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(`${BAG_COOKIE}=`))?.slice(BAG_COOKIE.length + 1);
  return JSON.parse(local || (cookie ? decodeURIComponent(cookie) : "[]")) as BagItem[];
}

const sizeRows = [
  ["S", "36", "32", "40"],
  ["M", "38", "34", "42"],
  ["L", "40", "36", "44"],
  ["XL", "42", "38", "46"],
  ["XXL", "44", "40", "48"],
  ["XXXL", "46", "42", "50"],
  ["4XL", "48", "44", "52"],
];

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
  if (name === "bag") return <svg {...common}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>;
  if (name === "heart") return <svg {...common}><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" /></svg>;
  if (name === "user") return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
  if (name === "menu") return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
  if (name === "close") return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
  if (name === "chevron") return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
  if (name === "truck") return <svg {...common}><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 5 6v5c0 4.7 2.9 8.2 7 10 4.1-1.8 7-5.3 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (name === "rotate") return <svg {...common}><path d="M4 4v6h6" /><path d="M20 20v-6h-6" /><path d="M5.6 15a8 8 0 0 0 13-3M18.4 9A8 8 0 0 0 5.5 6" /></svg>;
  if (name === "instagram") return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".7" fill="currentColor" stroke="none" /></svg>;
  return null;
}

export default function Storefront({ product, products, categories, settings }: { product: CatalogProduct; products: CatalogProduct[]; categories: ManagedCategory[]; settings: StorefrontSettings }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [bag, setBag] = useState<BagItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const closeSizeGuide = useCallback(() => setSizeOpen(false), []);
  const closeOverlays = useCallback(() => { setMenuOpen(false); setCartOpen(false); setSizeOpen(false); setSearchOpen(false); }, []);
  const menuDialogRef = useOverlayDialog<HTMLElement>(menuOpen, closeMenu);
  const cartDialogRef = useOverlayDialog<HTMLElement>(cartOpen, closeCart);
  const sizeDialogRef = useOverlayDialog<HTMLElement>(sizeOpen, closeSizeGuide);
  const searchDialogRef = useOverlayDialog<HTMLDivElement>(searchOpen, closeSearch, "input");

  const sizes = product.variants.filter((variant) => variant.active && variant.stock > 0).map((variant) => variant.size);
  const defaultVariant = product.variants.find((variant) => variant.active) ?? product.variants[0];
  const cartSize = product.hasSizes ? selectedSize : defaultVariant?.size ?? "";
  const selectedVariant = product.variants.find((variant) => variant.size === cartSize && variant.active);
  const selectedStock = selectedVariant?.stock ?? 0;
  const galleryImages = product.images.length ? product.images : ["/products/sea-mist-01.webp"];
  const coverImage = galleryImages[0];
  const styledImage = galleryImages[1] ?? coverImage;
  const resolveHomepageImage = (imageUrl: string, fallback: string) => imageUrl && galleryImages.includes(imageUrl) ? imageUrl : fallback;
  const heroImage = resolveHomepageImage(settings.featuredHeroImageUrl, styledImage);
  const detailPrimaryImage = resolveHomepageImage(settings.detailPrimaryImageUrl, galleryImages[2] ?? coverImage);
  const detailSecondaryImage = resolveHomepageImage(settings.detailSecondaryImageUrl, galleryImages[4] ?? styledImage);
  const categoryCards = useMemo(() => categories.filter((category) => category.showOnHomepage).flatMap((category) => {
    const categoryProducts = products.filter((candidate) => candidate.status === "active" && (candidate.categoryId === category.id || candidate.categorySlug === category.slug));
    const image = categoryProducts[0]?.images[0];
    return image ? [{ ...category, image, productCount: categoryProducts.length }] : [];
  }), [categories, products]);
  const overlayOpen = menuOpen || cartOpen || sizeOpen || searchOpen;

  useEffect(() => {
    document.body.classList.toggle("no-scroll", overlayOpen);
    return () => document.body.classList.remove("no-scroll");
  }, [overlayOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = storedBag();
        if (Array.isArray(stored)) {
          setBag(stored.slice(0, 10).flatMap((item) => {
            const bagProduct = products.find((candidate) => candidate.id === item.productId);
            const variant = bagProduct?.variants.find((candidate) => candidate.active && candidate.stock > 0 && candidate.size === item.size);
            if (!bagProduct || !variant) return [];
            return [{ productId: bagProduct.id, size: variant.size, quantity: Math.max(1, Math.min(5, variant.stock, Math.floor(Number(item.quantity) || 1))) }];
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

  const bagLines = useMemo(() => bag.flatMap((item, index) => {
    const bagProduct = products.find((candidate) => candidate.id === item.productId);
    const variant = bagProduct?.variants.find((candidate) => candidate.size === item.size);
    return bagProduct && variant ? [{ item, product: bagProduct, variant, index }] : [];
  }), [bag, products]);
  const bagCount = bagLines.reduce((sum, line) => sum + line.item.quantity, 0);
  const bagSubtotal = bagLines.reduce((sum, line) => sum + line.product.price * line.item.quantity, 0);
  const checkoutHref = `/checkout?cart=${encodeURIComponent(JSON.stringify(bag))}`;
  const productMessage = `Hi Sana, I’m interested in the ${product.name}${product.color ? ` in ${product.color}` : ""}${selectedSize ? `, size ${selectedSize}` : ""}. Could you help me with sizing and availability?`;
  const sizeHelpMessage = `Hi Sana, I need help choosing a size for the ${product.name}${selectedSize ? ` in size ${selectedSize}` : ""}.`;
  const newsletterMessage = "Hi Sana, please add me to the Classy Apparels by Sana drop updates.";
  const wholesaleMessage = "Hi Sana, I’m interested in placing a wholesale or bulk order. Please share your wholesale prices, minimum order quantity, available styles and delivery details.";

  function saveBag(next: BagItem[]) {
    const serialized = JSON.stringify(next.slice(0, 10));
    try { window.localStorage.setItem(BAG_KEY, serialized); } catch { /* Cookie backup remains available. */ }
    // eslint-disable-next-line react-hooks/immutability -- document.cookie is the navigation-safe cart fallback.
    document.cookie = `${BAG_COOKIE}=${encodeURIComponent(serialized)}; path=/; max-age=2592000; samesite=lax`;
    return next;
  }

  function addToBag() {
    if (product.hasSizes && !selectedSize) {
      setNotice("Choose your size first");
      document.getElementById("size-picker")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!cartSize || !selectedVariant || selectedStock <= 0) {
      setNotice("This piece is currently sold out.");
      return;
    }
    const index = bag.findIndex((item) => item.productId === product.id && item.size === cartSize);
    const next = index < 0 ? [...bag, { productId: product.id, size: cartSize, quantity: 1 }] : bag.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.min(item.quantity + 1, selectedStock, 5) } : item);
    saveBag(next);
    setBag(next);
    setNotice("");
    setCartOpen(true);
  }

  function changeQuantity(index: number, quantity: number) {
    const next = bag.flatMap((item, itemIndex) => {
      if (itemIndex !== index) return [item];
      if (quantity <= 0) return [];
      const bagProduct = products.find((candidate) => candidate.id === item.productId);
      const stock = bagProduct?.variants.find((variant) => variant.size === item.size)?.stock ?? 1;
      return [{ ...item, quantity: Math.min(quantity, stock, 5) }];
    });
    saveBag(next);
    setBag(next);
  }

  return (
    <main>
      <div className="storefront-content" inert={overlayOpen || undefined} aria-hidden={overlayOpen || undefined}>
      <a className="skip-link" href="#shop">Skip to products</a>
      <div className="announcement"><span>{settings.promotionText}</span><a href={settings.promotionCtaHref}>{settings.promotionCtaLabel} →</a></div>

      <header className="site-header">
        <button className="icon-button mobile-only" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen} aria-controls="main-menu"><Icon name="menu" size={23} /></button>
        <BrandLogo className="wordmark" priority />
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="/shop">Shop</a><a href="/track-order">Track order</a><button onClick={() => setSizeOpen(true)} aria-expanded={sizeOpen} aria-controls="size-guide">Size guide</button><a href="#story">Our story</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button desktop-icon" onClick={() => setSearchOpen(true)} aria-label="Search" aria-expanded={searchOpen} aria-controls="site-search"><Icon name="search" /></button>
          <a className="icon-button desktop-icon" href="/account" aria-label="My orders"><Icon name="user" /></a>
          <button className="icon-button mobile-search" onClick={() => setSearchOpen(true)} aria-label="Search" aria-expanded={searchOpen} aria-controls="site-search"><Icon name="search" /></button>
          <button className="icon-button cart-button" onClick={() => setCartOpen(true)} aria-label={`Open bag with ${bagCount} items`} aria-expanded={cartOpen} aria-controls="shopping-bag"><Icon name="bag" />{bagCount > 0 && <span className="cart-count">{bagCount}</span>}</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker">{settings.heroKicker}</p>
          <h1>{settings.heroHeading}<br /><em>{settings.heroAccent}</em></h1>
          <p className="hero-body">{settings.heroBody}</p>
          <div className="hero-actions">
            <a className="button button-dark" href="/shop">Shop now <Icon name="arrow" size={18} /></a>
            <a className="text-link" href="https://www.instagram.com/classy_apparels_bysana/" target="_blank" rel="noreferrer">Follow on Instagram <Icon name="instagram" size={17} /></a>
          </div>
          <div className="hero-note"><span>01</span><p>{product.color ? `${product.name} in ${product.color}.` : product.description}</p></div>
        </div>
        <div className="hero-visual">
          <div className="hero-image-backdrop" style={{ backgroundImage: `url(${heroImage})` }} />
          <img src={heroImage} alt={`${product.name}, styled view`} className="hero-image" fetchPriority="high" decoding="async" />
          <a className="hero-card" href={`/products/${product.slug}`} aria-label={`View ${product.name}`}><span>{settings.featuredKicker}</span><strong>{product.name}</strong><small>{money(product.price)}</small></a>
        </div>
      </section>

      <section className="service-strip" aria-label="Shopping benefits">
        <div><Icon name="truck" /><span><strong>Delivery across India</strong><small>Shipping shown at checkout</small></span></div>
        <div><Icon name="rotate" /><span><strong>Easy size exchange</strong><small>Request within 3 days of delivery</small></span></div>
        <div><Icon name="shield" /><span><strong>Secure checkout</strong><small>UPI, cards and trusted payments</small></span></div>
      </section>

      <section className="wholesale-notice" aria-labelledby="wholesale-notice-title">
        <div className="wholesale-copy"><p className="kicker">Retail &amp; wholesale</p><h2 id="wholesale-notice-title">Shopping for yourself<br /><em>or stocking up?</em></h2></div>
        <div className="wholesale-details"><p>We welcome both retail and wholesale orders. All prices shown on this website are retail prices. For wholesale rates, bulk availability and minimum order details, message us directly.</p><a className="button wholesale-button" href={whatsappHref(wholesaleMessage)} target="_blank" rel="noreferrer">Wholesale bulk orders on WhatsApp <Icon name="arrow" size={18} /></a></div>
      </section>

      {categoryCards.length > 0 && <section className="category-showcase" aria-labelledby="category-showcase-title">
        <div className="category-showcase-heading"><div><p className="kicker">Shop by category</p><h2 id="category-showcase-title">Find your<br /><em>kind of Style&apos;s.</em></h2></div><div className="category-carousel-controls"><button type="button" onClick={() => document.getElementById("home-category-track")?.scrollBy({ left: -300, behavior: "smooth" })} aria-label="See previous categories">←</button><button type="button" onClick={() => document.getElementById("home-category-track")?.scrollBy({ left: 300, behavior: "smooth" })} aria-label="See more categories">→</button></div></div>
        <div className="category-track" id="home-category-track" tabIndex={0} aria-label="Product categories">
          {categoryCards.map((category) => <Link className="category-card" href={`/shop?category=${encodeURIComponent(category.slug)}`} key={category.id}>
            <div className="category-card-image"><img src={category.image} alt="" loading="lazy" decoding="async" /></div>
            <div className="category-card-copy"><strong>{category.name}</strong><small>{category.productCount} piece{category.productCount === 1 ? "" : "s"}</small><span>Explore category <Icon name="arrow" size={15} /></span></div>
          </Link>)}
        </div>
      </section>}

      <section className="editorial-intro" id="shop">
        <div><p className="kicker">{settings.collectionKicker}</p><h2>{settings.collectionHeading}</h2></div>
        <p>{settings.collectionBody}</p>
      </section>

      <section className="product-showcase">
        <div className="gallery-column">
          <div className="main-product-image">
            <img src={galleryImages[selectedImage] ?? coverImage} alt={`${product.name}, view ${selectedImage + 1}`} decoding="async" />
            <span className="product-badge">{product.badge}</span>
          </div>
          <div className="thumbnail-row" aria-label="Product images">
            {galleryImages.map((image, index) => <button key={image} className={selectedImage === index ? "active" : ""} onClick={() => setSelectedImage(index)} aria-label={`View product image ${index + 1}`} aria-pressed={selectedImage === index}><img src={image} alt="" loading="lazy" decoding="async" /></button>)}
          </div>
        </div>

        <div className="product-details">
          <p className="kicker">{product.eyebrow}</p>
          <h2>{product.name}</h2>
          <div className="price-line"><strong>{money(product.price)}</strong>{product.compareAt > product.price && <><del>{money(product.compareAt)}</del><span>Save {money(product.compareAt - product.price)}</span></>}</div>
          <p className="tax-note">Inclusive of all taxes</p>
          <p className="shipping-note">Shipping is calculated from your delivery address and added at checkout before payment.</p>
          <p className="product-description">{product.description}</p>
          {product.includes && <div className="includes"><span>Includes</span><strong>{product.includes}</strong></div>}
          {product.hasSizes ? <>
          <div className="size-heading" id="size-picker"><span>Select size</span><button onClick={() => setSizeOpen(true)} aria-expanded={sizeOpen} aria-controls="size-guide">Find my size</button></div>
          <div className="size-options">{sizes.map((size) => <button key={size} className={selectedSize === size ? "selected" : ""} onClick={() => { setSelectedSize(size); setNotice(""); }} aria-pressed={selectedSize === size}>{size}</button>)}</div>
          {!sizes.length && <p className="stock-note">No sizes currently available.</p>}
          </> : <div className="size-heading no-size-heading" id="size-picker"><span>No size needed</span><small>Free-size / unstitched piece</small></div>}
          {notice && <p className="field-notice" role="alert">{notice}</p>}
          <button className="button button-dark add-button" onClick={addToBag} disabled={!hydrated || !selectedVariant || selectedStock <= 0}>Add to bag <span>{money(product.price)}</span></button>
          <a className="button whatsapp-product-button" href={whatsappHref(productMessage)} target="_blank" rel="noreferrer">Ask Sana on WhatsApp</a>
          <details open><summary>Details &amp; care <Icon name="chevron" size={17} /></summary><p>{product.care || "Follow the care instructions on the garment label."} Product colours can vary slightly across phone and screen settings.</p></details>
          <details><summary>Delivery &amp; exchanges <Icon name="chevron" size={17} /></summary><p>Dispatch is typically planned within 2–4 working days. Unworn pieces with tags can be requested for a size exchange within 3 days of delivery.</p></details>
        </div>
      </section>

      <section className="detail-story">
        <div className="detail-copy"><p className="kicker">{settings.detailKicker}</p><h2>{settings.detailHeading}</h2><p>{settings.detailBody || product.description}</p><button className="text-link" onClick={() => { setSelectedImage(Math.min(2, galleryImages.length - 1)); document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" }); }}>See the close-up <Icon name="arrow" size={17} /></button></div>
        <div className="detail-image"><img src={detailPrimaryImage} alt={`${product.name}, detail view`} loading="lazy" decoding="async" /></div>
        <div className="detail-image second"><img src={detailSecondaryImage} alt={`${product.name}, alternate detail view`} loading="lazy" decoding="async" /></div>
      </section>

      <section className="story-section" id="story">
        <BrandLogo variant="mark" className="story-mark" />
        <div><p className="kicker">A note from Sana</p><h2>{settings.storyHeading}</h2><p>{settings.storyBody}</p></div>
        <a href="https://www.instagram.com/classy_apparels_bysana/" target="_blank" rel="noreferrer" className="button button-outline">Meet us on Instagram</a>
      </section>

      <section className="newsletter">
        <p className="kicker">The Sana circle</p><h2>{settings.newsletterHeading}</h2><p>{settings.newsletterBody}</p>
        <a className="newsletter-join" href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noreferrer">Join on WhatsApp <Icon name="arrow" /></a>
      </section>

      <footer>
        <div className="footer-brand"><span className="wordmark-main">Classy Apparels</span><p>Thoughtful everyday elegance, selected by Sana in small drops.</p></div>
        <div><h3>Shop</h3><a href="/shop">Shop</a><button onClick={() => setSizeOpen(true)} aria-expanded={sizeOpen} aria-controls="size-guide">Size guide</button></div>
        <div><h3>Help</h3><a href="/account">My orders</a><a href="/track-order">Track order</a><a href="/policies#shipping">Shipping</a><a href="/policies#exchange">Exchange policy</a><a href={whatsappHref("Hi Sana, I need help with an order or shopping question.")} target="_blank" rel="noreferrer">WhatsApp us</a></div>
        <div><h3>Follow</h3><a href="https://www.instagram.com/classy_apparels_bysana/" target="_blank" rel="noreferrer">Instagram</a></div>
        <div className="footer-bottom"><span>© 2026 Classy Apparels by Sana</span><span>Made with care in India</span></div>
      </footer>

      <WhatsAppFloat message={productMessage} />
      </div>

      <button type="button" className={`overlay ${overlayOpen ? "show" : ""}`} onClick={closeOverlays} aria-label="Close open panel" tabIndex={overlayOpen ? 0 : -1} />

      <aside ref={menuDialogRef} id="main-menu" className={`side-panel menu-panel ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen} aria-labelledby="menu-title" aria-modal="true" inert={!menuOpen} role="dialog" tabIndex={-1}>
        <div className="panel-header"><span id="menu-title">Menu</span><button className="icon-button" onClick={closeMenu} aria-label="Close menu"><Icon name="close" /></button></div>
        <nav><a href="/shop">Shop <Icon name="chevron" /></a><a href="/account">My orders <Icon name="chevron" /></a><a href="/track-order">Track order <Icon name="chevron" /></a><button onClick={() => { setMenuOpen(false); setSizeOpen(true); }}>Size guide <Icon name="chevron" /></button><a href="#story" onClick={() => setMenuOpen(false)}>Our story <Icon name="chevron" /></a></nav>
        <a className="menu-instagram" href="https://www.instagram.com/classy_apparels_bysana/" target="_blank" rel="noreferrer"><Icon name="instagram" /> @classy_apparels_bysana</a>
      </aside>

      <aside ref={cartDialogRef} id="shopping-bag" className={`side-panel cart-panel ${cartOpen ? "open" : ""}`} aria-hidden={!cartOpen} aria-labelledby="bag-title" aria-modal="true" inert={!cartOpen} role="dialog" tabIndex={-1}>
        <div className="panel-header"><span id="bag-title">Your bag · {bagCount}</span><button className="icon-button" onClick={closeCart} aria-label="Close bag"><Icon name="close" /></button></div>
        {!bagLines.length ? (
          <div className="empty-cart"><Icon name="bag" size={34} /><h2>Your bag is waiting</h2><p>Start with the first Sana edit.</p><button className="button button-dark" onClick={() => { setCartOpen(false); document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" }); }}>Explore the drop</button></div>
        ) : (
          <div className="cart-content">
            <div className="shop-bag-items">{bagLines.map(({ item, product: bagProduct, index }) => <div className="shop-bag-item" key={`${item.productId}-${item.size}`}><img src={bagProduct.images[0]} alt="" loading="lazy" decoding="async" /><div><strong>{bagProduct.name}</strong><span>Size {item.size}</span><small>{money(bagProduct.price * item.quantity)}</small><div className="quantity-control"><button onClick={() => changeQuantity(index, item.quantity - 1)} aria-label="Decrease quantity">−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(index, item.quantity + 1)} aria-label="Increase quantity">+</button></div></div><button className="bag-remove" onClick={() => changeQuantity(index, 0)} aria-label={`Remove ${bagProduct.name}`}>×</button></div>)}</div>
            <div className="cart-summary"><div><span>Subtotal</span><strong>{money(bagSubtotal)}</strong></div><small>Shipping is calculated from your delivery address at checkout and added before payment.</small></div>
            <a href={checkoutHref} className="button button-dark checkout-button">Secure checkout <Icon name="arrow" size={18} /></a><p className="secure-line"><Icon name="shield" size={16} /> Protected checkout · UPI · Cards</p>
          </div>
        )}
      </aside>

      <aside ref={sizeDialogRef} id="size-guide" className={`side-panel size-panel ${sizeOpen ? "open" : ""}`} aria-hidden={!sizeOpen} aria-labelledby="size-guide-title" aria-modal="true" inert={!sizeOpen} role="dialog" tabIndex={-1}>
        <div className="panel-header"><span id="size-guide-title">Find your size</span><button className="icon-button" onClick={closeSizeGuide} aria-label="Close size guide"><Icon name="close" /></button></div>
        <div className="size-guide-content"><p>Body measurements in inches. For a relaxed fit, choose the larger size when you fall between two measurements.</p><table><thead><tr><th>Size</th><th>Bust</th><th>Waist</th><th>Hip</th></tr></thead><tbody>{sizeRows.map((row) => <tr key={row[0]}>{row.map((value, index) => <td key={value}>{index === 0 ? <strong>{value}</strong> : value}</td>)}</tr>)}</tbody></table><div className="measure-note"><strong>How to measure</strong><p>Keep the tape comfortably level around the fullest part of your bust and hips, and around your natural waist.</p></div><a className="button whatsapp-product-button" href={whatsappHref(sizeHelpMessage)} target="_blank" rel="noreferrer">Need help? Ask Sana</a></div>
      </aside>

      <div ref={searchDialogRef} id="site-search" className={`search-overlay ${searchOpen ? "open" : ""}`} aria-hidden={!searchOpen} aria-labelledby="search-title" aria-modal="true" inert={!searchOpen} role="dialog" tabIndex={-1}>
        <div className="search-top"><span id="search-title">What are you looking for?</span><button className="icon-button" onClick={closeSearch} aria-label="Close search"><Icon name="close" /></button></div>
        <form className="search-field" onSubmit={(event) => { event.preventDefault(); closeSearch(); router.push(`/shop?q=${encodeURIComponent(searchQuery)}`); }}><Icon name="search" size={28} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search dresses, sets, colours…" aria-label="Search products" /><button type="submit" aria-label="Search">→</button></form>
        <p>Popular now</p><div className="search-chips"><button onClick={() => setSearchQuery("Aqua")}>Aqua sets</button><button onClick={() => setSearchQuery("3-piece")}>3-piece suits</button><button onClick={() => { closeSearch(); router.push("/shop"); }}>New arrivals</button></div>
      </div>
    </main>
  );
}
