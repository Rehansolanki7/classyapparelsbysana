ALTER TABLE products ADD COLUMN sort_order int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX products_sort_order_idx ON products (sort_order);
