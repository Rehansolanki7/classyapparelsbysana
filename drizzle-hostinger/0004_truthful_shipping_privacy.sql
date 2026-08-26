ALTER TABLE users ADD COLUMN session_version int NOT NULL DEFAULT 0 AFTER last_login_at;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN inactivity_notice_sent_at datetime NULL AFTER session_version;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN marketing_suppressed_at datetime NULL AFTER inactivity_notice_sent_at;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN packed_weight_grams int NOT NULL DEFAULT 0 AFTER primary_image;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN legal_hold boolean NOT NULL DEFAULT false AFTER stock_restored_at;
--> statement-breakpoint
ALTER TABLE email_otps MODIFY COLUMN purpose enum('sign_in','recovery','privacy_delete') NOT NULL;
--> statement-breakpoint
ALTER TABLE pincode_rules ADD COLUMN zone enum('mumbai_local','maharashtra','rest_of_india') NULL AFTER pincode;
--> statement-breakpoint
ALTER TABLE pincode_rules ADD COLUMN manual_quote_required boolean NOT NULL DEFAULT false AFTER shipping_paise;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN promotion_text varchar(160) NOT NULL DEFAULT 'A considered collection, chosen with care.' AFTER announcement_secondary;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN promotion_cta_label varchar(80) NOT NULL DEFAULT 'Explore the collection' AFTER promotion_text;
--> statement-breakpoint
ALTER TABLE storefront_settings ADD COLUMN promotion_cta_href varchar(240) NOT NULL DEFAULT '/shop' AFTER promotion_cta_label;
--> statement-breakpoint
UPDATE storefront_settings
SET promotion_text = 'A considered collection, chosen with care.',
    promotion_cta_label = 'Explore the collection',
    promotion_cta_href = '/shop',
    announcement_primary = 'A considered collection, chosen with care.',
    announcement_secondary = ''
WHERE id = 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS shipping_rate_cards (
  id int AUTO_INCREMENT NOT NULL,
  zone enum('mumbai_local','maharashtra','rest_of_india') NOT NULL,
  weight_limit_grams int NOT NULL,
  carrier_charge_paise int NOT NULL,
  delivery_days_min int NOT NULL DEFAULT 4,
  delivery_days_max int NOT NULL DEFAULT 8,
  serviceable boolean NOT NULL DEFAULT true,
  last_reviewed_at datetime NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT shipping_rate_cards_id PRIMARY KEY (id),
  CONSTRAINT shipping_rate_cards_zone_weight_unique UNIQUE (zone, weight_limit_grams)
);
--> statement-breakpoint
CREATE INDEX shipping_rate_cards_zone_idx ON shipping_rate_cards (zone, serviceable, weight_limit_grams);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS privacy_requests (
  id varchar(36) NOT NULL,
  requester_user_id varchar(36) NOT NULL,
  email varchar(180) NOT NULL,
  email_hash varchar(64) NOT NULL,
  status enum('pending','completed','retry','failed') NOT NULL DEFAULT 'pending',
  verified_at datetime NOT NULL,
  completed_at datetime NULL,
  last_error_code varchar(80) NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT privacy_requests_id PRIMARY KEY (id)
);
--> statement-breakpoint
CREATE INDEX privacy_requests_status_created_idx ON privacy_requests (status, created_at);
--> statement-breakpoint
CREATE INDEX privacy_requests_user_idx ON privacy_requests (requester_user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS retention_actions (
  id int AUTO_INCREMENT NOT NULL,
  action varchar(80) NOT NULL,
  entity_type varchar(60) NOT NULL,
  entity_id varchar(120) NOT NULL,
  status enum('completed','skipped','failed') NOT NULL,
  detail varchar(240) NOT NULL DEFAULT '',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT retention_actions_id PRIMARY KEY (id)
);
--> statement-breakpoint
CREATE INDEX retention_actions_recent_idx ON retention_actions (created_at);
--> statement-breakpoint
CREATE INDEX retention_actions_entity_idx ON retention_actions (entity_type, entity_id);
--> statement-breakpoint
INSERT IGNORE INTO shipping_rate_cards (zone, weight_limit_grams, carrier_charge_paise, delivery_days_min, delivery_days_max, serviceable, last_reviewed_at) VALUES
  ('mumbai_local', 500, 2800, 2, 4, true, CURRENT_TIMESTAMP),
  ('mumbai_local', 1000, 4800, 2, 4, true, CURRENT_TIMESTAMP),
  ('mumbai_local', 1500, 6000, 2, 4, true, CURRENT_TIMESTAMP),
  ('mumbai_local', 2000, 8700, 2, 4, true, CURRENT_TIMESTAMP),
  ('mumbai_local', 3000, 11600, 2, 5, true, CURRENT_TIMESTAMP),
  ('mumbai_local', 4000, 14500, 2, 5, true, CURRENT_TIMESTAMP),
  ('mumbai_local', 5000, 17400, 2, 5, true, CURRENT_TIMESTAMP),
  ('maharashtra', 500, 6500, 3, 6, true, CURRENT_TIMESTAMP),
  ('maharashtra', 1000, 9100, 3, 6, true, CURRENT_TIMESTAMP),
  ('maharashtra', 1500, 11700, 3, 6, true, CURRENT_TIMESTAMP),
  ('maharashtra', 2000, 16000, 3, 6, true, CURRENT_TIMESTAMP),
  ('maharashtra', 3000, 21900, 3, 7, true, CURRENT_TIMESTAMP),
  ('maharashtra', 4000, 26800, 3, 7, true, CURRENT_TIMESTAMP),
  ('maharashtra', 5000, 32400, 3, 7, true, CURRENT_TIMESTAMP),
  ('rest_of_india', 500, 7200, 4, 8, true, CURRENT_TIMESTAMP),
  ('rest_of_india', 1000, 11400, 4, 8, true, CURRENT_TIMESTAMP),
  ('rest_of_india', 1500, 17100, 4, 9, true, CURRENT_TIMESTAMP),
  ('rest_of_india', 2000, 23900, 4, 9, true, CURRENT_TIMESTAMP),
  ('rest_of_india', 3000, 33700, 5, 10, true, CURRENT_TIMESTAMP),
  ('rest_of_india', 4000, 42000, 5, 10, true, CURRENT_TIMESTAMP),
  ('rest_of_india', 5000, 51500, 5, 10, true, CURRENT_TIMESTAMP);
