ALTER TABLE storefront_settings ADD COLUMN featured_product_id varchar(36) NOT NULL DEFAULT '' AFTER promotion_cta_href;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN featured_kicker varchar(80) NOT NULL DEFAULT 'Just arrived' AFTER featured_product_id;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN featured_hero_image_url varchar(500) NOT NULL DEFAULT '' AFTER featured_kicker;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN collection_kicker varchar(80) NOT NULL DEFAULT 'New arrival' AFTER featured_hero_image_url;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN collection_heading varchar(240) NOT NULL DEFAULT 'Made to be noticed. Easy enough for every day.' AFTER collection_kicker;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN collection_body varchar(800) NOT NULL DEFAULT 'Our drops are intentionally small. Each piece is photographed honestly so you can see the colour, fall and finishing before you choose.' AFTER collection_heading;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN detail_kicker varchar(80) NOT NULL DEFAULT 'The detail edit' AFTER collection_body;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN detail_heading varchar(240) NOT NULL DEFAULT 'Thoughtful details, seen up close.' AFTER detail_kicker;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN detail_body varchar(800) NOT NULL DEFAULT '' AFTER detail_heading;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN detail_primary_image_url varchar(500) NOT NULL DEFAULT '' AFTER detail_body;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN detail_secondary_image_url varchar(500) NOT NULL DEFAULT '' AFTER detail_primary_image_url;
