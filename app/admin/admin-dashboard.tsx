"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useOverlayDialog } from "../components/use-overlay-dialog";
import type { AppUser } from "../../lib/auth";
import type { CatalogProduct } from "../../lib/catalog";
import type { ManagedCategory } from "../../lib/categories";
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
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  countryCode: string;
  postalCode: string;
  totalPaise: number;
  createdAt: string;
  adminNotificationStatus: string;
  courierName: string;
  trackingNumber: string;
  trackingUrl: string;
  legalHold: boolean;
  items: Array<{ productName: string; size: string; quantity: number }>;
};

type OrderFilter = "to_pack" | "processing" | "shipped" | "delivered" | "all_active" | "payment_review";

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

type ActivityCategory = "all" | "payments" | "orders" | "shipping" | "storefront" | "security" | "system";

type SimpleShippingRate = { customerPrice: number; deliveryDaysMin: number; deliveryDaysMax: number };
type SimpleShippingRates = Record<ShippingZone, SimpleShippingRate>;

type Tab = "overview" | "products" | "categories" | "instagram" | "orders" | "activity" | "coupons" | "shipping" | "settings";
type ProductField = "name" | "price" | "compareAt" | "categoryId" | "packedWeightGrams" | "images" | "hasSizes";
type ProductFieldErrors = Partial<Record<ProductField, string>>;

// Keep a buffer below the route/hosting limit because multipart form data adds
// a small amount of overhead around the image bytes.
const TARGET_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2000;
const MIN_IMAGE_EDGE = 1200;
const HANDLING_FEE_RUPEES = 50;
const SIMPLE_SHIPPING_WEIGHT_LIMIT_GRAMS = 5_000;
const LOW_STOCK_THRESHOLD = 5;

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
  if (file.type === "image/webp" && file.size <= TARGET_UPLOAD_BYTES) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`${file.name} could not be opened. Please use a JPG, PNG or WebP image.`));
      element.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error(`Could not prepare ${file.name}.`);

    const encode = (quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    const qualities = [0.82, 0.72, 0.62, 0.52, 0.42, 0.34, 0.28, 0.22];
    let edge = MAX_IMAGE_EDGE;
    let lastSize = file.size;
    for (const quality of qualities) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await encode(quality);
      if (blob) {
        lastSize = blob.size;
        if (blob.size <= TARGET_UPLOAD_BYTES) {
          const baseName = file.name.replace(/\.[^.]+$/, "") || "product-photo";
          return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: file.lastModified });
        }
      }
      edge = Math.max(MIN_IMAGE_EDGE, Math.round(edge * 0.8));
    }
    const sizeMb = (lastSize / (1024 * 1024)).toFixed(1);
    throw new Error(`${file.name} could not be compressed below 3.5 MB (last attempt: ${sizeMb} MB). Try a smaller photo.`);
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

function isFulfillableOrder(order: Pick<OrderItem, "paymentStatus" | "status">) {
  return order.paymentStatus === "captured" && ["paid", "processing", "shipped", "delivered"].includes(order.status);
}

function deliveryAddress(order: OrderItem) {
  return [order.addressLine1, order.addressLine2, order.city, order.state, order.postalCode, countryName(order.countryCode)].filter(Boolean).join(", ");
}

function customerWhatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${phone.startsWith("+") || digits.length !== 10 ? digits : `91${digits}`}`;
}

function activityCategory(event: SystemEvent): Exclude<ActivityCategory, "all"> {
  if (event.severity === "security" || event.eventType.includes("security") || event.eventType.includes("signature")) return "security";
  if (event.eventType.includes("payment") || event.eventType.includes("refund") || event.eventType.includes("checkout")) return "payments";
  if (event.eventType.includes("shipping") || event.eventType.includes("courier")) return "shipping";
  if (event.eventType.includes("storefront") || event.eventType.includes("product") || event.eventType.includes("instagram")) return "storefront";
  if (event.eventType.includes("order")) return "orders";
  return "system";
}

function activityLabel(eventType: string) {
  const labels: Record<string, string> = {
    "admin.storefront_content_updated": "Homepage content published",
    "admin.shipping_rates_published": "Shipping prices published",
    "admin.shipping_rates_publish_failed": "Shipping price update failed",
    "admin.order_legal_hold_enabled": "Order legal hold enabled",
    "admin.order_legal_hold_removed": "Order legal hold removed",
    "checkout.payment_captured": "Payment captured",
    "checkout.payment_signature_failed": "Payment signature rejected",
    "checkout.captured_payment_not_fulfillable": "Captured payment blocked from fulfilment",
    "payment.refund_amount_mismatch": "Refund amount did not match order",
    "payment.refund_id_mismatch": "Refund reference did not match order",
  };
  return labels[eventType] ?? eventType.replace(/[._]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
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

function validateProduct(product: CatalogProduct, categories: ManagedCategory[]): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  const selectedCategory = categories.find((category) => category.id === product.categoryId);

  if (!product.name.trim()) errors.name = "Product name is required.";
  if (!Number.isFinite(product.price) || product.price < 0 || product.price > 100_000) errors.price = "Enter a valid selling price.";
  if (!Number.isFinite(product.compareAt) || product.compareAt < 0 || product.compareAt > 100_000) errors.compareAt = "Enter a valid compare-at price.";
  if (!Number.isFinite(product.packedWeightGrams) || product.packedWeightGrams < 0 || product.packedWeightGrams > 50_000) {
    errors.packedWeightGrams = "Enter a packed weight from 0 to 50,000 g.";
  }

  if (product.status === "active") {
    if (product.price <= 0) errors.price = "An active product needs a price greater than ₹0.";
    if (!product.images.length) errors.images = "Add at least one product image before publishing.";
    if (product.packedWeightGrams <= 0) errors.packedWeightGrams = "Add the packed shipping weight before publishing.";
    if (!selectedCategory || !selectedCategory.active) errors.categoryId = "Choose an active category before publishing.";
  }

  return errors;
}

function productErrorsFromServer(message: string): ProductFieldErrors {
  const normalized = message.toLowerCase();
  if (normalized.includes("price")) return { price: message };
  if (normalized.includes("image") || normalized.includes("photo")) return { images: message };
  if (normalized.includes("weight")) return { packedWeightGrams: message };
  if (normalized.includes("categor")) return { categoryId: message };
  if (normalized.includes("compare-at")) return { compareAt: message };
  return {};
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
  initialCategories,
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
  initialCategories: ManagedCategory[];
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
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [categoryEdits, setCategoryEdits] = useState<Record<string, string>>({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryShowOnHomepage, setNewCategoryShowOnHomepage] = useState(true);
  const [imports, setImports] = useState(initialImports);
  const [orders, setOrders] = useState(initialOrders);
  const [coupons, setCoupons] = useState(initialCoupons);
  const [selectedId, setSelectedId] = useState(initialProducts[0]?.id ?? "");
  const [draft, setDraft] = useState<CatalogProduct | null>(initialProducts[0] ?? null);
  const [productErrors, setProductErrors] = useState<ProductFieldErrors>({});
  const [selectedCouponId, setSelectedCouponId] = useState(initialCoupons[0]?.id ?? "");
  const [couponDraft, setCouponDraft] = useState<CouponDraft>(() => initialCoupons[0] ? couponToDraft(initialCoupons[0]) : emptyCouponDraft());
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("to_pack");
  const [orderSearch, setOrderSearch] = useState("");
  const [activityCategoryFilter, setActivityCategoryFilter] = useState<ActivityCategory>("all");
  const [activitySeverityFilter, setActivitySeverityFilter] = useState<"all" | SystemEvent["severity"]>("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [storefrontSettings, setStorefrontSettings] = useState(initialStorefrontSettings);
  const [shippingCards, setShippingCards] = useState(initialShippingConfiguration.cards);
  const [pinRules, setPinRules] = useState(initialShippingConfiguration.pincodeRules);
  const [simpleShippingRates, setSimpleShippingRates] = useState<SimpleShippingRates>(() => simpleShippingRatesFromCards(initialShippingConfiguration.cards));
  const [shippingPreview, setShippingPreview] = useState<{ zone: ShippingZone; weightGrams: number }>({ zone: "maharashtra", weightGrams: 500 });
  const closeAdminMenu = useCallback(() => setAdminMenuOpen(false), []);
  const adminMenuDialogRef = useOverlayDialog<HTMLElement>(adminMenuOpen, closeAdminMenu, "[data-admin-menu-close]");
  const notificationRef = useRef<HTMLDivElement>(null);
  const pendingImports = imports.filter((item) => item.status === "pending");
  const totalStock = products.reduce((sum, product) => sum + product.variants.filter((variant) => variant.active).reduce((variantSum, variant) => variantSum + variant.stock, 0), 0);
  const lowStockProducts = products.filter((product) => product.status === "active").map((product) => ({ product, stock: product.variants.filter((variant) => variant.active).reduce((sum, variant) => sum + variant.stock, 0) })).filter(({ stock }) => stock < LOW_STOCK_THRESHOLD);
  const paidOrderAlerts = orders.filter((order) => isFulfillableOrder(order) && order.status === "paid");
  const notificationCount = lowStockProducts.length + paidOrderAlerts.length;
  const productsMissingShippingWeight = products.filter((product) => product.status === "active" && product.packedWeightGrams <= 0).length;
  const paidOrders = orders.filter(isFulfillableOrder);
  const revenue = paidOrders.reduce((sum, order) => sum + order.totalPaise / 100, 0);
  const selected = useMemo(() => products.find((product) => product.id === selectedId) ?? null, [products, selectedId]);
  const selectedCoupon = useMemo(() => coupons.find((coupon) => coupon.id === selectedCouponId) ?? null, [coupons, selectedCouponId]);
  const productDirty = Boolean(draft && selected && JSON.stringify(draft) !== JSON.stringify(selected));
  const couponDirty = selectedCoupon
    ? JSON.stringify(couponDraft) !== JSON.stringify(couponToDraft(selectedCoupon))
    : Boolean(couponDraft.code || couponDraft.value !== 10 || couponDraft.minOrder || couponDraft.maxDiscount !== "" || couponDraft.startsAt || couponDraft.endsAt || couponDraft.usageLimit !== "" || !couponDraft.active);
  const categoryDirty = Boolean(newCategoryName.trim() || Object.keys(categoryEdits).length);
  const hasUnsavedChanges = productDirty || couponDirty || categoryDirty;
  const selectedCouponStatus = selectedCoupon ? couponAvailability(selectedCoupon) : null;
  const activeProducts = products.filter((product) => product.status === "active");
  const selectedHomepageProduct = activeProducts.find((product) => product.id === storefrontSettings.featuredProductId) ?? null;
  const homepageImages = selectedHomepageProduct?.images ?? [];
  const orderFilterCounts: Record<OrderFilter, number> = {
    to_pack: orders.filter((order) => isFulfillableOrder(order) && order.status === "paid").length,
    processing: orders.filter((order) => isFulfillableOrder(order) && order.status === "processing").length,
    shipped: orders.filter((order) => isFulfillableOrder(order) && order.status === "shipped").length,
    delivered: orders.filter((order) => isFulfillableOrder(order) && order.status === "delivered").length,
    all_active: orders.filter((order) => isFulfillableOrder(order) && order.status !== "delivered").length,
    payment_review: orders.filter((order) => !isFulfillableOrder(order)).length,
  };
  const normalizedOrderSearch = orderSearch.trim().toLowerCase();
  const visibleOrders = orders.filter((order) => {
    const matchesFilter = orderFilter === "all_active" ? isFulfillableOrder(order) && order.status !== "delivered"
      : orderFilter === "payment_review" ? !isFulfillableOrder(order)
        : orderFilter === "to_pack" ? isFulfillableOrder(order) && order.status === "paid"
          : orderFilter === "processing" ? isFulfillableOrder(order) && order.status === "processing"
            : orderFilter === "shipped" ? isFulfillableOrder(order) && order.status === "shipped"
              : isFulfillableOrder(order) && order.status === "delivered";
    if (!matchesFilter) return false;
    if (!normalizedOrderSearch) return true;
    return [order.orderNumber, order.customerName, order.phone, order.email, order.city, order.state, order.postalCode, ...order.items.map((item) => item.productName)].join(" ").toLowerCase().includes(normalizedOrderSearch);
  });
  const normalizedActivitySearch = activitySearch.trim().toLowerCase();
  const visibleActivities = initialEvents.filter((event) => {
    if (activityCategoryFilter !== "all" && activityCategory(event) !== activityCategoryFilter) return false;
    if (activitySeverityFilter !== "all" && event.severity !== activitySeverityFilter) return false;
    if (!normalizedActivitySearch) return true;
    return [activityLabel(event.eventType), event.eventType, event.detail, event.entityType ?? "", event.entityId ?? ""].join(" ").toLowerCase().includes(normalizedActivitySearch);
  });

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (tab !== "overview") return;
    let active = true;
    async function refreshOrders() {
      try {
        const response = await fetch("/api/admin/orders", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json().catch(() => ({})) as { orders?: OrderItem[] };
        if (!active || !result.orders) return;
        setOrders((current) => {
          const incoming = new Map(result.orders!.map((order) => [order.id, order]));
          const merged = current.map((order) => incoming.has(order.id) ? incoming.get(order.id)! : order);
          const known = new Set(current.map((order) => order.id));
          return [...result.orders!.filter((order) => !known.has(order.id)), ...merged];
        });
      } catch {
        // The initial server-rendered order state remains usable if polling is unavailable.
      }
    }
    const interval = window.setInterval(refreshOrders, 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [tab]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setNotificationsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [notificationsOpen]);

  function confirmDiscardChanges() {
    return !hasUnsavedChanges || window.confirm("You have unsaved changes. Discard them?");
  }

  function changeTab(nextTab: Tab) {
    if (nextTab === tab) return true;
    if (!confirmDiscardChanges()) return false;
    setTab(nextTab);
    return true;
  }

  function selectProduct(id: string) {
    if (id !== selectedId && !confirmDiscardChanges()) return;
    const product = products.find((item) => item.id === id) ?? null;
    setSelectedId(id);
    setDraft(product ? structuredClone(product) : null);
    setProductErrors({});
    setNotice("");
  }

  function openProduct(id: string) {
    const product = products.find((item) => item.id === id) ?? null;
    if (!product || !confirmDiscardChanges()) return;
    setSelectedId(id);
    setDraft(structuredClone(product));
    setProductErrors({});
    setNotice("");
    setTab("products");
    setNotificationsOpen(false);
  }

  function updateProduct(field: ProductField, update: (product: CatalogProduct) => CatalogProduct) {
    setDraft((current) => current ? update(current) : current);
    setProductErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function saveProduct() {
    if (!draft) return;
    const errors = validateProduct(draft, categories);
    if (Object.keys(errors).length) {
      setProductErrors(errors);
      setNotice("Please fix the highlighted product fields before saving.");
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".product-editor [aria-invalid='true']")?.focus());
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; slug?: string; variants?: CatalogProduct["variants"] };
      if (!response.ok) {
        const message = result.error || "Could not save this product";
        setProductErrors(productErrorsFromServer(message));
        setNotice(message);
      } else {
        const saved = { ...structuredClone(draft), slug: result.slug ?? draft.slug, variants: result.variants ?? draft.variants };
        setDraft(saved);
        setProducts((current) => current.map((item) => item.id === draft.id ? saved : item));
        setProductErrors({});
        setNotice(`Saved. Storefront link: /products/${saved.slug}`);
      }
    } catch {
      setNotice("Could not save this product. Check your connection and try again.");
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
      setProductErrors((current) => {
        if (!current.images) return current;
        const next = { ...current };
        delete next.images;
        return next;
      });
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
    if (!confirmDiscardChanges()) return;
    setBusy(true);
    const response = await fetch("/api/admin/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Untitled product" }) });
    if (response.ok) window.location.reload();
    else { setNotice("Could not create a new draft"); setBusy(false); }
  }

  function selectCoupon(id: string) {
    if (id !== selectedCouponId && !confirmDiscardChanges()) return;
    const coupon = coupons.find((item) => item.id === id);
    if (!coupon) return;
    setSelectedCouponId(id);
    setCouponDraft(couponToDraft(coupon));
    setNotice("");
  }

  function addCoupon() {
    if (!confirmDiscardChanges()) return;
    setSelectedCouponId("");
    setCouponDraft(emptyCouponDraft());
    setNotice("");
  }

  function updateCategoryName(id: string, name: string) {
    setCategoryEdits((current) => ({ ...current, [id]: name }));
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, showOnHomepage: newCategoryShowOnHomepage }) });
      const result = await response.json().catch(() => ({})) as { category?: ManagedCategory; error?: string };
      if (!response.ok || !result.category) setNotice(result.error || "Could not create that category.");
      else {
        setCategories((current) => [...current, result.category!]);
        setNewCategoryName("");
        setNewCategoryShowOnHomepage(true);
        setNotice(`${result.category.name} is ready to use on products.`);
      }
    } catch {
      setNotice("Could not create that category. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function saveCategory(category: ManagedCategory) {
    const name = (categoryEdits[category.id] ?? category.name).trim();
    if (!name || name === category.name) {
      setCategoryEdits((current) => { const next = { ...current }; delete next[category.id]; return next; });
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: category.id, name }) });
      const result = await response.json().catch(() => ({})) as { category?: ManagedCategory; error?: string };
      if (!response.ok || !result.category) setNotice(result.error || "Could not save that category.");
      else {
        setCategories((current) => current.map((item) => item.id === category.id ? result.category! : item));
        setCategoryEdits((current) => { const next = { ...current }; delete next[category.id]; return next; });
        setProducts((current) => current.map((product) => product.categoryId === category.id ? { ...product, category: result.category!.name, categorySlug: result.category!.slug } : product));
        setDraft((current) => current?.categoryId === category.id ? { ...current, category: result.category!.name, categorySlug: result.category!.slug } : current);
        setNotice("Category saved.");
      }
    } catch {
      setNotice("Could not save that category. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function setCategoryActive(category: ManagedCategory, active: boolean) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: category.id, active }) });
      const result = await response.json().catch(() => ({})) as { category?: ManagedCategory; error?: string };
      if (!response.ok || !result.category) setNotice(result.error || "Could not update that category.");
      else {
        setCategories((current) => current.map((item) => item.id === category.id ? result.category! : item));
        setNotice(active ? "Category restored." : "Category archived. It is hidden from the shop.");
      }
    } catch {
      setNotice("Could not update that category. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function setCategoryHomepage(category: ManagedCategory, showOnHomepage: boolean) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: category.id, showOnHomepage }) });
      const result = await response.json().catch(() => ({})) as { category?: ManagedCategory; error?: string };
      if (!response.ok || !result.category) setNotice(result.error || "Could not update the homepage setting.");
      else {
        setCategories((current) => current.map((item) => item.id === category.id ? result.category! : item));
        setNotice(showOnHomepage ? "Category added to the homepage." : "Category hidden from the homepage.");
      }
    } catch {
      setNotice("Could not update the homepage setting. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function moveCategory(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reorder", orderedIds: reordered.map((category) => category.id) }) });
      const result = await response.json().catch(() => ({})) as { categories?: ManagedCategory[]; error?: string };
      if (!response.ok || !result.categories) setNotice(result.error || "Could not change the category order.");
      else { setCategories(result.categories); setNotice("Category order saved."); }
    } catch {
      setNotice("Could not change the category order. Check your connection and try again.");
    }
    setBusy(false);
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

  function updateOrderDraft(id: string, patch: Partial<OrderItem>) {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, ...patch } : order));
  }

  async function saveOrder(order: OrderItem, status = order.status, successMessage = "Order updated.") {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: order.id, status, courierName: order.courierName, trackingNumber: order.trackingNumber, trackingUrl: order.trackingUrl, legalHold: order.legalHold }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.ok) {
        setOrders((current) => current.map((item) => item.id === order.id ? { ...item, courierName: order.courierName, trackingNumber: order.trackingNumber, trackingUrl: order.trackingUrl, status } : item));
        setNotice(successMessage);
      } else setNotice(result.error || "Could not update the order.");
    } catch {
      setNotice("Could not update the order. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function advanceOrder(order: OrderItem) {
    const nextStatus = order.status === "paid" || order.status === "processing" ? "shipped" : order.status === "shipped" ? "delivered" : "";
    if (!nextStatus) return;
    const successMessage = nextStatus === "shipped" ? "Order marked shipped and ready for the customer to track." : "Order marked delivered.";
    await saveOrder(order, nextStatus, successMessage);
  }

  async function copyDeliveryDetails(order: OrderItem) {
    const items = order.items.map((item) => `${item.quantity} x ${item.productName} (${item.size})`).join("\n");
    const text = `Order ${order.orderNumber}\n${order.customerName}\n${order.phone}\n${order.email}\n\n${deliveryAddress(order)}\n\nItems:\n${items}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`Delivery details for ${order.orderNumber} copied.`);
    } catch {
      setNotice("Could not copy delivery details. Please select and copy them manually.");
    }
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
    if (!window.confirm("Cancel this paid order and issue a full Razorpay refund? The order will not be restocked until Razorpay confirms the refund.")) return;
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
    { id: "categories", label: "Categories", count: categories.filter((category) => category.active).length },
    { id: "instagram", label: "Instagram queue", count: pendingImports.length },
    { id: "orders", label: "Orders", count: orders.length },
    { id: "activity", label: "Activity", count: initialEvents.length },
    { id: "coupons", label: "Coupons", count: coupons.length },
    { id: "shipping", label: "Shipping" },
    { id: "settings", label: "Site controls" },
  ];

  function changeMobileTab(nextTab: Tab) {
    if (changeTab(nextTab)) closeAdminMenu();
  }

  return (
    <main className="admin-shell">
      {adminMenuOpen && <><button className="admin-menu-backdrop" aria-label="Close Admin menu" onClick={closeAdminMenu} /><aside id="admin-mobile-menu" ref={adminMenuDialogRef} className="admin-mobile-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-mobile-menu-title" tabIndex={-1}><div className="admin-mobile-drawer-header"><div><span id="admin-mobile-menu-title">Admin menu</span><small>Classy Apparels</small></div><button type="button" className="admin-mobile-menu-close" data-admin-menu-close onClick={closeAdminMenu}>Close</button></div><nav aria-label="Admin sections">{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => changeMobileTab(item.id)}><span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}</button>)}</nav><div className="admin-mobile-drawer-user"><span>{(user.name || user.email).slice(0, 1).toUpperCase()}</span><div><strong>{user.name || user.email}</strong><small>{user.email}</small></div><a href={signOutPath}>Sign out</a></div></aside></>}
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/"><span>Classy Apparels</span></Link>
        <nav>{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => changeTab(item.id)}><span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}</button>)}</nav>
        <div className="admin-user"><span>{(user.name || user.email).slice(0, 1).toUpperCase()}</span><div><strong>{user.name || user.email}</strong><small>{user.email}</small></div><a href={signOutPath}>Sign out</a></div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div><p className="kicker">Sana’s private workspace</p><h1>{nav.find((item) => item.id === tab)?.label}</h1>{hasUnsavedChanges && <span className="admin-unsaved">Unsaved changes</span>}</div><div><div className="admin-notification-wrap" ref={notificationRef}><button type="button" className={`admin-notification-button${notificationCount ? " has-notifications" : ""}`} onClick={() => setNotificationsOpen((current) => !current)} aria-label={notificationCount ? `${notificationCount} notifications` : "Notifications"} aria-expanded={notificationsOpen} aria-controls="admin-notification-panel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>{notificationCount > 0 && <span>{notificationCount > 9 ? "9+" : notificationCount}</span>}</button>{notificationsOpen && <div id="admin-notification-panel" className="admin-notification-panel" role="dialog" aria-label="Notifications"><div className="admin-notification-heading"><strong>Notifications</strong><small>{notificationCount ? `${notificationCount} need attention` : "All clear"}</small></div>{paidOrderAlerts.length > 0 && <div className="admin-notification-group"><p>Orders</p>{paidOrderAlerts.map((order) => <button type="button" className="admin-notification-item" key={order.id} onClick={() => { setOrderFilter("to_pack"); if (changeTab("orders")) setNotificationsOpen(false); }}><span className="admin-notification-icon payment">✓</span><span><strong>{order.orderNumber}</strong><small>Payment received from {order.customerName} · {rupees(order.totalPaise / 100)}</small></span></button>)}</div>}{lowStockProducts.length > 0 && <div className="admin-notification-group"><p>Inventory</p>{lowStockProducts.map(({ product, stock }) => <button type="button" className="admin-notification-item" key={product.id} onClick={() => openProduct(product.id)}><span className="admin-notification-icon stock">!</span><span><strong>{product.name}</strong><small>{stock === 0 ? "Out of stock" : `${stock} left`} · Restock needed</small></span></button>)}</div>}{notificationCount === 0 && <p className="admin-notification-empty">No new notifications.</p>}</div>}</div><button type="button" className="admin-mobile-menu" aria-expanded={adminMenuOpen} aria-controls="admin-mobile-menu" onClick={() => setAdminMenuOpen(true)}><span aria-hidden="true">☰</span> Menu</button><Link className="admin-view-store" href="/" target="_blank">View store ↗</Link>{tab === "products" && <button className="button button-dark" onClick={addProduct} disabled={busy}>+ New product</button>}{tab === "coupons" && <button className="button button-dark" onClick={addCoupon} disabled={busy}>+ New coupon</button>}</div></header>
        {notice && <div className={`admin-notice${Object.keys(productErrors).length ? " error" : ""}`} role={Object.keys(productErrors).length ? "alert" : "status"}>{notice}<button onClick={() => setNotice("")}>×</button></div>}

        {tab === "overview" && <div className="admin-overview">
          <div className="metric-grid"><article><span>Products</span><strong>{products.length}</strong><small>{products.filter((item) => item.status === "active").length} live</small></article><article><span>Units in stock</span><strong>{totalStock}</strong><small>Across every size</small></article><article><span>Shipping setup</span><strong>{productsMissingShippingWeight}</strong><small>{productsMissingShippingWeight ? "live product(s) need packed weight" : "Every live product is weighted"}</small></article><article><span>Captured revenue</span><strong>{rupees(revenue)}</strong><small>{paidOrders.length} paid orders</small></article></div>
          <div className="admin-two-col"><article className="admin-card"><div className="admin-card-heading"><div><p className="kicker">Inventory</p><h2>What needs attention</h2></div><button onClick={() => changeTab("products")}>Manage →</button></div>{products.map((product) => { const stock = product.variants.filter((variant) => variant.active).reduce((sum, variant) => sum + variant.stock, 0); return <button type="button" className="attention-row" key={product.id} onClick={() => openProduct(product.id)}><img src={product.images[0]} alt="" loading="lazy" decoding="async" /><div><strong>{product.name}</strong><span>{product.status} · {stock} units</span></div><span className={stock < LOW_STOCK_THRESHOLD ? "low" : "good"}>{stock < LOW_STOCK_THRESHOLD ? "Low stock" : "Healthy"}</span></button>; })}</article>
          <article className="admin-card"><div className="admin-card-heading"><div><p className="kicker">Workflow</p><h2>Instagram → Store</h2></div></div><div className="workflow-steps"><div className="done"><span>1</span><div><strong>Post on Instagram</strong><small>Keep creating as usual</small></div></div><div><span>2</span><div><strong>Sync to review queue</strong><small>Photos and captions arrive as pending</small></div></div><div><span>3</span><div><strong>Add selling details</strong><small>Set price, sizes and stock, then publish</small></div></div></div><button className="button button-outline" onClick={() => changeTab("instagram")}>Open Instagram queue</button></article></div>
        </div>}

        {tab === "activity" && <div className="activity-admin">
          <section className="activity-heading">
            <div>
              <p className="kicker">Activity log</p>
              <h2>Important store events, easy to scan.</h2>
              <p>Successful page views are not retained. This log is for security, payments and actions that need attention.</p>
            </div>
            <label>
              <span>Search activity</span>
              <input value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} placeholder="Search event, detail or reference" />
            </label>
          </section>
          <section className="activity-filters" aria-label="Activity filters">
            <div>
              <span>Category</span>
              <select value={activityCategoryFilter} onChange={(event) => setActivityCategoryFilter(event.target.value as ActivityCategory)}>
                <option value="all">All categories</option><option value="payments">Payments</option><option value="orders">Orders</option><option value="shipping">Shipping</option><option value="storefront">Storefront</option><option value="security">Security</option><option value="system">System</option>
              </select>
            </div>
            <div>
              <span>Severity</span>
              <select value={activitySeverityFilter} onChange={(event) => setActivitySeverityFilter(event.target.value as "all" | SystemEvent["severity"])}>
                <option value="all">All severities</option><option value="security">Security</option><option value="error">Error</option><option value="warning">Warning</option><option value="info">Information</option>
              </select>
            </div>
            <small>{visibleActivities.length} matching event{visibleActivities.length === 1 ? "" : "s"}</small>
          </section>
          {initialEvents.length === 0 ? <div className="admin-empty"><span>◌</span><h2>No important activity yet</h2><p>Security, payment and operational events will appear here when action is needed.</p></div>
            : visibleActivities.length === 0 ? <div className="admin-empty"><span>⌕</span><h2>No matching activity</h2><p>Clear the search or choose a different filter.</p></div>
              : <div className="activity-log-list">{visibleActivities.map((event) => <article key={event.id}>
                <div className="activity-event-tags"><span className={`event-severity ${event.severity}`}>{event.severity}</span><span className={`activity-category ${activityCategory(event)}`}>{activityCategory(event)}</span></div>
                <div><h3>{activityLabel(event.eventType)}</h3><p>{event.detail || "No additional detail was recorded."}</p><small>{event.entityType ? `${event.entityType}${event.entityId ? ` · ${event.entityId}` : ""}` : "System"} · {shortDate(event.createdAt)}</small></div>
              </article>)}</div>}
        </div>}

        {tab === "products" && <div className="product-admin-layout">
          <div className="product-list"><div className="product-list-search">Products · {products.length}</div>{products.map((product) => <button key={product.id} type="button" className={selectedId === product.id ? "active" : ""} onClick={() => selectProduct(product.id)}><img src={product.images[0] || "/products/sea-mist-01.webp"} alt="" /><div><strong>{product.name}</strong><span>{rupees(product.price)} · {product.status}</span></div><small>{product.variants.reduce((sum, variant) => sum + variant.stock, 0)}</small></button>)}</div>
          {draft && selected && <div className="product-editor">
            <div className="editor-heading"><div><p className="kicker">{draft.source === "instagram" ? "Instagram draft" : "Product details"}</p><h2>{draft.name}</h2></div><span className={`status-pill ${draft.status}`}>{draft.status}</span></div>
            <div className={`editor-photo-manager${productErrors.images ? " field-invalid" : ""}`}>
              <div className="editor-photo-heading"><div><strong>Product photo gallery</strong><p>Upload up to 12 phone photos at once. The first photo is the storefront cover.</p></div><label className="upload-button">+ Add photos<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files && uploadImages(event.target.files)} /></label></div>
              <div className="editor-photo-grid">{draft.images.map((image, index) => <article key={`${image}-${index}`} className={index === 0 ? "primary" : ""}><img src={image} alt={`${draft.name}, admin view ${index + 1}`} /><span>{index === 0 ? "Cover" : `Photo ${index + 1}`}</span><div>{index > 0 && <button type="button" onClick={() => makePrimary(index)}>Set cover</button>}<button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label="Move photo earlier">←</button><button type="button" onClick={() => moveImage(index, 1)} disabled={index === draft.images.length - 1} aria-label="Move photo later">→</button><button type="button" className="remove" onClick={() => removeImage(index)}>Remove</button></div></article>)}</div>
              {!draft.images.length && <div className="editor-photo-empty">No photos yet. Add clear front, back and detail views before publishing.</div>}
              {productErrors.images && <small className="field-error" id="product-images-error" role="alert">{productErrors.images}</small>}
            </div>
            <div className="editor-fields">
              <label className={`wide${productErrors.name ? " field-invalid" : ""}`}>
                <span>Product name</span>
                <input value={draft.name} onChange={(event) => updateProduct("name", (product) => ({ ...product, name: event.target.value }))} aria-invalid={Boolean(productErrors.name)} aria-describedby={productErrors.name ? "product-name-error" : undefined} />
                {productErrors.name && <small className="field-error" id="product-name-error" role="alert">{productErrors.name}</small>}
              </label>
              <label className={productErrors.price ? "field-invalid" : ""}>
                <span>Selling price (₹)</span>
                <input type="number" min="0" value={draft.price} onChange={(event) => updateProduct("price", (product) => ({ ...product, price: Number(event.target.value) }))} aria-invalid={Boolean(productErrors.price)} aria-describedby={productErrors.price ? "product-price-error" : undefined} />
                {productErrors.price && <small className="field-error" id="product-price-error" role="alert">{productErrors.price}</small>}
              </label>
              <label className={productErrors.compareAt ? "field-invalid" : ""}>
                <span>Compare-at price (₹)</span>
                <input type="number" min="0" value={draft.compareAt} onChange={(event) => updateProduct("compareAt", (product) => ({ ...product, compareAt: Number(event.target.value) }))} aria-invalid={Boolean(productErrors.compareAt)} aria-describedby={productErrors.compareAt ? "product-compare-at-error" : undefined} />
                {productErrors.compareAt && <small className="field-error" id="product-compare-at-error" role="alert">{productErrors.compareAt}</small>}
              </label>
              <label className={productErrors.categoryId ? "field-invalid" : ""}>
                <span>Product category</span>
                <select value={draft.categoryId ?? ""} onChange={(event) => updateProduct("categoryId", (product) => { const category = categories.find((item) => item.id === event.target.value); return { ...product, categoryId: category?.id ?? null, category: category?.name ?? "", categorySlug: category?.slug ?? "" }; })} aria-invalid={Boolean(productErrors.categoryId)} aria-describedby={productErrors.categoryId ? "product-category-error" : "product-category-help"}>
                  <option value="">Choose before publishing</option>
                  {categories.filter((category) => category.active || category.id === draft.categoryId).map((category) => <option value={category.id} key={category.id}>{category.name}{category.active ? "" : " · archived"}</option>)}
                </select>
                <small id="product-category-help">Only active categories can be published.</small>
                {productErrors.categoryId && <small className="field-error" id="product-category-error" role="alert">{productErrors.categoryId}</small>}
              </label>
              <label className={productErrors.packedWeightGrams ? "field-invalid" : ""}>
                <span>Packed shipping weight (g)</span>
                <input type="number" min="1" max="50000" value={draft.packedWeightGrams || ""} onChange={(event) => updateProduct("packedWeightGrams", (product) => ({ ...product, packedWeightGrams: Number(event.target.value) }))} aria-invalid={Boolean(productErrors.packedWeightGrams)} aria-describedby={productErrors.packedWeightGrams ? "product-weight-error" : "product-weight-help"} />
                <small id="product-weight-help">Garment plus packaging. Required to publish.</small>
                {productErrors.packedWeightGrams && <small className="field-error" id="product-weight-error" role="alert">{productErrors.packedWeightGrams}</small>}
              </label>
              <label>
                <span>Colour</span>
                <input value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} />
              </label>
              <label>
                <span>Fabric</span>
                <input value={draft.fabric} onChange={(event) => setDraft({ ...draft, fabric: event.target.value })} />
              </label>
              <label className="wide">
                <span>What is included</span>
                <input value={draft.includes} onChange={(event) => setDraft({ ...draft, includes: event.target.value })} />
              </label>
              <label className="wide">
                <span>Description</span>
                <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={5} />
              </label>
            </div>
            <label className="feature-toggle product-size-toggle"><input type="checkbox" checked={draft.hasSizes} onChange={(event) => setDraft({ ...draft, hasSizes: event.target.checked })} /><span><strong>This product has sizes</strong><small>Turn off for unstitched or free-size pieces.</small></span></label>
            <div className="inventory-editor"><div><h3>{draft.hasSizes ? "Size inventory" : "Product inventory"}</h3><p>{draft.hasSizes ? "Stock reaches the storefront immediately after saving." : "Enter the total number of pieces available. Customers will not choose a size."}</p></div><div className={draft.hasSizes ? "variant-grid" : "variant-grid single"}>{(draft.hasSizes ? draft.variants : draft.variants.slice(0, 1)).map((variant, index) => <label key={variant.id}><span>{draft.hasSizes ? variant.size : "Available pieces"}</span><input type="number" min="0" max="9999" value={variant.stock} onChange={(event) => { const variants = [...draft.variants]; const variantIndex = draft.hasSizes ? index : 0; variants[variantIndex] = { ...variants[variantIndex], stock: Number(event.target.value) }; setDraft({ ...draft, variants }); }} /></label>)}</div></div>
            <div className="editor-publish"><label><span>Visibility</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CatalogProduct["status"] })}><option value="draft">Draft — hidden from customers</option><option value="active">Active — visible and purchasable</option><option value="archived">Archived</option></select></label><label className="feature-toggle"><input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} /><span>Feature on home page</span></label><button className="button button-dark" onClick={saveProduct} disabled={busy}>{busy ? "Saving…" : "Save product"}</button></div>
          </div>}
        </div>}

        {tab === "categories" && <div className="categories-admin">
          <section className="category-admin-intro">
            <div><p className="kicker">Shop discovery</p><h2>Arrange the shop your way.</h2><p>Create the few collections customers should see first. A live product needs one active category before it can be published.</p></div>
            <form className="category-create-form" onSubmit={createCategory}><label><span>New category</span><input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} maxLength={80} placeholder="e.g. Pakistani suits" /></label><label className="feature-toggle"><input type="checkbox" checked={newCategoryShowOnHomepage} onChange={(event) => setNewCategoryShowOnHomepage(event.target.checked)} /><span>Show on homepage</span></label><button className="button button-dark" disabled={busy || !newCategoryName.trim()}>{busy ? "Saving…" : "Add category"}</button></form>
          </section>
          <section className="category-admin-list" aria-label="Product categories">
            {!categories.length ? <div className="admin-empty"><span>◌</span><h2>Your first collection starts here.</h2><p>Add a category, then choose it while editing a product.</p></div> : categories.map((category, index) => {
              const productCount = products.filter((product) => product.categoryId === category.id).length;
              const liveProductCount = products.filter((product) => product.categoryId === category.id && product.status === "active").length;
              const editedName = categoryEdits[category.id] ?? category.name;
              return <article key={category.id} className={category.active ? "" : "archived"}>
                <div className="category-order"><button type="button" onClick={() => moveCategory(index, -1)} disabled={busy || index === 0} aria-label={`Move ${category.name} earlier`}>↑</button><button type="button" onClick={() => moveCategory(index, 1)} disabled={busy || index === categories.length - 1} aria-label={`Move ${category.name} later`}>↓</button></div>
                <label><span>Category name</span><input value={editedName} onChange={(event) => updateCategoryName(category.id, event.target.value)} maxLength={80} /></label>
                <div className="category-meta"><strong>{productCount} product{productCount === 1 ? "" : "s"}</strong><small>{liveProductCount} live · /shop?category={category.slug}</small></div>
                <div className="category-actions"><label className="feature-toggle"><input type="checkbox" checked={category.showOnHomepage} onChange={(event) => setCategoryHomepage(category, event.target.checked)} disabled={busy || !category.active} /><span>Show on homepage</span></label><button type="button" className="button button-outline" onClick={() => saveCategory(category)} disabled={busy || editedName.trim() === category.name}>Save</button><button type="button" className="text-link" onClick={() => setCategoryActive(category, !category.active)} disabled={busy}>{category.active ? "Archive" : "Restore"}</button></div>
              </article>;
            })}
          </section>
        </div>}

        {tab === "instagram" && <div className="instagram-admin"><div className="integration-banner"><div className="instagram-icon">◎</div><div><p className="kicker">Instagram import</p><h2>Turn posts into polished product drafts.</h2><p>Sync the latest posts, review each one, then add price, sizes and inventory before anything appears publicly.</p></div><button className="button button-dark" onClick={syncInstagram} disabled={busy}>{busy ? "Syncing…" : "Sync latest posts"}</button></div>{pendingImports.length === 0 ? <div className="admin-empty"><span>◎</span><h2>Your review queue is clear</h2><p>Connect the Instagram token in Integrations, then sync. New posts stay private until you approve them.</p><button className="text-link" onClick={() => changeTab("settings")}>Check integration setup →</button></div> : <div className="import-grid">{pendingImports.map((item) => <article key={item.id}><div className="import-image"><img src={item.imageUrl} alt="Instagram import preview" loading="lazy" decoding="async" /><span>Pending review</span></div><div className="import-copy"><small>{shortDate(item.publishedAt)}</small><p>{item.caption || "No caption"}</p><div><button className="button button-dark" onClick={() => reviewImport(item.id, "create_draft")} disabled={busy}>Create product draft</button><button className="text-link" onClick={() => reviewImport(item.id, "ignore")} disabled={busy}>Ignore</button></div></div></article>)}</div>}</div>}

        {tab === "orders" && <div className="orders-admin">
          <section className="orders-workspace-intro">
            <div><p className="kicker">Fulfilment workspace</p><h2>Prepare paid orders without the clutter.</h2><p>Only payments confirmed as captured can enter packing or shipping. Payment attempts and refunds stay separate in Payment review.</p></div>
            <label className="orders-search"><span>Find an order</span><input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Order number, customer, phone, PIN or item" /></label>
            <div className="order-filter-tabs" role="group" aria-label="Order filters">
              {([
                ["to_pack", "To pack"],
                ["processing", "Packing"],
                ["shipped", "Shipped"],
                ["delivered", "Delivered"],
                ["all_active", "All active"],
                ["payment_review", "Payment review"],
              ] as Array<[OrderFilter, string]>).map(([filter, label]) => <button key={filter} type="button" className={orderFilter === filter ? "active" : ""} aria-pressed={orderFilter === filter} onClick={() => setOrderFilter(filter)}><span>{label}</span><b>{orderFilterCounts[filter]}</b></button>)}
            </div>
          </section>
          {orders.length === 0 ? <div className="admin-empty"><span>□</span><h2>No paid orders yet</h2><p>Captured payments will appear here, ready to prepare for delivery.</p></div> : visibleOrders.length === 0 ? <div className="admin-empty"><span>⌕</span><h2>Nothing matches this view</h2><p>Try another order filter or clear the search.</p></div> : <div className="fulfilment-order-list">
            {visibleOrders.map((order) => {
              const fulfilable = isFulfillableOrder(order);
              const whatsappUrl = customerWhatsappUrl(order.phone);
                    const nextAction = order.status === "paid" || order.status === "processing" ? "Mark shipped" : order.status === "shipped" ? "Mark delivered" : "";
              return <article className={`fulfilment-order-card${fulfilable ? "" : " payment-review"}`} key={order.id}>
                <header><div><p className="kicker">{shortDate(order.createdAt)}</p><h3>{order.orderNumber}</h3></div><strong>{rupees(order.totalPaise / 100)}</strong><span className={`status-pill ${order.status}`}>{order.status.replace("_", " ")}</span></header>
                {fulfilable ? <>
                  <div className="fulfilment-order-grid">
                    <section className="order-customer-details"><p className="kicker">Delivery to</p><h4>{order.customerName}</h4><a href={`tel:${order.phone}`}>{order.phone}</a><a href={`mailto:${order.email}`}>{order.email}</a><p>{deliveryAddress(order)}</p><div><button type="button" className="button button-outline" onClick={() => copyDeliveryDetails(order)}>Copy delivery details</button>{whatsappUrl && <a className="text-link" href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp customer ↗</a>}</div></section>
                    <section className="order-items-summary"><p className="kicker">Pack these items</p>{order.items.length ? order.items.map((item, index) => <div key={`${item.productName}-${item.size}-${index}`}><strong>{item.quantity} × {item.productName}</strong><span>Size {item.size}</span></div>) : <p>Line items are unavailable. Do not dispatch before checking the customer order record.</p>}</section>
                    <section className="order-fulfilment-actions"><p className="kicker">Fulfilment</p><h4>{order.status === "paid" ? "Ready to pack" : order.status === "processing" ? "Packing in progress" : order.status === "shipped" ? "On its way" : "Delivered"}</h4>{order.status !== "delivered" && <><label><span>Courier <small>optional for now</small></span><input value={order.courierName} onChange={(event) => updateOrderDraft(order.id, { courierName: event.target.value })} placeholder="Delhivery, Blue Dart…" /></label><label><span>Tracking number / AWB <small>can be added later</small></span><input value={order.trackingNumber} onChange={(event) => updateOrderDraft(order.id, { trackingNumber: event.target.value })} placeholder="Shipment reference" /></label><label><span>Tracking link <small>optional</small></span><input type="url" value={order.trackingUrl} onChange={(event) => updateOrderDraft(order.id, { trackingUrl: event.target.value })} placeholder="https://…" /></label><p className="order-tracking-hint">You can mark the order shipped now and add tracking details when the courier confirms the shipment.</p><div className="order-action-buttons"><button className="button button-outline" onClick={() => saveOrder(order, order.status, "Tracking details saved.")} disabled={busy}>Save tracking</button>{order.status === "paid" && <button className="button button-outline" onClick={() => saveOrder(order, "processing", "Order moved to packing.")} disabled={busy}>Start packing</button>}{nextAction && <button className="button button-dark" onClick={() => advanceOrder(order)} disabled={busy}>{nextAction}</button>}</div></>}{order.status === "delivered" && <p className="order-complete-note">This order is complete. Tracking details remain in the customer view.</p>}</section>
                  </div>
                  <footer className="fulfilment-order-footer"><span>Payment confirmed</span><span className={`status-pill ${order.adminNotificationStatus}`}>Email {order.adminNotificationStatus.replace("_", " ")}</span>{order.adminNotificationStatus !== "sent" && <button type="button" className="text-link" onClick={() => resendOrderAlert(order.id)} disabled={busy}>Retry order email</button>}<button type="button" className="text-link refund-action" onClick={() => refundOrder(order.id)} disabled={busy}>Cancel & refund order</button><a href={`/track-order?order=${encodeURIComponent(order.orderNumber)}`} target="_blank" rel="noreferrer">Customer view ↗</a><details><summary>More controls</summary><label className="feature-toggle"><input type="checkbox" checked={order.legalHold} onChange={(event) => changeLegalHold(order, event.target.checked)} disabled={busy} /><span>Legal hold</span></label></details></footer>
                </> : <section className="order-payment-review"><p className="kicker">Not a shipping order</p><h4>{order.status === "refund_pending" ? "Refund in progress" : order.paymentStatus === "refunded" ? "Refunded" : "Payment has not been captured"}</h4><p>{order.status === "refund_pending" ? "Do not pack or dispatch this order. It remains here only until Razorpay confirms the full refund." : order.paymentStatus === "refunded" ? "This payment was refunded and cannot enter fulfilment." : "This payment attempt cannot enter packing or shipping. Canceled attempts have their delivery data cleared automatically."}</p><div>{order.razorpayOrderId && !["captured", "refunded"].includes(order.paymentStatus) && <button type="button" className="button button-outline" onClick={() => reconcileOrder(order.id)} disabled={busy}>Check Razorpay again</button>}{order.paymentStatus === "captured" && <button type="button" className="button button-outline" onClick={() => refundOrder(order.id)} disabled={busy}>Retry full refund</button>}<details><summary>Payment reference</summary><p>Payment: {order.paymentStatus.replace("_", " ")} · Fulfilment: {order.status.replace("_", " ")}</p></details></div></section>}
              </article>;
            })}
          </div>}
        </div>}

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
