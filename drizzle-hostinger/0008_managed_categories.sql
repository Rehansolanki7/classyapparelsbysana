CREATE TABLE `categories` (
  `id` varchar(36) NOT NULL,
  `name` varchar(80) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `active` boolean NOT NULL DEFAULT true,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `categories_id` PRIMARY KEY(`id`),
  CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `categories_active_sort_idx` ON `categories` (`active`,`sort_order`);
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `category_id` varchar(36) NULL AFTER `compare_at_paise`;
--> statement-breakpoint
CREATE INDEX `products_category_status_idx` ON `products` (`category_id`,`status`);
--> statement-breakpoint
INSERT INTO `categories` (`id`, `name`, `slug`, `sort_order`, `active`)
VALUES ('category-3-piece-sets', '3-piece sets', '3-piece-sets', 0, true)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `active` = VALUES(`active`);
--> statement-breakpoint
INSERT IGNORE INTO `categories` (`id`, `name`, `slug`, `sort_order`, `active`)
SELECT
  CONCAT('legacy-', LEFT(MD5(LOWER(`legacy_category`)), 24)),
  `legacy_category`,
  CONCAT('legacy-', LEFT(MD5(LOWER(`legacy_category`)), 12)),
  100,
  true
FROM (
  SELECT DISTINCT TRIM(`category`) AS `legacy_category`
  FROM `products`
  WHERE TRIM(`category`) <> '' AND LOWER(TRIM(`category`)) <> '3-piece sets'
) AS `legacy_categories`;
--> statement-breakpoint
UPDATE `products`
SET `category_id` = CASE
  WHEN TRIM(`category`) = '' OR LOWER(TRIM(`category`)) = '3-piece sets' THEN 'category-3-piece-sets'
  ELSE CONCAT('legacy-', LEFT(MD5(LOWER(TRIM(`category`))), 24))
END
WHERE `category_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
