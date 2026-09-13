ALTER TABLE orders ADD COLUMN customer_note varchar(1000) NOT NULL DEFAULT '' AFTER address_line_2;
