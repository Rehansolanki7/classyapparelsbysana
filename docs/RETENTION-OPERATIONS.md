# Retention operations

Set a unique `RETENTION_JOB_SECRET` in Hostinger and schedule a daily HTTPS `POST` to `/api/jobs/retention` with `Authorization: Bearer <RETENTION_JOB_SECRET>`. The endpoint is intentionally inaccessible without that secret.

The job deletes expired/used OTPs after 24 hours, unpaid checkout records after 30 days (unless legal hold is enabled), security events after 90 days, and completed deletion-request records after 30 days. It emails inactive customers after 23 months and removes non-order account data after 24 months only after that notice has been sent for 30 days.

Configure Hostinger/application log retention to 30 days and use the minimum provider backup period that supports disaster recovery. Verify the exact hosting controls in the production account before launch; application code cannot change provider log or backup retention.

Paid orders, payment references and delivery records are deliberately not removed by this job. Confirm the seven-financial-year accounting retention with the business CA before launch. Use the `orders.legal_hold` flag for a dispute, investigation or legal hold.
