ALTER TABLE email_otps MODIFY COLUMN purpose enum('sign_in','recovery','privacy_delete','admin_access') NOT NULL;
