"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AppUser } from "../../lib/auth";
import type { CatalogProduct } from "../../lib/catalog";
import { countryName } from "../../lib/locations";
import type { StorefrontSettings } from "../../lib/storefront-settings";
import { SHIPPING_ZONES, type PincodeRule, type ShippingRateCard, type ShippingZone } from "../../lib/shipping-types";

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
  legalHold: boolean;
};

type CouponItem = {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type CouponDraft = {
  id?: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minOrder: number;
  maxDiscount: number | "";
  startsAt: string;
  endsAt: string;
  usageLimit: number | "";
  active: boolean;
  usageCount: number;
};

type SystemEvent = {
  id: number;
  severity: "info" | "warning" | "error" | "security";
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  detail: string;
  createdAt: string;
};

type SimpleShippingRate = { customerPrice: number; deliveryDaysMin: number; deliveryDaysMax: number };
type SimpleShippingRates = Record<ShippingZone, SimpleShippingRate>;

type Tab = "overview" | "products" | "instagram" | "orders" | "coupons" | "shipping" | "settings";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2400;
const HANDLING_FEE_RUPEES = 50;
const SIMPLE_SHIPPING_WEIGHT_LIMIT_GRAMS = 5_000;

function zoneLabel(zone: ShippingZone) {
  return zone === "mumbai_local" ? "Mumbai" : zone === "maharashtra" ? "Maharashtra" : "Rest of India";
}

function simpleShippingRatesFromCards(cards: ShippingRateCard[]): SimpleShippingRates {
  return SHIPPING_ZONES.reduce((rates, zone) => {
    const card = cards.filter((item) => item.zone === zone && item.serviceable).sort((left, right) => right.weightLimitGrams - left.weightLimitGrams)[0];
    rates[zone] = {
      customerPrice: card ? (card.carrierChargePaise / 100) + HANDLING_FEE_RUPEES : HANDLING_FEE_RUPEES,
      deliveryDaysMin: card?.deliveryDaysMin ?? 3,
      deliveryDaysMax: card?.deliveryDaysMax ?? 7,
    };
    return rates;
  }, {} as SimpleShippingRates);
}

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

function dateForInput(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value.replace(" ", "T").replace(/Z$/, "")}Z`);
  if (Number.isNaN(date.valueOf())) return "";
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function dateForRequest(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

function emptyCouponDraft(): CouponDraft {
  return { code: "", type: "percentage", value: 10, minOrder: 0, maxDiscount: "", startsAt: "", endsAt: "", usageLimit: "", active: true, usageCount: 0 };
}

function couponToDraft(coupon: CouponItem): CouponDraft {
  return {
    id: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.type === "fixed" ? coupon.value / 100 : coupon.value,
    minOrder: coupon.minOrderPaise / 100,
    maxDiscount: coupon.maxDiscountPaise === null ? "" : coupon.maxDiscountPaise / 100,
    startsAt: dateForInput(coupon.startsAt),
    endsAt: dateForInput(coupon.endsAt),
    usageLimit: coupon.usageLimit ?? "",
    active: coupon.active,
    usageCount: coupon.usageCount,
  };
}

function couponAvailability(coupon: CouponItem) {
  const now = Date.now();
  const startsAt = coupon.startsAt ? new Date(`${coupon.startsAt.replace(" ", "T")}Z`).valueOf() : null;
  const endsAt = coupon.endsAt ? new Date(`${coupon.endsAt.replace(" ", "T")}Z`).valueOf() : null;
  if (!coupon.active) return { label: "Paused", tone: "paused" };
  if (startsAt && startsAt > now) return { label: "Scheduled", tone: "scheduled" };
  if (endsAt && endsAt < now) return { label: "Expired", tone: "expired" };
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) return { label: "Used up", tone: "used-up" };
  return { label: "Active", tone: "active" };
}

function couponOffer(coupon: CouponItem) {
  return coupon.type === "percentage" ? `${coupon.value}% off` : `${rupees(coupon.value / 100)} off`;
}

export default function AdminDashboard({
  user,
  initialProducts,
  initialImports,
  initialOrders,
  initialCoupons,
  signOutPath,
  notificationConfigured,
  initialStorefrontSettings,
  initialEvents,
  initialShippingConfiguration,
}: {
  user: AppUser;
  initialProducts: CatalogProduct[];
  initialImports: ImportItem[];
  initialOrders: OrderItem[];
  initialCoupons: CouponItem[];
  signOutPath: string;
  notificationConfigured: boolean;
  initialStorefrontSettings: StorefrontSettings;
  initialEvents: SystemEvent[];
  initialShippingConfiguration: { cards: ShippingRateCard[]; pincodeRules: PincodeRule[]; handlingPaise: number };
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [products, setProducts] = useState(initialProducts);
  const [imports, setImports] = useState(initialImports);
  const [orders, setOrders] = useState(initialOrders);
  const [coupons, setCoupons] = useState(initialCoupons);
  const [selectedId, setSelectedId] = useState(initialProducts[0]?.id ?? "");
  const [draft, setDraft] = useState<CatalogProduct | null>(initialProducts[0] ?? null);
  const [selectedCouponId, setSelectedCouponId] = useState(initialCoupons[0]?.id ?? "");
  const [couponDraft, setCouponDraft] = useState<CouponDraft>(() => initialCoupons[0] ? couponToDraft(initialCoupons[0]) : emptyCouponDraft());
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [storefrontSettings, setStorefrontSettings] = useState(initialStorefrontSettings);
  const [shippingCards, setShippingCards] = useState(initialShippingConfiguration.cards);
  const [pinRules, setPinRules] = useState(initialShippingConfiguration.pincodeRules);
  const [simpleShippingRates, setSimpleShippingRates] = useState<SimpleShippingRates>(() => simpleShippingRatesFromCards(initialShippingConfiguration.cards));
  const [shippingPreview, setShippingPreview] = useState<{ zone: ShippingZone; weightGrams: number }>({ zone: "maharashtra", weightGrams: 500 });
  const pendingImports = imports.filter((item) => item.status === "pending");
  const totalStock = products.reduce((sum, product) => sum + product.variants.reduce((variantSum, variant) => variantSum + variant.stock, 0), 0);
  const productsMissingShippingWeight = products.filter((product) => product.status === "active" && product.packedWeightGrams <= 0).length;
  const paidOrders = orders.filter((order) => order.paymentStatus === "captured");
  const revenue = paidOrders.reduce((sum, order) => sum + order.totalPaise / 100, 0);
  const selected = useMemo(() => products.find((product) => product.id === selectedId) ?? null, [products, selectedId]);
  const selectedCoupon = useMemo(() => coupons.find((coupon) => coupon.id === selectedCouponId) ?? null, [coupons, selectedCouponId]);
  const selectedCouponStatus = selectedCoupon ? couponAvailability(selectedCoupon) : null;
  const activeProducts = products.filter((product) => product.status === "active");
  const selectedHomepageProduct = activeProducts.find((product) => product.id === storefrontSettings.featuredProductId) ?? null;
  const homepageImages = selectedHomepageProduct?.images ?? [];

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

  function selectCoupon(id: string) {
    const coupon = coupons.find((item) => item.id === id);
    if (!coupon) return;
    setSelectedCouponId(id);
    setCouponDraft(couponToDraft(coupon));
    setNotice("");
  }

  function addCoupon() {
    setSelectedCouponId("");
    setCouponDraft(emptyCouponDraft());
    setNotice("");
  }

  async function saveCoupon() {
    setBusy(true);
    setNotice("");
    const payload = {
      code: couponDraft.code,
      type: couponDraft.type,
      value: couponDraft.value,
      minOrder: couponDraft.minOrder,
      maxDiscount: couponDraft.type === "percentage" && couponDraft.maxDiscount !== "" ? couponDraft.maxDiscount : null,
      startsAt: dateForRequest(couponDraft.startsAt),
      endsAt: dateForRequest(couponDraft.endsAt),
      usageLimit: couponDraft.usageLimit === "" ? null : couponDraft.usageLimit,
      active: couponDraft.active,
    };
    const response = await fetch("/api/admin/coupons", {
      method: couponDraft.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(couponDraft.id ? { ...payload, id: couponDraft.id } : payload),
    });
    let result: { error?: string; coupon?: CouponItem } = {};
    try {
      result = await response.json() as { error?: string; coupon?: CouponItem };
    } catch {
      // The common failure mode here is an expired admin session, for which the status still gives useful feedback.
    }
    if (!response.ok || !result.coupon) {
      setNotice(result.error || "Could not save this coupon.");
    } else {
      const saved = result.coupon;
      setCoupons((current) => couponDraft.id ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setSelectedCouponId(saved.id);
      setCouponDraft(couponToDraft(saved));
      setNotice(couponDraft.id ? "Coupon updated." : "Coupon created and ready to use.");
    }
    setBusy(false);
  }

  async function deleteCoupon() {
    if (!couponDraft.id || !window.confirm(`Delete coupon ${couponDraft.code || "this coupon"}? This cannot be undone.`)) return;
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/admin/coupons", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: couponDraft.id }),
    });
    let result: { error?: string } = {};
    try {
      result = await response.json() as { error?: string };
    } catch {
      // A non-JSON response is surfaced through the generic notice below.
    }
    if (!response.ok) {
      setNotice(result.error || "Could not delete this coupon.");
    } else {
      const remaining = coupons.filter((item) => item.id !== couponDraft.id);
      setCoupons(remaining);
      const next = remaining[0];
      setSelectedCouponId(next?.id ?? "");
      setCouponDraft(next ? couponToDraft(next) : emptyCouponDraft());
      setNotice("Coupon deleted.");
    }
    setBusy(false);
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

  async function changeLegalHold(order: OrderItem, legalHold: boolean) {
    setBusy(true); setNotice("");
    const response = await fetch("/api/admin/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...order, legalHold }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setNotice(result.error || "Could not update the legal-hold setting.");
    else { setOrders((current) => current.map((item) => item.id === order.id ? { ...item, legalHold } : item)); setNotice(legalHold ? "Legal hold enabled. Retention cleanup will skip this order." : "Legal hold removed."); }
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

  async function saveStorefront() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/admin/storefront", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(storefrontSettings) });
      const result = await response.json() as { error?: string; settings?: StorefrontSettings };
      if (!response.ok) setNotice(result.error || "Could not save homepage content.");
      else { if (result.settings) setStorefrontSettings(result.settings); setNotice("Homepage content is live. Open the store to review it."); }
    } catch {
      setNotice("Could not save homepage content. Please try again.");
    }
    setBusy(false);
  }

  function selectHomepageProduct(id: string) {
    const product = activeProducts.find((item) => item.id === id);
    const images = product?.images ?? [];
    setStorefrontSettings((current) => ({
      ...current,
      featuredProductId: id,
      featuredHeroImageUrl: images[1] ?? images[0] ?? "",
      detailPrimaryImageUrl: images[2] ?? images[0] ?? "",
      detailSecondaryImageUrl: images[4] ?? images[1] ?? images[0] ?? "",
    }));
  }

  function updateSimpleShippingRate(zone: ShippingZone, patch: Partial<SimpleShippingRate>) {
    setSimpleShippingRates((current) => ({ ...current, [zone]: { ...current[zone], ...patch } }));
  }

  function simpleShippingCards() {
    return SHIPPING_ZONES.map((zone, index) => {
      const existing = shippingCards.filter((card) => card.zone === zone).sort((left, right) => right.weightLimitGrams - left.weightLimitGrams)[0];
      const rate = simpleShippingRates[zone];
      return {
        id: existing?.id ?? -(Date.now() + index),
        zone,
        weightLimitGrams: SIMPLE_SHIPPING_WEIGHT_LIMIT_GRAMS,
        carrierChargePaise: Math.max(0, Math.round((Number(rate.customerPrice) - HANDLING_FEE_RUPEES) * 100)),
        deliveryDaysMin: Number(rate.deliveryDaysMin),
        deliveryDaysMax: Number(rate.deliveryDaysMax),
        serviceable: true,
        lastReviewedAt: null,
      };
    });
  }

  async function saveShipping(cardsToSave = shippingCards) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/admin/shipping", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cards: cardsToSave, pincodeRules: pinRules }) });
      const result = await response.json() as { error?: string; cards?: ShippingRateCard[]; pincodeRules?: PincodeRule[] };
      if (!response.ok) setNotice(result.error || "Could not publish shipping rates.");
      else { setShippingCards(result.cards ?? cardsToSave); setPinRules(result.pincodeRules ?? pinRules); setSimpleShippingRates(simpleShippingRatesFromCards(result.cards ?? cardsToSave)); setNotice("Shipping prices are live. Customers see the exact amount you entered, including packing."); }
    } catch { setNotice("Could not publish shipping rates. Please try again."); }
    setBusy(false);
  }

  async function publishSimpleShipping() {
    for (const zone of SHIPPING_ZONES) {
      const rate = simpleShippingRates[zone];
      if (!Number.isFinite(rate.customerPrice) || rate.customerPrice < HANDLING_FEE_RUPEES || rate.customerPrice > 10_000) {
        setNotice(`Enter a final delivery price between ₹${HANDLING_FEE_RUPEES} and ₹10,000 for ${zoneLabel(zone)}.`);
        return;
      }
      if (!Number.isInteger(rate.deliveryDaysMin) || !Number.isInteger(rate.deliveryDaysMax) || rate.deliveryDaysMin < 1 || rate.deliveryDaysMax < rate.deliveryDaysMin || rate.deliveryDaysMax > 45) {
        setNotice(`Check the delivery-day range for ${zoneLabel(zone)}.`);
        return;
      }
    }
    const cards = simpleShippingCards();
    setShippingCards(cards);
    await saveShipping(cards);
  }

  const previewCard = shippingCards.filter((card) => card.zone === shippingPreview.zone && card.serviceable && card.weightLimitGrams >= shippingPreview.weightGrams).sort((left, right) => left.weightLimitGrams - right.weightLimitGrams)[0];

  const nav: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "products", label: "Products", count: products.length },
    { id: "instagram", label: "Instagram queue", count: pendingImports.length },
    { id: "orders", label: "Orders", count: orders.length },
    { id: "coupons", label: "Coupons", count: coupons.length },
    { id: "shipping", label: "Shipping" },
    { id: "settings", label: "Site controls" },
  ];

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/"><span>Classy Apparels</span></Link>
        <nav>{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}</button>)}</nav>
        <div className="admin-user"><span>{(user.name || user.email).slice(0, 1).toUpperCase()}</span><div><strong>{user.name || user.email}</strong><small>{user.email}</small></div><a href={signOutPath}>Sign out</a></div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div><p className="kicker">Sana’s private workspace</p><h1>{nav.find((item) => item.id === tab)?.label}</h1></div><div><Link className="admin-view-store" href="/" target="_blank">View store ↗</Link>{tab === "products" && <button className="button button-dark" onClick={addProduct} disabled={busy}>+ New product</button>}{tab === "coupons" && <button className="button button-dark" onClick={addCoupon} disabled={busy}>+ New coupon</button>}</div></header>
        {notice && <div className="admin-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

        {tab === "overview" && <div className="admin-overview">
          <div className="metric-grid"><article><span>Products</span><strong>{products.length}</strong><small>{products.filter((item) => item.status === "active").length} live</small></article><article><span>Units in stock</span><strong>{totalStock}</strong><small>Across every size</small></article><article><span>Shipping setup</span><strong>{productsMissingShippingWeight}</strong><small>{productsMissingShippingWeight ? "live product(s) need packed weight" : "Every live product is weighted"}</small></article><article><span>Captured revenue</span><strong>{rupees(revenue)}</strong><small>{paidOrders.length} paid orders</small></article></div>
          <div className="admin-two-col"><article className="admin-card"><div className="admin-card-heading"><div><p className="kicker">Inventory</p><h2>What needs attention</h2></div><button onClick={() => setTab("products")}>Manage →</button></div>{products.map((product) => { const stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0); return <div className="attention-row" key={product.id}><img src={product.images[0]} alt="" /><div><strong>{product.name}</strong><span>{product.status} · {stock} units</span></div><span className={stock < 5 ? "low" : "good"}>{stock < 5 ? "Low stock" : "Healthy"}</span></div>; })}</article>
          <article className="admin-card"><div className="admin-card-heading"><div><p className="kicker">Workflow</p><h2>Instagram → Store</h2></div></div><div className="workflow-steps"><div className="done"><span>1</span><div><strong>Post on Instagram</strong><small>Keep creating as usual</small></div></div><div><span>2</span><div><strong>Sync to review queue</strong><small>Photos and captions arrive as pending</small></div></div><div><span>3</span><div><strong>Add selling details</strong><small>Set price, sizes and stock, then publish</small></div></div></div><button className="button button-outline" onClick={() => setTab("instagram")}>Open Instagram queue</button></article></div>
          <article className="admin-card admin-activity"><div className="admin-card-heading"><div><p className="kicker">Operational activity</p><h2>Recent important events</h2></div><small>Only security and actionable system events are retained.</small></div>{initialEvents.length ? <div className="activity-list">{initialEvents.map((event) => <div key={event.id}><span className={`event-severity ${event.severity}`}>{event.severity}</span><strong>{event.eventType.replace(/[._]/g, " ")}</strong><small>{event.detail || "—"} · {shortDate(event.createdAt)}</small></div>)}</div> : <p className="admin-activity-empty">No important events yet. Successful routine page views are deliberately not logged.</p>}</article>
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
            <div className="editor-fields"><label className="wide"><span>Product name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>Selling price (₹)</span><input type="number" min="0" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label><label><span>Compare-at price (₹)</span><input type="number" min="0" value={draft.compareAt} onChange={(event) => setDraft({ ...draft, compareAt: Number(event.target.value) })} /></label><label><span>Packed shipping weight (g)</span><input type="number" min="1" max="50000" value={draft.packedWeightGrams || ""} onChange={(event) => setDraft({ ...draft, packedWeightGrams: Number(event.target.value) })} /><small>Garment plus packaging. Required to publish.</small></label><label><span>Colour</span><input value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label><label><span>Fabric</span><input value={draft.fabric} onChange={(event) => setDraft({ ...draft, fabric: event.target.value })} /></label><label className="wide"><span>What is included</span><input value={draft.includes} onChange={(event) => setDraft({ ...draft, includes: event.target.value })} /></label><label className="wide"><span>Description</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={5} /></label></div>
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
              <label className="feature-toggle"><input type="checkbox" checked={order.legalHold} onChange={(event) => changeLegalHold(order, event.target.checked)} disabled={busy} /><span>Legal hold</span></label>
              <button className="button button-outline" onClick={() => saveTracking(order)} disabled={busy || order.paymentStatus !== "captured"}>Save tracking</button>
              {order.razorpayOrderId && !["captured", "refunded"].includes(order.paymentStatus) && <button className="text-link" onClick={() => reconcileOrder(order.id)} disabled={busy}>Reconcile Razorpay</button>}
              {order.paymentStatus === "captured" && <button className="text-link" onClick={() => refundOrder(order.id)} disabled={busy}>{order.status === "refund_pending" ? "Retry refund" : "Refund & restock"}</button>}
              <a href={`/track-order?order=${encodeURIComponent(order.orderNumber)}`} target="_blank" rel="noreferrer">Preview customer view ↗</a>
            </div>
          </article>)}
        </div>}</div>}

        {tab === "coupons" && <div className="coupon-admin-layout">
          <div className="coupon-list">
            <div className="coupon-list-heading"><span>Discount codes</span><small>{coupons.length}</small></div>
            {coupons.length === 0 ? <div className="coupon-list-empty"><strong>No coupons yet</strong><span>Create a code to offer a discount at checkout.</span></div> : coupons.map((coupon) => {
              const availability = couponAvailability(coupon);
              return <button key={coupon.id} className={selectedCouponId === coupon.id ? "active" : ""} onClick={() => selectCoupon(coupon.id)}>
                <div><strong>{coupon.code}</strong><span>{couponOffer(coupon)}{coupon.minOrderPaise ? ` · min. ${rupees(coupon.minOrderPaise / 100)}` : ""}</span></div>
                <small className={`status-pill ${availability.tone}`}>{availability.label}</small>
              </button>;
            })}
          </div>

          <form className="coupon-editor" onSubmit={(event) => { event.preventDefault(); void saveCoupon(); }}>
            <div className="editor-heading"><div><p className="kicker">{couponDraft.id ? "Discount code" : "New discount code"}</p><h2>{couponDraft.id ? couponDraft.code || "Untitled coupon" : "Create a coupon"}</h2></div>{selectedCouponStatus && <span className={`status-pill ${selectedCouponStatus.tone}`}>{selectedCouponStatus.label}</span>}</div>
            <p className="coupon-editor-intro">Customers can enter this code during checkout. Pausing a code leaves its past order history intact.</p>

            <div className="coupon-fields">
              <label className="wide"><span>Coupon code</span><input value={couponDraft.code} onChange={(event) => setCouponDraft({ ...couponDraft, code: event.target.value.toUpperCase() })} placeholder="SANA10" maxLength={64} autoCapitalize="characters" /></label>
              <label><span>Discount type</span><select value={couponDraft.type} onChange={(event) => setCouponDraft({ ...couponDraft, type: event.target.value as CouponDraft["type"], maxDiscount: event.target.value === "fixed" ? "" : couponDraft.maxDiscount })}><option value="percentage">Percentage off</option><option value="fixed">Fixed amount off</option></select></label>
              <label><span>{couponDraft.type === "percentage" ? "Discount (%)" : "Discount (₹)"}</span><input type="number" min="1" max={couponDraft.type === "percentage" ? 100 : 100000} step="1" value={couponDraft.value} onChange={(event) => setCouponDraft({ ...couponDraft, value: Number(event.target.value) })} /></label>
              <label><span>Minimum order (₹)</span><input type="number" min="0" max="100000" step="1" value={couponDraft.minOrder} onChange={(event) => setCouponDraft({ ...couponDraft, minOrder: Number(event.target.value) })} /></label>
              {couponDraft.type === "percentage" && <label><span>Max discount (₹, optional)</span><input type="number" min="1" max="100000" step="1" value={couponDraft.maxDiscount} onChange={(event) => setCouponDraft({ ...couponDraft, maxDiscount: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="No cap" /></label>}
              <label><span>Starts at (optional)</span><input type="datetime-local" value={couponDraft.startsAt} onChange={(event) => setCouponDraft({ ...couponDraft, startsAt: event.target.value })} /></label>
              <label><span>Ends at (optional)</span><input type="datetime-local" value={couponDraft.endsAt} onChange={(event) => setCouponDraft({ ...couponDraft, endsAt: event.target.value })} /></label>
              <label><span>Usage limit (optional)</span><input type="number" min="1" max="1000000" step="1" value={couponDraft.usageLimit} onChange={(event) => setCouponDraft({ ...couponDraft, usageLimit: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="Unlimited" /></label>
            </div>

            <div className="coupon-editor-footer">
              <div><label className="feature-toggle"><input type="checkbox" checked={couponDraft.active} onChange={(event) => setCouponDraft({ ...couponDraft, active: event.target.checked })} /><span>Coupon is active</span></label>{couponDraft.id && <small>{couponDraft.usageCount} use{couponDraft.usageCount === 1 ? "" : "s"}{couponDraft.usageLimit !== "" ? ` of ${couponDraft.usageLimit}` : ""}</small>}</div>
              {couponDraft.id && <button type="button" className="coupon-delete" onClick={deleteCoupon} disabled={busy || couponDraft.usageCount > 0} title={couponDraft.usageCount > 0 ? "Used coupons can be deactivated but not deleted." : undefined}>Delete</button>}
              <button type="submit" className="button button-dark" disabled={busy}>{busy ? "Saving…" : couponDraft.id ? "Save coupon" : "Create coupon"}</button>
            </div>
          </form>
        </div>}

        {/* The site-controls panel below includes these integration cards. */}
        {/*
        {tab === "settings" && <div className="settings-grid"><article><div className="setting-logo razor">R</div><div><h2>Razorpay</h2><p>UPI, cards and payment verification. Add test keys first, make a complete test order, then switch to live keys.</p><span>Needs secure keys</span></div></article><article><div className="setting-logo mail">@</div><div><h2>Order email alerts</h2><p>Sends the admin an immediate paid-order email and gives the customer a confirmation copy.</p><span className={notificationConfigured ? "connected" : ""}>{notificationConfigured ? "Connected" : "Needs email connection"}</span></div></article><article><div className="setting-logo insta">◎</div><div><h2>Instagram</h2><p>Imports recent media into a private review queue. Requires an Instagram professional account and a long-lived access token.</p><span>Needs Meta connection</span></div></article><article><div className="setting-logo whats">◔</div><div><h2>WhatsApp</h2><p>Customer messages open directly to the number printed on your current product label: +91 77159 10151.</p><span className="connected">Connected</span></div></article><article><div className="setting-logo ship">↗</div><div><h2>Shipping tracking</h2><p>Add the courier, AWB number and tracking link to each order. Customers can check progress without creating an account.</p><span className="connected">Ready</span></div></article><div className="security-note"><strong>Security by design</strong><p>The shop never receives card or UPI credentials. Prices are recalculated on the server, stock is reserved before payment, successful payments are signature-verified, admin routes require the private access key, and uploaded files are validated before storage.</p></div></div>}
        */}
        {tab === "shipping" && <div className="shipping-admin">
          <section className="storefront-editor shipping-simple-editor">
            <div><p className="kicker">Simple delivery setup</p><h2>Set three customer prices.</h2><p>Enter the final amount a customer should pay for delivery. Packing is already included, so there is no carrier maths. These prices cover parcels up to 5 kg; heavier orders are safely sent for a WhatsApp quote.</p></div>
            <div className="simple-shipping-grid">{SHIPPING_ZONES.map((zone) => {
              const rate = simpleShippingRates[zone];
              return <article key={zone}><strong>{zoneLabel(zone)}</strong><small>Customer delivery price</small><label><span>₹</span><input type="number" min={HANDLING_FEE_RUPEES} max="10000" step="1" value={rate.customerPrice} onChange={(event) => updateSimpleShippingRate(zone, { customerPrice: Number(event.target.value) })} /></label><div className="simple-delivery-days"><span>Delivery estimate</span><input type="number" min="1" max="30" value={rate.deliveryDaysMin} onChange={(event) => updateSimpleShippingRate(zone, { deliveryDaysMin: Number(event.target.value) })} /><i>to</i><input type="number" min="1" max="45" value={rate.deliveryDaysMax} onChange={(event) => updateSimpleShippingRate(zone, { deliveryDaysMax: Number(event.target.value) })} /><b>days</b></div></article>;
            })}</div>
            <p className="shipping-simple-note">Publishing this replaces the existing weight bands with these three prices. PIN-code exceptions are kept exactly as they are. Most shops only need this section.</p>
            <button className="button button-dark" onClick={publishSimpleShipping} disabled={busy}>{busy ? "Publishing…" : "Publish simple delivery prices"}</button>
          </section>

          <details className="shipping-advanced"><summary>Advanced: use different prices by weight or make a PIN-code exception</summary><div className="shipping-advanced-content">
            <section className="shipping-advanced-section"><div><h2>Weight-based prices</h2><p>Only use this when your courier quote changes by parcel weight. The customer price below excludes the fixed ₹50 packing fee.</p></div><div className="shipping-preview"><label><span>Preview zone</span><select value={shippingPreview.zone} onChange={(event) => setShippingPreview({ ...shippingPreview, zone: event.target.value as ShippingZone })}>{SHIPPING_ZONES.map((zone) => <option key={zone} value={zone}>{zoneLabel(zone)}</option>)}</select></label><label><span>Packed cart weight (g)</span><input type="number" min="1" max="50000" value={shippingPreview.weightGrams} onChange={(event) => setShippingPreview({ ...shippingPreview, weightGrams: Math.max(1, Number(event.target.value) || 1) })} /></label><p>{previewCard ? <>Customer delivery price: <strong>{rupees((previewCard.carrierChargePaise + 5000) / 100)}</strong> ({rupees(previewCard.carrierChargePaise / 100)} courier + ₹50 packing)</> : "No matching band — the customer will be offered a WhatsApp quote."}</p></div><div className="shipping-card-list">{shippingCards.map((card, index) => <div className="shipping-rate-row" key={`${card.id}-${index}`}><select value={card.zone} onChange={(event) => setShippingCards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, zone: event.target.value as ShippingZone } : item))}>{SHIPPING_ZONES.map((zone) => <option key={zone} value={zone}>{zoneLabel(zone)}</option>)}</select><label><span>Up to (g)</span><input type="number" min="1" value={card.weightLimitGrams} onChange={(event) => setShippingCards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, weightLimitGrams: Number(event.target.value) } : item))} /></label><label><span>Courier price (₹)</span><input type="number" min="0" step="1" value={card.carrierChargePaise / 100} onChange={(event) => setShippingCards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, carrierChargePaise: Math.round(Number(event.target.value) * 100) } : item))} /></label><label><span>From days</span><input type="number" min="1" value={card.deliveryDaysMin} onChange={(event) => setShippingCards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, deliveryDaysMin: Number(event.target.value) } : item))} /></label><label><span>To days</span><input type="number" min="1" value={card.deliveryDaysMax} onChange={(event) => setShippingCards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, deliveryDaysMax: Number(event.target.value) } : item))} /></label><label><span>Reviewed</span><input type="date" value={card.lastReviewedAt?.slice(0, 10) ?? ""} onChange={(event) => setShippingCards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, lastReviewedAt: event.target.value || null } : item))} /></label><label className="feature-toggle"><input type="checkbox" checked={card.serviceable} onChange={(event) => setShippingCards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, serviceable: event.target.checked } : item))} /><span>Available</span></label><button type="button" className="text-link" onClick={() => setShippingCards((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}</div><button type="button" className="button button-outline" onClick={() => setShippingCards((current) => [...current, { id: -Date.now(), zone: "maharashtra", weightLimitGrams: 500, carrierChargePaise: 0, deliveryDaysMin: 3, deliveryDaysMax: 6, serviceable: true, lastReviewedAt: null }])}>Add weight band</button></section>
            <section className="shipping-advanced-section"><div><h2>PIN-code exceptions</h2><p>Use this only for a remote area, a local Mumbai price, a manual quote or a location you cannot serve. Leave the courier price blank to use the normal zone price.</p></div><div className="pin-rule-list">{pinRules.map((rule, index) => <div className="pin-rule-row" key={`${rule.id}-${index}`}><input inputMode="numeric" maxLength={6} value={rule.pincode} placeholder="6-digit PIN" onChange={(event) => setPinRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, pincode: event.target.value.replace(/\D/g, "").slice(0, 6) } : item))} /><select value={rule.zone ?? ""} onChange={(event) => setPinRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, zone: (event.target.value || null) as ShippingZone | null } : item))}><option value="">Use normal zone</option>{SHIPPING_ZONES.map((zone) => <option key={zone} value={zone}>{zoneLabel(zone)}</option>)}</select><label><span>Courier price (₹)</span><input type="number" min="0" value={rule.carrierChargePaise === null ? "" : rule.carrierChargePaise / 100} onChange={(event) => setPinRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, carrierChargePaise: event.target.value === "" ? null : Math.round(Number(event.target.value) * 100) } : item))} /></label><label className="feature-toggle"><input type="checkbox" checked={rule.serviceable} onChange={(event) => setPinRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, serviceable: event.target.checked } : item))} /><span>Can deliver</span></label><label className="feature-toggle"><input type="checkbox" checked={rule.manualQuoteRequired} onChange={(event) => setPinRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, manualQuoteRequired: event.target.checked } : item))} /><span>Ask on WhatsApp</span></label><input value={rule.note} placeholder="Message shown to customer" onChange={(event) => setPinRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value } : item))} /><button type="button" className="text-link" onClick={() => setPinRules((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}</div><button type="button" className="button button-outline" onClick={() => setPinRules((current) => [...current, { id: -Date.now(), pincode: "", zone: null, serviceable: true, manualQuoteRequired: false, carrierChargePaise: null, deliveryDaysMin: null, deliveryDaysMax: null, note: "" }])}>Add PIN exception</button></section>
            <button className="button button-dark" onClick={() => saveShipping()} disabled={busy || !shippingCards.length}>{busy ? "Publishing…" : "Publish advanced delivery setup"}</button>
          </div></details>
        </div>}

        {tab === "settings" && <div className="settings-grid">
          <section className="storefront-editor">
            <div><p className="kicker">Homepage editor</p><h2>Control the first impression.</h2><p>Choose the product and exact product photos for the home page, then change every headline and paragraph around them. Product name, price and stock remain managed in Products so customers always see correct selling details.</p></div>
            <section className="homepage-product-editor"><div><p className="kicker">Just-arrived product</p><h3>Choose what the home page features.</h3><p>Select a live product, then pick its gallery photos for the hero and “Thoughtful details” section.</p></div><label><span>Featured product</span><select value={storefrontSettings.featuredProductId} onChange={(event) => selectHomepageProduct(event.target.value)}><option value="">Use the product marked “Feature on home page”</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {rupees(product.price)}</option>)}</select></label><label><span>Small label above the product</span><input value={storefrontSettings.featuredKicker} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, featuredKicker: event.target.value })} placeholder="Just arrived" /></label>{selectedHomepageProduct ? <div className="homepage-image-picker"><strong>{selectedHomepageProduct.name} photos</strong><div><label><span>Hero photo</span><select value={storefrontSettings.featuredHeroImageUrl} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, featuredHeroImageUrl: event.target.value })}>{homepageImages.map((image, index) => <option key={image} value={image}>Photo {index + 1}</option>)}</select></label><label><span>Detail photo one</span><select value={storefrontSettings.detailPrimaryImageUrl} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, detailPrimaryImageUrl: event.target.value })}>{homepageImages.map((image, index) => <option key={image} value={image}>Photo {index + 1}</option>)}</select></label><label><span>Detail photo two</span><select value={storefrontSettings.detailSecondaryImageUrl} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, detailSecondaryImageUrl: event.target.value })}>{homepageImages.map((image, index) => <option key={image} value={image}>Photo {index + 1}</option>)}</select></label></div><small>Need another picture? Add it to this product’s gallery under Products, then return here.</small></div> : <p className="homepage-product-hint">Choose a product above to unlock its photo choices.</p>}</section>
            <div className="storefront-fields"><label className="wide"><span>Promotion text</span><input value={storefrontSettings.promotionText} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, promotionText: event.target.value })} /></label><label><span>Promotion CTA</span><input value={storefrontSettings.promotionCtaLabel} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, promotionCtaLabel: event.target.value })} /></label><label><span>Promotion destination</span><input value={storefrontSettings.promotionCtaHref} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, promotionCtaHref: event.target.value })} placeholder="/shop" /></label><label><span>Hero kicker</span><input value={storefrontSettings.heroKicker} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, heroKicker: event.target.value })} /></label><label><span>Hero heading</span><input value={storefrontSettings.heroHeading} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, heroHeading: event.target.value })} /></label><label><span>Hero emphasis</span><input value={storefrontSettings.heroAccent} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, heroAccent: event.target.value })} /></label><label className="wide"><span>Hero description</span><textarea rows={3} value={storefrontSettings.heroBody} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, heroBody: event.target.value })} /></label><label><span>Collection kicker</span><input value={storefrontSettings.collectionKicker} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, collectionKicker: event.target.value })} /></label><label className="wide"><span>Collection heading</span><input value={storefrontSettings.collectionHeading} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, collectionHeading: event.target.value })} /></label><label className="wide"><span>Collection description</span><textarea rows={3} value={storefrontSettings.collectionBody} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, collectionBody: event.target.value })} /></label><label><span>Detail-section kicker</span><input value={storefrontSettings.detailKicker} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, detailKicker: event.target.value })} /></label><label className="wide"><span>Detail-section heading</span><input value={storefrontSettings.detailHeading} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, detailHeading: event.target.value })} /></label><label className="wide"><span>Detail-section description</span><textarea rows={3} value={storefrontSettings.detailBody} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, detailBody: event.target.value })} placeholder="Leave blank to use the selected product description" /></label><label><span>Story heading</span><input value={storefrontSettings.storyHeading} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, storyHeading: event.target.value })} /></label><label className="wide"><span>Story</span><textarea rows={4} value={storefrontSettings.storyBody} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, storyBody: event.target.value })} /></label><label><span>Newsletter heading</span><input value={storefrontSettings.newsletterHeading} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, newsletterHeading: event.target.value })} /></label><label className="wide"><span>Newsletter description</span><textarea rows={3} value={storefrontSettings.newsletterBody} onChange={(event) => setStorefrontSettings({ ...storefrontSettings, newsletterBody: event.target.value })} /></label></div><button className="button button-dark" onClick={saveStorefront} disabled={busy}>{busy ? "Saving…" : "Publish homepage content"}</button></section><article><div className="setting-logo razor">R</div><div><h2>Razorpay</h2><p>UPI, cards and payment verification. Add test keys first, make a complete test order, then switch to live keys.</p><span>Needs secure keys</span></div></article><article><div className="setting-logo mail">@</div><div><h2>Order email alerts</h2><p>Sends the admin an immediate paid-order email and gives the customer a confirmation copy.</p><span className={notificationConfigured ? "connected" : ""}>{notificationConfigured ? "Connected" : "Needs email connection"}</span></div></article><article><div className="setting-logo insta">◎</div><div><h2>Instagram</h2><p>Imports recent media into a private review queue. Requires an Instagram professional account and a long-lived access token.</p><span>Needs Meta connection</span></div></article><article><div className="setting-logo whats">◔</div><div><h2>WhatsApp</h2><p>Customer messages open directly to the number printed on your current product label: +91 77159 10151.</p><span className="connected">Connected</span></div></article><article><div className="setting-logo ship">↗</div><div><h2>Shipping tracking</h2><p>Add the courier, AWB number and tracking link to each order. Customers can check progress without creating an account.</p><span className="connected">Ready</span></div></article><div className="security-note"><strong>Security by design</strong><p>The shop never receives card or UPI credentials. Prices are recalculated on the server, stock is reserved before payment, successful payments are signature-verified, admin routes require the private access key, and uploaded files are validated before storage.</p></div></div>}
      </section>
    </main>
  );
}
