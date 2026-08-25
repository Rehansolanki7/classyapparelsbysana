"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AppUser } from "../../lib/auth";
import type { CatalogProduct } from "../../lib/catalog";
import { countryName } from "../../lib/locations";

type ImportItem = {
  id: number;
  caption: string;
  mediaType: string;
  permalink: string;
  status: string;
  publishedAt: string | null;
  imageUrl: string;
};

type OrderItem = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  razorpayOrderId: string | null;
  customerName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  countryCode: string;
  totalPaise: number;
  createdAt: string;
  adminNotificationStatus: string;
  courierName: string;
  trackingNumber: string;
  trackingUrl: string;
};

type Tab = "overview" | "products" | "instagram" | "orders" | "settings";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2400;

async function prepareProductImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
  if (file.size <= MAX_UPLOAD_BYTES) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`${file.name} could not be opened. Please use a JPG, PNG or WebP image.`));
      element.src = objectUrl;
    });

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error(`Could not prepare ${file.name}.`);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const encode = (quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    let blob = await encode(0.82);
    if (blob && blob.size > MAX_UPLOAD_BYTES) blob = await encode(0.68);
    if (!blob || blob.size > MAX_UPLOAD_BYTES) {
      throw new Error(`${file.name} is still too large after optimisation. Please choose a smaller photo.`);
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "product-photo";
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function rupees(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function shortDate(value: string | null) {
  if (!value) return "Recently";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function orderStatusOptions(status: string) {
  const transitions: Record<string, string[]> = {
    paid: ["paid", "processing"],
    processing: ["processing", "shipped"],
    shipped: ["shipped", "delivered"],
    delivered: ["delivered"],
  };
  return transitions[status] ?? [];
}

export default function AdminDashboard({
  user,
  initialProducts,
  initialImports,
  initialOrders,
  signOutPath,
  notificationConfigured,
}: {
  user: AppUser;
  initialProducts: CatalogProduct[];
  initialImports: ImportItem[];
  initialOrders: OrderItem[];
  signOutPath: string;
  notificationConfigured: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [products, setProducts] = useState(initialProducts);
  const [imports, setImports] = useState(initialImports);
  const [orders, setOrders] = useState(initialOrders);
  const [selectedId, setSelectedId] = useState(initialProducts[0]?.id ?? "");
  const [draft, setDraft] = useState<CatalogProduct | null>(initialProducts[0] ?? null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingImports = imports.filter((item) => item.status === "pending");
  const totalStock = products.reduce((sum, product) => sum + product.variants.reduce((variantSum, variant) => variantSum + variant.stock, 0), 0);
  const paidOrders = orders.filter((order) => order.paymentStatus === "captured");
  const revenue = paidOrders.reduce((sum, order) => sum + order.totalPaise / 100, 0);
  const selected = useMemo(() => products.find((product) => product.id === selectedId) ?? null, [products, selectedId]);

  function selectProduct(id: string) {
    const product = products.find((item) => item.id === id) ?? null;
    setSelectedId(id);
    setDraft(product ? structuredClone(product) : null);
    setNotice("");
  }

  async function saveProduct() {
    if (!draft) return;
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/admin/products", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const result = (await response.json()) as { error?: string; slug?: string };
    if (!response.ok) setNotice(result.error || "Could not save this product");
    else {
      const saved = { ...structuredClone(draft), slug: result.slug ?? draft.slug };
      setDraft(saved);
      setProducts((current) => current.map((item) => item.id === draft.id ? saved : item));
      setNotice(`Saved. Storefront link: /products/${saved.slug}`);
    }
    setBusy(false);
  }

  async function uploadImages(files: FileList | File[]) {
    if (!draft) return;
    const selectedFiles = Array.from(files).slice(0, Math.max(0, 12 - draft.images.length));
    if (!selectedFiles.length) {
      setNotice(draft.images.length >= 12 ? "A product can have up to 12 photos." : "Choose one or more photos.");
      return;
    }
    setBusy(true);
    setNotice("");
    const uploaded: string[] = [];
    for (const file of selectedFiles) {
      try {
        setNotice(`Preparing photo ${uploaded.length + 1} of ${selectedFiles.length}…`);
        const prepared = await prepareProductImage(file);
        const form = new FormData();
        form.set("image", prepared);
        const response = await fetch("/api/admin/media", { method: "POST", body: form });
        let result: { url?: string; error?: string } = {};
        try {
          result = (await response.json()) as { url?: string; error?: string };
        } catch {
          // The hosting layer can reject an oversized request before the route returns JSON.
        }
        if (!response.ok || !result.url) {
          setNotice(result.error || (response.status === 413 ? `${file.name} is too large to upload.` : `Could not upload ${file.name}`));
          break;
        }
        uploaded.push(result.url);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : `Could not upload ${file.name}`);
        break;
      }
    }
    if (uploaded.length) {
      setDraft((current) => current ? { ...current, images: [...current.images, ...uploaded].slice(0, 12) } : current);
      setNotice(`${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} added. Save the product to publish the gallery.`);
    }
    setBusy(false);
  }

  function moveImage(index: number, direction: -1 | 1) {
    if (!draft) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.images.length) return;
    const images = [...draft.images];
    [images[index], images[nextIndex]] = [images[nextIndex], images[index]];
    setDraft({ ...draft, images });
  }

  function makePrimary(index: number) {
    if (!draft || index === 0) return;
    const images = [...draft.images];
    const [selectedImage] = images.splice(index, 1);
    setDraft({ ...draft, images: [selectedImage, ...images] });
  }

  function removeImage(index: number) {
    if (!draft) return;
    setDraft({ ...draft, images: draft.images.filter((_, imageIndex) => imageIndex !== index) });
  }

  async function addProduct() {
    setBusy(true);
    const response = await fetch("/api/admin/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Untitled product" }) });
    if (response.ok) window.location.reload();
    else { setNotice("Could not create a new draft"); setBusy(false); }
  }

  async function syncInstagram() {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/admin/instagram", { method: "POST" });
    const result = (await response.json()) as { error?: string; imported?: number; checked?: number };
    if (!response.ok) setNotice(result.error || "Instagram sync failed");
    else {
      const importsResponse = await fetch("/api/admin/imports");
      const data = (await importsResponse.json()) as { imports?: ImportItem[] };
      setImports(data.imports ?? []);
      setNotice(`${result.imported ?? 0} new post${result.imported === 1 ? "" : "s"} added to the review queue.`);
    }
    setBusy(false);
  }

  async function reviewImport(id: number, action: "create_draft" | "ignore") {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/admin/imports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setNotice(result.error || "Could not review this post");
    else {
      setImports((current) => current.map((item) => item.id === id ? { ...item, status: action === "ignore" ? "ignored" : "imported" } : item));
      setNotice(action === "ignore" ? "Post ignored." : "Draft created. Open Products to add price, sizes and stock.");
    }
    setBusy(false);
  }

  async function changeOrder(id: string, status: string) {
    const order = orders.find((item) => item.id === id);
    if (!order) return;
    const response = await fetch("/api/admin/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...order, status }) });
    const result = (await response.json()) as { error?: string };
    if (response.ok) setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    else setNotice(result.error || "Could not update the order status");
  }

  function updateOrderDraft(id: string, patch: Partial<OrderItem>) {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, ...patch } : order));
  }

  async function saveTracking(order: OrderItem) {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/admin/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(order) });
    const result = (await response.json()) as { error?: string };
    setNotice(response.ok ? "Customer tracking details saved." : result.error || "Could not save tracking details");
    setBusy(false);
  }

  async function resendOrderAlert(id: string) {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/admin/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "resend_notification" }) });
    const result = (await response.json()) as { error?: string };
    if (response.ok) {
      setOrders((current) => current.map((order) => order.id === id ? { ...order, adminNotificationStatus: "sent" } : order));
      setNotice("Order email alert sent.");
    } else setNotice(result.error || "Could not send the order alert");
    setBusy(false);
  }

  async function reconcileOrder(id: string) {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/admin/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "reconcile_payment" }) });
    const result = (await response.json()) as { error?: string; message?: string; status?: string; paymentStatus?: string };
    if (!response.ok) setNotice(result.error || "Could not reconcile this payment");
    else {
      setOrders((current) => current.map((order) => order.id === id ? { ...order, status: result.status ?? order.status, paymentStatus: result.paymentStatus ?? order.paymentStatus } : order));
      setNotice(result.message || (result.paymentStatus === "captured" ? "Captured payment reconciled." : "No captured payment was found."));
    }
    setBusy(false);
  }

  async function refundOrder(id: string) {
    if (!window.confirm("Create a full Razorpay refund for this paid order? This cannot be undone.")) return;
    setBusy(true); setNotice("");
    const response = await fetch("/api/admin/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "refund", reason: "Customer cancellation", restock: true }) });
    const result = (await response.json()) as { error?: string; status?: string };
    if (!response.ok) setNotice(result.error || "Could not create the refund");
    else { setOrders((current) => current.map((order) => order.id === id ? { ...order, status: result.status ?? "refund_pending", paymentStatus: result.status === "refunded" ? "refunded" : order.paymentStatus } : order)); setNotice(result.status === "refunded" ? "Refund completed and stock was returned." : "Refund requested. Check Razorpay for its final status."); }
    setBusy(false);
  }

  const nav: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "products", label: "Products", count: products.length },
    { id: "instagram", label: "Instagram queue", count: pendingImports.length },
    { id: "orders", label: "Orders", count: orders.length },
    { id: "settings", label: "Integrations" },
  ];

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/"><span>Classy Apparels</span></Link>
        <nav>{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}</button>)}</nav>
        <div className="admin-user"><span>{(user.name || user.email).slice(0, 1).toUpperCase()}</span><div><strong>{user.name || user.email}</strong><small>{user.email}</small></div><a href={signOutPath}>Sign out</a></div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div><p className="kicker">Sana’s private workspace</p><h1>{nav.find((item) => item.id === tab)?.label}</h1></div><div><Link className="admin-view-store" href="/" target="_blank">View store ↗</Link>{tab === "products" && <button className="button button-dark" onClick={addProduct} disabled={busy}>+ New product</button>}</div></header>
        {notice && <div className="admin-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

        {tab === "overview" && <div className="admin-overview">
          <div className="metric-grid"><article><span>Products</span><strong>{products.length}</strong><small>{products.filter((item) => item.status === "active").length} live</small></article><article><span>Units in stock</span><strong>{totalStock}</strong><small>Across every size</small></article><article><span>Pending posts</span><strong>{pendingImports.length}</strong><small>Ready for review</small></article><article><span>Captured revenue</span><strong>{rupees(revenue)}</strong><small>{paidOrders.length} paid orders</small></article></div>
          <div className="admin-two-col"><article className="admin-card"><div className="admin-card-heading"><div><p className="kicker">Inventory</p><h2>What needs attention</h2></div><button onClick={() => setTab("products")}>Manage →</button></div>{products.map((product) => { const stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0); return <div className="attention-row" key={product.id}><img src={product.images[0]} alt="" /><div><strong>{product.name}</strong><span>{product.status} · {stock} units</span></div><span className={stock < 5 ? "low" : "good"}>{stock < 5 ? "Low stock" : "Healthy"}</span></div>; })}</article>
          <article className="admin-card"><div className="admin-card-heading"><div><p className="kicker">Workflow</p><h2>Instagram → Store</h2></div></div><div className="workflow-steps"><div className="done"><span>1</span><div><strong>Post on Instagram</strong><small>Keep creating as usual</small></div></div><div><span>2</span><div><strong>Sync to review queue</strong><small>Photos and captions arrive as pending</small></div></div><div><span>3</span><div><strong>Add selling details</strong><small>Set price, sizes and stock, then publish</small></div></div></div><button className="button button-outline" onClick={() => setTab("instagram")}>Open Instagram queue</button></article></div>
        </div>}

        {tab === "products" && <div className="product-admin-layout">
          <div className="product-list"><div className="product-list-search">Products · {products.length}</div>{products.map((product) => <button key={product.id} className={selectedId === product.id ? "active" : ""} onClick={() => selectProduct(product.id)}><img src={product.images[0] || "/products/sea-mist-01.webp"} alt="" /><div><strong>{product.name}</strong><span>{rupees(product.price)} · {product.status}</span></div><small>{product.variants.reduce((sum, variant) => sum + variant.stock, 0)}</small></button>)}</div>
          {draft && selected && <div className="product-editor">
            <div className="editor-heading"><div><p className="kicker">{draft.source === "instagram" ? "Instagram draft" : "Product details"}</p><h2>{draft.name}</h2></div><span className={`status-pill ${draft.status}`}>{draft.status}</span></div>
            <div className="editor-photo-manager">
              <div className="editor-photo-heading"><div><strong>Product photo gallery</strong><p>Upload up to 12 phone photos at once. The first photo is the storefront cover.</p></div><label className="upload-button">+ Add photos<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files && uploadImages(event.target.files)} /></label></div>
              <div className="editor-photo-grid">{draft.images.map((image, index) => <article key={`${image}-${index}`} className={index === 0 ? "primary" : ""}><img src={image} alt={`${draft.name}, admin view ${index + 1}`} /><span>{index === 0 ? "Cover" : `Photo ${index + 1}`}</span><div>{index > 0 && <button type="button" onClick={() => makePrimary(index)}>Set cover</button>}<button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label="Move photo earlier">←</button><button type="button" onClick={() => moveImage(index, 1)} disabled={index === draft.images.length - 1} aria-label="Move photo later">→</button><button type="button" className="remove" onClick={() => removeImage(index)}>Remove</button></div></article>)}</div>
              {!draft.images.length && <div className="editor-photo-empty">No photos yet. Add clear front, back and detail views before publishing.</div>}
            </div>
            <div className="editor-fields"><label className="wide"><span>Product name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>Selling price (₹)</span><input type="number" min="0" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label><label><span>Compare-at price (₹)</span><input type="number" min="0" value={draft.compareAt} onChange={(event) => setDraft({ ...draft, compareAt: Number(event.target.value) })} /></label><label><span>Colour</span><input value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label><label><span>Fabric</span><input value={draft.fabric} onChange={(event) => setDraft({ ...draft, fabric: event.target.value })} /></label><label className="wide"><span>What is included</span><input value={draft.includes} onChange={(event) => setDraft({ ...draft, includes: event.target.value })} /></label><label className="wide"><span>Description</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={5} /></label></div>
            <div className="inventory-editor"><div><h3>Size inventory</h3><p>Stock reaches the storefront immediately after saving.</p></div><div className="variant-grid">{draft.variants.map((variant, index) => <label key={variant.id}><span>{variant.size}</span><input type="number" min="0" max="9999" value={variant.stock} onChange={(event) => { const variants = [...draft.variants]; variants[index] = { ...variant, stock: Number(event.target.value) }; setDraft({ ...draft, variants }); }} /></label>)}</div></div>
            <div className="editor-publish"><label><span>Visibility</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CatalogProduct["status"] })}><option value="draft">Draft — hidden from customers</option><option value="active">Active — visible and purchasable</option><option value="archived">Archived</option></select></label><label className="feature-toggle"><input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} /><span>Feature on home page</span></label><button className="button button-dark" onClick={saveProduct} disabled={busy}>{busy ? "Saving…" : "Save product"}</button></div>
          </div>}
        </div>}

        {tab === "instagram" && <div className="instagram-admin"><div className="integration-banner"><div className="instagram-icon">◎</div><div><p className="kicker">Instagram import</p><h2>Turn posts into polished product drafts.</h2><p>Sync the latest posts, review each one, then add price, sizes and inventory before anything appears publicly.</p></div><button className="button button-dark" onClick={syncInstagram} disabled={busy}>{busy ? "Syncing…" : "Sync latest posts"}</button></div>{pendingImports.length === 0 ? <div className="admin-empty"><span>◎</span><h2>Your review queue is clear</h2><p>Connect the Instagram token in Integrations, then sync. New posts stay private until you approve them.</p><button className="text-link" onClick={() => setTab("settings")}>Check integration setup →</button></div> : <div className="import-grid">{pendingImports.map((item) => <article key={item.id}><div className="import-image"><img src={item.imageUrl} alt="Instagram import preview" /><span>Pending review</span></div><div className="import-copy"><small>{shortDate(item.publishedAt)}</small><p>{item.caption || "No caption"}</p><div><button className="button button-dark" onClick={() => reviewImport(item.id, "create_draft")} disabled={busy}>Create product draft</button><button className="text-link" onClick={() => reviewImport(item.id, "ignore")} disabled={busy}>Ignore</button></div></div></article>)}</div>}</div>}

        {tab === "orders" && <div className="orders-admin">{orders.length === 0 ? <div className="admin-empty"><span>□</span><h2>No orders yet</h2><p>Paid orders will appear here with the customer, amount and fulfilment status.</p></div> : <div className="orders-table">
          <div className="orders-head"><span>Order</span><span>Customer</span><span>Amount</span><span>Payment</span><span>Alert</span><span>Fulfilment</span></div>
          {orders.map((order) => <article className="admin-order-card" key={order.id}>
            <div className="order-row">
              <div><strong>{order.orderNumber}</strong><small>{shortDate(order.createdAt)}</small></div>
              <div><strong>{order.customerName}</strong><small>{order.city}, {order.state} · {countryName(order.countryCode)}</small></div>
              <strong>{rupees(order.totalPaise / 100)}</strong>
              <span className={`status-pill ${order.paymentStatus}`}>{order.paymentStatus}</span>
              <div className="order-alert"><span className={`status-pill ${order.adminNotificationStatus}`}>{order.adminNotificationStatus.replace("_", " ")}</span>{order.paymentStatus === "captured" && order.adminNotificationStatus !== "sent" && <button onClick={() => resendOrderAlert(order.id)} disabled={busy}>Retry</button>}</div>
              {orderStatusOptions(order.status).length ? <select value={order.status} onChange={(event) => changeOrder(order.id, event.target.value)} disabled={order.paymentStatus !== "captured"}>{orderStatusOptions(order.status).map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select> : <span className={`status-pill ${order.status}`}>{order.status.replace("_", " ")}</span>}
            </div>
            <div className="order-tracking-editor">
              <label><span>Courier</span><input value={order.courierName} onChange={(event) => updateOrderDraft(order.id, { courierName: event.target.value })} placeholder="Delhivery, Blue Dart…" /></label>
              <label><span>Tracking number / AWB</span><input value={order.trackingNumber} onChange={(event) => updateOrderDraft(order.id, { trackingNumber: event.target.value })} placeholder="Shipment reference" /></label>
              <label className="wide"><span>Courier tracking link</span><input type="url" value={order.trackingUrl} onChange={(event) => updateOrderDraft(order.id, { trackingUrl: event.target.value })} placeholder="https://…" /></label>
              <button className="button button-outline" onClick={() => saveTracking(order)} disabled={busy || order.paymentStatus !== "captured"}>Save tracking</button>
              {order.razorpayOrderId && !["captured", "refunded"].includes(order.paymentStatus) && <button className="text-link" onClick={() => reconcileOrder(order.id)} disabled={busy}>Reconcile Razorpay</button>}
              {order.paymentStatus === "captured" && <button className="text-link" onClick={() => refundOrder(order.id)} disabled={busy}>{order.status === "refund_pending" ? "Retry refund" : "Refund & restock"}</button>}
              <a href={`/track-order?order=${encodeURIComponent(order.orderNumber)}`} target="_blank" rel="noreferrer">Preview customer view ↗</a>
            </div>
          </article>)}
        </div>}</div>}

        {tab === "settings" && <div className="settings-grid"><article><div className="setting-logo razor">R</div><div><h2>Razorpay</h2><p>UPI, cards and payment verification. Add test keys first, make a complete test order, then switch to live keys.</p><span>Needs secure keys</span></div></article><article><div className="setting-logo mail">@</div><div><h2>Order email alerts</h2><p>Sends the admin an immediate paid-order email and gives the customer a confirmation copy.</p><span className={notificationConfigured ? "connected" : ""}>{notificationConfigured ? "Connected" : "Needs email connection"}</span></div></article><article><div className="setting-logo insta">◎</div><div><h2>Instagram</h2><p>Imports recent media into a private review queue. Requires an Instagram professional account and a long-lived access token.</p><span>Needs Meta connection</span></div></article><article><div className="setting-logo whats">◔</div><div><h2>WhatsApp</h2><p>Customer messages open directly to the number printed on your current product label: +91 77159 10151.</p><span className="connected">Connected</span></div></article><article><div className="setting-logo ship">↗</div><div><h2>Shipping tracking</h2><p>Add the courier, AWB number and tracking link to each order. Customers can check progress without creating an account.</p><span className="connected">Ready</span></div></article><div className="security-note"><strong>Security by design</strong><p>The shop never receives card or UPI credentials. Prices are recalculated on the server, stock is reserved before payment, successful payments are signature-verified, admin routes require the private access key, and uploaded files are validated before storage.</p></div></div>}
      </section>
    </main>
  );
}
