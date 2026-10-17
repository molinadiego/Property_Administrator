-- Least-privilege grants for the runtime role `app`
-- (docs/especificacion/etapa-1.md §2.6, matriz de permisos escenario #23).
--
-- The app connects as `app` (APP_DATABASE_URL), never as the migrator.
-- audit_log must be append-only at the database level: no UPDATE/DELETE.

GRANT USAGE ON SCHEMA public TO app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app;

-- Future tables created by the migrator get the same base grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app;

-- Append-only: the runtime role cannot modify or remove audit entries.
REVOKE UPDATE, DELETE ON audit_log FROM app;

-- Note: tables created by future migrations that must also be append-only
-- need an explicit REVOKE here (or in their own migration).
