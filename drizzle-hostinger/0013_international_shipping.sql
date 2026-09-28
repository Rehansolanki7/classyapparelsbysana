CREATE TABLE IF NOT EXISTS international_shipping_rates (
  id int AUTO_INCREMENT NOT NULL,
  country_code varchar(2) NOT NULL,
  price_per_500g_paise int NOT NULL,
  delivery_days_min int NOT NULL DEFAULT 7,
  delivery_days_max int NOT NULL DEFAULT 15,
  courier_name varchar(100) NOT NULL DEFAULT '',
  serviceable boolean NOT NULL DEFAULT true,
  last_reviewed_at datetime NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT international_shipping_rates_id PRIMARY KEY (id),
  CONSTRAINT international_shipping_rates_country_unique UNIQUE (country_code)
);
--> statement-breakpoint
CREATE INDEX international_shipping_rates_active_idx ON international_shipping_rates (serviceable, country_code);
