ALTER TABLE orders ADD COLUMN country_code varchar(2) NOT NULL DEFAULT 'IN' AFTER state;
--> statement-breakpoint
ALTER TABLE orders MODIFY COLUMN postal_code varchar(20) NOT NULL;
