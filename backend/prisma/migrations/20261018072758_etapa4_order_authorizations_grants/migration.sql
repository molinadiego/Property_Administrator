-- Least-privilege grants for the runtime role `app`, Etapa 4
-- (docs/especificacion/etapa-4.md §2.7, §7).
--
-- order_authorizations is append-only at the database level: the app records
-- who authorized what (on the platform or by telephone, §18.1) but can never
-- rewrite or remove a constancia (proyect.md §1.1.8, §12 — conservar
-- autorizaciones sin borrados silenciosos).

REVOKE UPDATE, DELETE ON order_authorizations FROM app;
