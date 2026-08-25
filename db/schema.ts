import { sql } from "drizzle-orm";
import { boolean, datetime, index, int, mysqlEnum, mysqlTable, uniqueIndex, varchar, text } from "drizzle-orm/mysql-core";

const createdAt = datetime("created_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = datetime("updated_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`);

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 180 }).notNull(),
  name: varchar("name", { length: 120 }).notNull().default(""),
  role: mysqlEnum("role", ["owner", "admin", "customer"]).notNull().default("customer"),
  emailVerifiedAt: datetime("email_verified_at", { mode: "string" }),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("users_email_unique").on(table.email), index("users_role_idx").on(table.role)]);

export const emailOtps = mysqlTable("email_otps", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 180 }).notNull(),
  purpose: mysqlEnum("purpose", ["sign_in", "recovery"]).notNull(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  attempts: int("attempts").notNull().default(0),
  expiresAt: datetime("expires_at", { mode: "string" }).notNull(),
  usedAt: datetime("used_at", { mode: "string" }),
  createdAt,
}, (table) => [index("email_otps_lookup_idx").on(table.email, table.purpose, table.expiresAt)]);

export const products = mysqlTable("products", {
  id: varchar("id", { length: 36 }).primaryKey(),
  slug: varchar("slug", { length: 150 }).notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  subtitle: varchar("subtitle", { length: 160 }).notNull().default(""),
  description: text("description").notNull().default(""),
  pricePaise: int("price_paise").notNull().default(0),
  compareAtPaise: int("compare_at_paise"),
  category: varchar("category", { length: 80 }).notNull().default("3-piece sets"),
  status: mysqlEnum("status", ["draft", "active", "archived"]).notNull().default("draft"),
  color: varchar("color", { length: 80 }).notNull().default(""),
  fabric: varchar("fabric", { length: 160 }).notNull().default(""),
  includes: varchar("includes", { length: 300 }).notNull().default(""),
  care: varchar("care", { length: 500 }).notNull().default(""),
  primaryImage: varchar("primary_image", { length: 500 }).notNull().default(""),
  source: mysqlEnum("source", ["manual", "instagram"]).notNull().default("manual"),
  instagramMediaId: varchar("instagram_media_id", { length: 80 }),
  instagramPermalink: varchar("instagram_permalink", { length: 500 }),
  featured: boolean("featured").notNull().default(false),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("products_slug_unique").on(table.slug), uniqueIndex("products_instagram_media_unique").on(table.instagramMediaId), index("products_status_featured_idx").on(table.status, table.featured)]);

export const productImages = mysqlTable("product_images", {
  id: int("id").autoincrement().primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 500 }).notNull(),
  alt: varchar("alt", { length: 240 }).notNull().default(""),
  position: int("position").notNull().default(0),
}, (table) => [uniqueIndex("product_images_product_url_unique").on(table.productId, table.url), index("product_images_product_idx").on(table.productId, table.position)]);

export const productVariants = mysqlTable("product_variants", {
  id: int("id").autoincrement().primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  size: varchar("size", { length: 20 }).notNull(),
  sku: varchar("sku", { length: 100 }).notNull(),
  stock: int("stock").notNull().default(0),
  reservedStock: int("reserved_stock").notNull().default(0),
  active: boolean("active").notNull().default(true),
}, (table) => [uniqueIndex("product_variants_sku_unique").on(table.sku), uniqueIndex("product_variants_product_size_unique").on(table.productId, table.size)]);

export const instagramImports = mysqlTable("instagram_imports", {
  id: int("id").autoincrement().primaryKey(),
  instagramMediaId: varchar("instagram_media_id", { length: 80 }).notNull(),
  caption: text("caption").notNull().default(""),
  mediaType: varchar("media_type", { length: 20 }).notNull().default("IMAGE"),
  imageKey: varchar("image_key", { length: 300 }).notNull().default(""),
  sourceUrl: varchar("source_url", { length: 500 }).notNull().default(""),
  permalink: varchar("permalink", { length: 500 }).notNull().default(""),
  status: mysqlEnum("status", ["pending", "imported", "ignored"]).notNull().default("pending"),
  importedProductId: varchar("imported_product_id", { length: 36 }),
  publishedAt: datetime("published_at", { mode: "string" }),
  createdAt,
}, (table) => [uniqueIndex("instagram_imports_media_unique").on(table.instagramMediaId), index("instagram_imports_status_idx").on(table.status, table.createdAt)]);

export const orders = mysqlTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderNumber: varchar("order_number", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["pending_payment", "paid", "processing", "shipped", "delivered", "cancelled", "payment_failed", "refund_pending", "refunded"]).notNull().default("pending_payment"),
  paymentStatus: mysqlEnum("payment_status", ["pending", "verified", "captured", "failed", "refunded"]).notNull().default("pending"),
  customerName: varchar("customer_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 180 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  addressLine1: varchar("address_line_1", { length: 220 }).notNull(),
  addressLine2: varchar("address_line_2", { length: 220 }).notNull().default(""),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull().default("IN"),
  postalCode: varchar("postal_code", { length: 20 }).notNull(),
  formattedAddress: varchar("formatted_address", { length: 400 }).notNull().default(""),
  deliveryPlaceId: varchar("delivery_place_id", { length: 220 }).notNull().default(""),
  deliveryLatitude: varchar("delivery_latitude", { length: 30 }),
  deliveryLongitude: varchar("delivery_longitude", { length: 30 }),
  subtotalPaise: int("subtotal_paise").notNull(),
  shippingPaise: int("shipping_paise").notNull().default(0),
  totalPaise: int("total_paise").notNull(),
  couponCode: varchar("coupon_code", { length: 64 }),
  discountPaise: int("discount_paise").notNull().default(0),
  razorpayOrderId: varchar("razorpay_order_id", { length: 80 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 80 }),
  razorpaySignature: varchar("razorpay_signature", { length: 128 }),
  refundId: varchar("refund_id", { length: 80 }),
  refundReason: varchar("refund_reason", { length: 300 }),
  stockRestoredAt: datetime("stock_restored_at", { mode: "string" }),
  courierName: varchar("courier_name", { length: 100 }).notNull().default(""),
  trackingNumber: varchar("tracking_number", { length: 120 }).notNull().default(""),
  trackingUrl: varchar("tracking_url", { length: 500 }).notNull().default(""),
  shippedAt: datetime("shipped_at", { mode: "string" }),
  deliveredAt: datetime("delivered_at", { mode: "string" }),
  adminNotificationStatus: mysqlEnum("admin_notification_status", ["pending", "sent", "failed", "not_configured"]).notNull().default("pending"),
  adminNotifiedAt: datetime("admin_notified_at", { mode: "string" }),
  expiresAt: datetime("expires_at", { mode: "string" }),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("orders_number_unique").on(table.orderNumber), uniqueIndex("orders_razorpay_order_unique").on(table.razorpayOrderId), uniqueIndex("orders_razorpay_payment_unique").on(table.razorpayPaymentId), index("orders_status_created_idx").on(table.status, table.createdAt), index("orders_customer_created_idx").on(table.email, table.createdAt)]);

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  variantId: int("variant_id").notNull().references(() => productVariants.id),
  productName: varchar("product_name", { length: 140 }).notNull(),
  size: varchar("size", { length: 20 }).notNull(),
  quantity: int("quantity").notNull(),
  unitPricePaise: int("unit_price_paise").notNull(),
  totalPaise: int("total_paise").notNull(),
}, (table) => [index("order_items_order_idx").on(table.orderId)]);

export const coupons = mysqlTable("coupons", {
  id: varchar("id", { length: 36 }).primaryKey(),
  code: varchar("code", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["percentage", "fixed"]).notNull(),
  value: int("value").notNull(),
  minOrderPaise: int("min_order_paise").notNull().default(0),
  maxDiscountPaise: int("max_discount_paise"),
  startsAt: datetime("starts_at", { mode: "string" }),
  endsAt: datetime("ends_at", { mode: "string" }),
  usageLimit: int("usage_limit"),
  usageCount: int("usage_count").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("coupons_code_unique").on(table.code), index("coupons_active_idx").on(table.active, table.endsAt)]);

export const wishlistItems = mysqlTable("wishlist_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  createdAt,
}, (table) => [uniqueIndex("wishlist_user_product_unique").on(table.userId, table.productId)]);

export const productReviews = mysqlTable("product_reviews", {
  id: varchar("id", { length: 36 }).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  name: varchar("name", { length: 120 }).notNull(),
  rating: int("rating").notNull(),
  body: text("body").notNull(),
  photoUrl: varchar("photo_url", { length: 500 }),
  status: mysqlEnum("status", ["pending", "published", "rejected"]).notNull().default("pending"),
  createdAt,
}, (table) => [index("product_reviews_listing_idx").on(table.productId, table.status, table.createdAt)]);

export const restockSubscriptions = mysqlTable("restock_subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 180 }).notNull(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  variantId: int("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  notifiedAt: datetime("notified_at", { mode: "string" }),
  createdAt,
}, (table) => [uniqueIndex("restock_email_variant_unique").on(table.email, table.productId, table.variantId)]);

export const pincodeRules = mysqlTable("pincode_rules", {
  id: int("id").autoincrement().primaryKey(),
  pincode: varchar("pincode", { length: 6 }).notNull(),
  serviceable: boolean("serviceable").notNull().default(true),
  shippingPaise: int("shipping_paise"),
  deliveryDaysMin: int("delivery_days_min"),
  deliveryDaysMax: int("delivery_days_max"),
  note: varchar("note", { length: 300 }).notNull().default(""),
  updatedAt,
}, (table) => [uniqueIndex("pincode_rules_pincode_unique").on(table.pincode)]);
