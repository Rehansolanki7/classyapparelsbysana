CREATE TABLE `instagram_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instagram_media_id` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`media_type` text DEFAULT 'IMAGE' NOT NULL,
	`image_key` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`permalink` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`imported_product_id` text,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instagram_imports_media_unique` ON `instagram_imports` (`instagram_media_id`);--> statement-breakpoint
CREATE INDEX `instagram_imports_status_idx` ON `instagram_imports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` integer NOT NULL,
	`product_name` text NOT NULL,
	`size` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_paise` integer NOT NULL,
	`total_paise` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`status` text DEFAULT 'pending_payment' NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`customer_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`address_line_1` text NOT NULL,
	`address_line_2` text DEFAULT '' NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`postal_code` text NOT NULL,
	`subtotal_paise` integer NOT NULL,
	`shipping_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer NOT NULL,
	`razorpay_order_id` text,
	`razorpay_payment_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_razorpay_order_unique` ON `orders` (`razorpay_order_id`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`url` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_images_product_idx` ON `product_images` (`product_id`,`position`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`size` text NOT NULL,
	`sku` text NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`reserved_stock` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_sku_unique` ON `product_variants` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_product_size_unique` ON `product_variants` (`product_id`,`size`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price_paise` integer DEFAULT 0 NOT NULL,
	`compare_at_paise` integer,
	`category` text DEFAULT '3-piece sets' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`fabric` text DEFAULT '' NOT NULL,
	`includes` text DEFAULT '' NOT NULL,
	`care` text DEFAULT '' NOT NULL,
	`primary_image` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`instagram_media_id` text,
	`instagram_permalink` text,
	`featured` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_instagram_media_unique` ON `products` (`instagram_media_id`);--> statement-breakpoint
CREATE INDEX `products_status_featured_idx` ON `products` (`status`,`featured`);
--> statement-breakpoint
INSERT INTO `products` (`id`, `slug`, `name`, `subtitle`, `description`, `price_paise`, `compare_at_paise`, `category`, `status`, `color`, `fabric`, `includes`, `care`, `primary_image`, `source`, `featured`) VALUES
('sea-mist-set', 'sea-mist-3-piece-suit-set', 'Sea Mist 3-Piece Suit Set', 'The first Sana edit', 'A soft aqua three-piece set with whimsical florals, appliqué details and a statement printed dupatta. Easy to dress up, effortless to live in.', 249900, 289900, '3-piece sets', 'active', 'Aqua', 'Confirm in admin', 'Kurta, trousers and printed dupatta', 'Gentle hand wash separately in cold water. Dry in shade.', '/products/sea-mist-01.webp', 'manual', 1);
--> statement-breakpoint
INSERT INTO `product_images` (`product_id`, `url`, `alt`, `position`) VALUES
('sea-mist-set', '/products/sea-mist-01.webp', 'Sea Mist three-piece suit set, full front view', 0),
('sea-mist-set', '/products/sea-mist-02.webp', 'Model wearing the Sea Mist three-piece suit set', 1),
('sea-mist-set', '/products/sea-mist-03.webp', 'Sea Mist suit neckline and sleeve detail', 2),
('sea-mist-set', '/products/sea-mist-04.webp', 'Sea Mist three-piece suit with dupatta', 3),
('sea-mist-set', '/products/sea-mist-05.webp', 'Sea Mist suit floral hem detail', 4),
('sea-mist-set', '/products/sea-mist-06.webp', 'Sea Mist suit full-length detail', 5),
('sea-mist-set', '/products/sea-mist-07.webp', 'Sea Mist suit alternate full front view', 6);
--> statement-breakpoint
INSERT INTO `product_variants` (`product_id`, `size`, `sku`, `stock`, `reserved_stock`, `active`) VALUES
('sea-mist-set', 'S', 'CAS-SEA-S', 3, 0, 1),
('sea-mist-set', 'M', 'CAS-SEA-M', 5, 0, 1),
('sea-mist-set', 'L', 'CAS-SEA-L', 5, 0, 1),
('sea-mist-set', 'XL', 'CAS-SEA-XL', 4, 0, 1),
('sea-mist-set', 'XXL', 'CAS-SEA-XXL', 3, 0, 1),
('sea-mist-set', 'XXXL', 'CAS-SEA-XXXL', 2, 0, 1),
('sea-mist-set', '4XL', 'CAS-SEA-4XL', 1, 0, 1);
