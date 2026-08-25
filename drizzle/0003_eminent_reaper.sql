ALTER TABLE `orders` ADD `courier_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `tracking_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `tracking_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipped_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivered_at` text;