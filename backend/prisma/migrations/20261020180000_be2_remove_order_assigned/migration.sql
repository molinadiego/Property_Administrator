-- BE-2: retiro del estado `assigned` de `OrderStatus` (spec
-- docs/especificacion/be-2-orden-status-assigned.md §2, R1/R2).
-- PostgreSQL no admite DROP VALUE sobre enums: se recrea el tipo.
-- Sin pérdida de datos (§1.1.8): solo reclasificación de un estado que
-- ningún flujo de la API produjo.

-- 1) Reclasificación de filas existentes (solo BDs preexistentes):
--    con job iniciado, «En curso» en los hechos (§20.1); el resto, «Enviada».
UPDATE orders o
   SET status = 'in_progress', updated_at = now()
 WHERE o.status = 'assigned'
   AND EXISTS (SELECT 1 FROM jobs j WHERE j.order_id = o.id AND j.started_at IS NOT NULL);

UPDATE orders
   SET status = 'open', updated_at = now()
 WHERE status = 'assigned';

-- 2) Recreación del tipo (PostgreSQL no admite DROP VALUE en enums).
--    El default 'open' tipado como tipo viejo no se castea solo: se quita y
--    se re-agrega sobre el tipo nuevo.
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM
  ('requested', 'open', 'in_progress', 'completed', 'cancelled');
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
ALTER TABLE orders
  ALTER COLUMN status TYPE "OrderStatus" USING status::text::"OrderStatus";
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'open';
DROP TYPE "OrderStatus_old";
