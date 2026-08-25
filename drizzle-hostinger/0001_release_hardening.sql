DELETE duplicate_image
FROM product_images duplicate_image
INNER JOIN product_images original_image
  ON duplicate_image.product_id = original_image.product_id
  AND duplicate_image.url = original_image.url
  AND duplicate_image.id > original_image.id;
--> statement-breakpoint
ALTER TABLE product_images ADD CONSTRAINT product_images_product_url_unique UNIQUE (product_id, url);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN razorpay_signature varchar(128) NULL AFTER razorpay_payment_id;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN stock_restored_at datetime NULL AFTER refund_reason;
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_razorpay_payment_unique UNIQUE (razorpay_payment_id);
