ALTER TABLE `categories` ADD COLUMN `show_on_homepage` boolean NOT NULL DEFAULT true AFTER `active`;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `has_sizes` boolean NOT NULL DEFAULT true AFTER `featured`;
