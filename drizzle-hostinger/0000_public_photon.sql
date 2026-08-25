CREATE TABLE `coupons` (
	`id` varchar(36) NOT NULL,
	`code` varchar(64) NOT NULL,
	`type` enum('percentage','fixed') NOT NULL,
	`value` int NOT NULL,
	`min_order_paise` int NOT NULL DEFAULT 0,
	`max_discount_paise` int,
	`starts_at` datetime,
	`ends_at` datetime,
	`usage_limit` int,
	`usage_count` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `email_otps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(180) NOT NULL,
	`purpose` enum('sign_in','recovery') NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `email_otps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `instagram_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instagram_media_id` varchar(80) NOT NULL,
	`caption` text NOT NULL DEFAULT (''),
	`media_type` varchar(20) NOT NULL DEFAULT 'IMAGE',
	`image_key` varchar(300) NOT NULL DEFAULT '',
	`source_url` varchar(500) NOT NULL DEFAULT '',
	`permalink` varchar(500) NOT NULL DEFAULT '',
	`status` enum('pending','imported','ignored') NOT NULL DEFAULT 'pending',
	`imported_product_id` varchar(36),
	`published_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `instagram_imports_id` PRIMARY KEY(`id`),
	CONSTRAINT `instagram_imports_media_unique` UNIQUE(`instagram_media_id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`variant_id` int NOT NULL,
	`product_name` varchar(140) NOT NULL,
	`size` varchar(20) NOT NULL,
	`quantity` int NOT NULL,
	`unit_price_paise` int NOT NULL,
	`total_paise` int NOT NULL,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(36) NOT NULL,
	`order_number` varchar(32) NOT NULL,
	`status` enum('pending_payment','paid','processing','shipped','delivered','cancelled','payment_failed','refund_pending','refunded') NOT NULL DEFAULT 'pending_payment',
	`payment_status` enum('pending','verified','captured','failed','refunded') NOT NULL DEFAULT 'pending',
	`customer_name` varchar(120) NOT NULL,
	`email` varchar(180) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`address_line_1` varchar(220) NOT NULL,
	`address_line_2` varchar(220) NOT NULL DEFAULT '',
	`city` varchar(100) NOT NULL,
	`state` varchar(100) NOT NULL,
	`postal_code` varchar(10) NOT NULL,
	`formatted_address` varchar(400) NOT NULL DEFAULT '',
	`delivery_place_id` varchar(220) NOT NULL DEFAULT '',
	`delivery_latitude` varchar(30),
	`delivery_longitude` varchar(30),
	`subtotal_paise` int NOT NULL,
	`shipping_paise` int NOT NULL DEFAULT 0,
	`total_paise` int NOT NULL,
	`coupon_code` varchar(64),
	`discount_paise` int NOT NULL DEFAULT 0,
	`razorpay_order_id` varchar(80),
	`razorpay_payment_id` varchar(80),
	`refund_id` varchar(80),
	`refund_reason` varchar(300),
	`courier_name` varchar(100) NOT NULL DEFAULT '',
	`tracking_number` varchar(120) NOT NULL DEFAULT '',
	`tracking_url` varchar(500) NOT NULL DEFAULT '',
	`shipped_at` datetime,
	`delivered_at` datetime,
	`admin_notification_status` enum('pending','sent','failed','not_configured') NOT NULL DEFAULT 'pending',
	`admin_notified_at` datetime,
	`expires_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_number_unique` UNIQUE(`order_number`),
	CONSTRAINT `orders_razorpay_order_unique` UNIQUE(`razorpay_order_id`)
);
--> statement-breakpoint
CREATE TABLE `pincode_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pincode` varchar(6) NOT NULL,
	`serviceable` boolean NOT NULL DEFAULT true,
	`shipping_paise` int,
	`delivery_days_min` int,
	`delivery_days_max` int,
	`note` varchar(300) NOT NULL DEFAULT '',
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `pincode_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `pincode_rules_pincode_unique` UNIQUE(`pincode`)
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`url` varchar(500) NOT NULL,
	`alt` varchar(240) NOT NULL DEFAULT '',
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `product_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_reviews` (
	`id` varchar(36) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`name` varchar(120) NOT NULL,
	`rating` int NOT NULL,
	`body` text NOT NULL,
	`photo_url` varchar(500),
	`status` enum('pending','published','rejected') NOT NULL DEFAULT 'pending',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `product_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`size` varchar(20) NOT NULL,
	`sku` varchar(100) NOT NULL,
	`stock` int NOT NULL DEFAULT 0,
	`reserved_stock` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_variants_sku_unique` UNIQUE(`sku`),
	CONSTRAINT `product_variants_product_size_unique` UNIQUE(`product_id`,`size`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(150) NOT NULL,
	`name` varchar(140) NOT NULL,
	`subtitle` varchar(160) NOT NULL DEFAULT '',
	`description` text NOT NULL DEFAULT (''),
	`price_paise` int NOT NULL DEFAULT 0,
	`compare_at_paise` int,
	`category` varchar(80) NOT NULL DEFAULT '3-piece sets',
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`color` varchar(80) NOT NULL DEFAULT '',
	`fabric` varchar(160) NOT NULL DEFAULT '',
	`includes` varchar(300) NOT NULL DEFAULT '',
	`care` varchar(500) NOT NULL DEFAULT '',
	`primary_image` varchar(500) NOT NULL DEFAULT '',
	`source` enum('manual','instagram') NOT NULL DEFAULT 'manual',
	`instagram_media_id` varchar(80),
	`instagram_permalink` varchar(500),
	`featured` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `products_instagram_media_unique` UNIQUE(`instagram_media_id`)
);
--> statement-breakpoint
CREATE TABLE `restock_subscriptions` (
	`id` varchar(36) NOT NULL,
	`email` varchar(180) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`variant_id` int,
	`notified_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `restock_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `restock_email_variant_unique` UNIQUE(`email`,`product_id`,`variant_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(180) NOT NULL,
	`name` varchar(120) NOT NULL DEFAULT '',
	`role` enum('owner','admin','customer') NOT NULL DEFAULT 'customer',
	`email_verified_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `wishlist_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `wishlist_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `wishlist_user_product_unique` UNIQUE(`user_id`,`product_id`)
);
--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_variant_id_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `restock_subscriptions` ADD CONSTRAINT `restock_subscriptions_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `restock_subscriptions` ADD CONSTRAINT `restock_subscriptions_variant_id_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wishlist_items` ADD CONSTRAINT `wishlist_items_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wishlist_items` ADD CONSTRAINT `wishlist_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `coupons_active_idx` ON `coupons` (`active`,`ends_at`);--> statement-breakpoint
CREATE INDEX `email_otps_lookup_idx` ON `email_otps` (`email`,`purpose`,`expires_at`);--> statement-breakpoint
CREATE INDEX `instagram_imports_status_idx` ON `instagram_imports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_customer_created_idx` ON `orders` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_images_product_idx` ON `product_images` (`product_id`,`position`);--> statement-breakpoint
CREATE INDEX `product_reviews_listing_idx` ON `product_reviews` (`product_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `products_status_featured_idx` ON `products` (`status`,`featured`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);