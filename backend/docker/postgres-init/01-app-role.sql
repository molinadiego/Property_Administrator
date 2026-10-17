-- Runtime role for the application (spec etapa-1.md §2.6 / matriz #23):
-- the app must NOT be able to UPDATE/DELETE rows in audit_log. The
-- least-privilege grants live in the migration etapa1_audit_grants; this
-- script only creates the role (runs on first boot of the dev database).
CREATE ROLE app LOGIN PASSWORD 'app_dev';
