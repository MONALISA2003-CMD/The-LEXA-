-- Read-only production inspection; no DDL or writes. Execute using an approved
-- database read-only connection. Do not print tenant or user data.
SELECT COUNT(*) AS migrations,
       COUNT(*) FILTER (WHERE finished_at IS NOT NULL) AS applied,
       COUNT(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS rolled_back,
       COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS unresolved
FROM public._prisma_migrations;

SELECT r.rolname, r.rolcanlogin, r.rolbypassrls, r.rolsuper
FROM pg_roles r WHERE r.rolname IN ('lexa_app','lexa_app_runtime');

SELECT COUNT(*) AS tables,
       COUNT(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled,
       COUNT(*) FILTER (WHERE c.relforcerowsecurity) AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r';

SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
ORDER BY relname;

SELECT COUNT(*) AS heartbeat_rows,
       COUNT(*) FILTER (WHERE last_seen_at>now()-interval '60 seconds') AS recent_heartbeats,
       COUNT(*) FILTER (WHERE status='healthy' AND last_seen_at>now()-interval '60 seconds') AS healthy_workers
FROM platform_worker_heartbeats;

SELECT status, COUNT(*) AS jobs FROM platform_jobs GROUP BY status ORDER BY status;
SELECT outbox_status,COUNT(*) AS events FROM module_domain_events GROUP BY outbox_status ORDER BY outbox_status;
SELECT status, COUNT(*) AS deliveries FROM notification_email_deliveries GROUP BY status ORDER BY status;
SELECT status, COUNT(*) AS attachments FROM platform_attachments GROUP BY status ORDER BY status;
