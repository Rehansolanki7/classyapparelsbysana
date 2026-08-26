ALTER TABLE orders ADD COLUMN restock_requested boolean NOT NULL DEFAULT false AFTER refund_reason;
