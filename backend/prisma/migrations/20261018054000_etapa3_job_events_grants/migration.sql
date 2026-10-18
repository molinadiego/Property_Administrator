-- Least-privilege grants for the runtime role `app`, Etapa 3
-- (docs/especificacion/etapa-3.md §2.5, matriz de permisos #49).
--
-- job_events is append-only at the database level: the app records progress
-- notes and reasons but can never rewrite or remove them (proyect.md §1.1.8,
-- §7 — conservar el historial sin borrados silenciosos).

REVOKE UPDATE, DELETE ON job_events FROM app;
