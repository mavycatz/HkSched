-- 002_add_audit_metadata: optional JSON metadata on audit logs (additive)
ALTER TABLE audit_logs ADD COLUMN metadata JSONB;
