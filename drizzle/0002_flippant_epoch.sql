ALTER TABLE `orders` ADD `formatted_address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_place_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_latitude` real;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_longitude` real;--> statement-breakpoint
ALTER TABLE `orders` ADD `admin_notification_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `admin_notified_at` text;