ALTER TABLE users ADD COLUMN password_hash varchar(255) NULL AFTER name;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN last_login_at datetime NULL AFTER email_verified_at;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS addresses (
  id varchar(36) NOT NULL,
  user_id varchar(36) NOT NULL,
  label varchar(40) NOT NULL DEFAULT 'Home',
  recipient_name varchar(120) NOT NULL,
  phone varchar(20) NOT NULL,
  address_line_1 varchar(220) NOT NULL,
  address_line_2 varchar(220) NOT NULL DEFAULT '',
  city varchar(100) NOT NULL,
  state varchar(100) NOT NULL,
  country_code varchar(2) NOT NULL DEFAULT 'IN',
  postal_code varchar(20) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT addresses_id PRIMARY KEY (id),
  CONSTRAINT addresses_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX addresses_user_default_idx ON addresses (user_id, is_default, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS system_events (
  id int AUTO_INCREMENT NOT NULL,
  severity enum('info','warning','error','security') NOT NULL,
  event_type varchar(80) NOT NULL,
  actor_id varchar(36),
  entity_type varchar(60),
  entity_id varchar(120),
  detail varchar(500) NOT NULL DEFAULT '',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT system_events_id PRIMARY KEY (id)
);
--> statement-breakpoint
CREATE INDEX system_events_recent_idx ON system_events (created_at);
--> statement-breakpoint
CREATE INDEX system_events_type_idx ON system_events (event_type, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS storefront_settings (
  id int NOT NULL,
  announcement_primary varchar(160) NOT NULL DEFAULT 'A considered collection, chosen with care.',
  announcement_secondary varchar(160) NOT NULL DEFAULT '',
  hero_kicker varchar(160) NOT NULL DEFAULT 'Boutique pieces · selected in Mumbai',
  hero_heading varchar(160) NOT NULL DEFAULT 'Wear the moment.',
  hero_accent varchar(160) NOT NULL DEFAULT 'Keep the feeling.',
  hero_body varchar(500) NOT NULL DEFAULT 'Limited, considered pieces for women who love colour, comfort and a little quiet drama.',
  story_heading varchar(160) NOT NULL DEFAULT 'Fashion should feel personal.',
  story_body varchar(800) NOT NULL DEFAULT 'Classy Apparels by Sana began as an Instagram boutique built around a simple idea: share lovely pieces honestly, answer every sizing question with care, and make shopping feel like talking to someone you trust.',
  newsletter_heading varchar(160) NOT NULL DEFAULT 'First look at every new drop.',
  newsletter_body varchar(500) NOT NULL DEFAULT 'Message “JOIN” on WhatsApp for launch alerts, restocks and private previews.',
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT storefront_settings_id PRIMARY KEY (id)
);
--> statement-breakpoint
INSERT INTO storefront_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id;
