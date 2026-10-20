# Especificación técnica — BE-2 (retiro del estado `assigned` de órdenes)

Documento de implementación de **BE-2**: eliminar `assigned` de `OrderStatus`,
el estado muerto de `orders` detectado como observación en BE-1
(`docs/especificacion/be-1-filtros-ordenes.md`, §10 AC-BE1.x y nota de
`MEMORY.md` §1). Ningún endpoint lo produce: `create` pone `open`,
`assign`/`reassign`/`accept`/`reject`/`revoke` no tocan el estado de la orden,
`start` va a `in_progress` y `close`/`cancel` a `completed`/`cancelled`; solo
el seed y las fixtures e2e lo seteaban vía SQL directo.

Decisión del dueño (20/10/2026): **quitarlo con migración dura** — ni
implementarlo como transición nueva ni congelarlo como valor legacy. La
intención es alinear BD, API y contratos exactamente con `proyect.md` §20.1,
que no contempla un paso «Asignada» a nivel de orden.

Extiende los contratos de la Etapa 2 (`docs/especificacion/etapa-2.md`) y de
BE-1 (`docs/especificacion/be-1-filtros-ordenes.md`); las convenciones de API,
el patrón de errores y las reglas de tenancy se referencian, no se copian. Las
referencias (§x) apuntan a `proyect.md`.

Base normativa: §20.1 (máquina de estados de la orden), §20.2 (máquina del
job), §5.6 y §20.3 (aceptación/rechazo a nivel de asignación — enmienda
17/10/2026), §16.1, §16.8, §12.

> **Aprobada el 20/10/2026** por el dueño (spec-driven, `AGENTS.md`);
> incluye la decisión R2 (reclasificación de O_3 a `in_progress`).

---

## 1. Alcance

### 1.1 Entra / queda fuera

**Entra:**

- Migración PostgreSQL que **recrea el enum `OrderStatus`** sin `assigned`
  (PostgreSQL no permite `DROP VALUE` sobre un enum) con reclasificación
  previa de las filas existentes (§2, R2).
- Cambio de `schema.prisma` + regeneración del cliente Prisma: el valor
  desaparece del enum en BD, schema y tipos TypeScript.
- Retiro de `assigned` de toda referencia de código: filtro `status` de BE-1
  (pasa a **422**), doc del DTO, ramas de `job-rules.ts`, seed, fixtures e2e y
  tests unitarios.
- Regeneración del contrato `backend/openapi/openapi.json` y del cliente API
  del frontend (`npm run openapi:generate`).
- **Actualización de specs aprobadas** (autorizada por el dueño al aprobar
  este plan, 20/10/2026): `etapa-2.md` (tabla del enum), `etapa-3.md` (tabla
  del enum y mapeo §20.1, endpoint `cancel`, matriz #27, AC-3.1, AC-3.15) y
  `be-1-filtros-ordenes.md` (§1.1, B1, B4, matriz #6, AC-BE1.1, §11).
- Documentación de cierre: `docs/plan.md` (fila BE-2), `README.md` (tabla y
  estado), `MEMORY.md` §1 (la observación pasa a **resuelta**).

**Queda fuera:**

- **Sin enmienda a `proyect.md`**: §20.1 nunca contempló un paso «Asignada»
  de orden; el paso «Enviada → Aceptada» ya quedó representado a nivel de
  asignación por la enmienda del 17/10/2026 (R5). Si al revisar
  secciones cruzadas apareciera una contradicción nueva, se reporta sin tocar
  el documento.
- El concepto **asignación**: `assignments.*`, `assigned_by`,
  `assignment.reassigned` y el tipo de notificación `order_assigned` (§7,
  §14) son otra entidad — **no se tocan** (§11).
- Estados restantes del enum (`requested`, `open`, `in_progress`,
  `completed`, `cancelled`): sin cambios de significado ni de transiciones.
- Permisos, visibilidad (§2.12) y matriz de la Etapa 2: intactos — esta etapa
  no agrega operaciones (R6).
- Interfaz web: fuera de alcance; el frontend solo regenera tipos (F2 aún no
  consume estados de orden — timing de la decisión).

### 1.2 Decisiones

| # | Decisión |
|---|---|
| **R1** | **Quitar de raíz, no ocultar**: el valor desaparece de BD, schema, API y contratos (migración dura, decisión del dueño 20/10/2026). No queda como legacy documentado ni como rama muerta. |
| **R2** | **Reclasificación en la misma migración**: filas `assigned` con algún job iniciado → `in_progress` («Aceptada → En curso», §20.1: en los hechos ya estaban en curso); el resto → `open` («Enviada»). Solo puede afectar a BDs preexistentes (la local de desarrollo, semilla O_3); las BDs de test/CI se crean vacías. *Nota*: el plan aprobado decía «O_3 → `open`»; al redactar la spec se verificó que O_3 tiene el job J_4 en `in_progress` con asignación aceptada (la asignación pendiente A_2 es de O_2, que ya es `open`), por lo que `in_progress` es el estado coherente — se somete a la aprobación con la spec. |
| **R3** | `status=assigned` → **422** con `detail` que lista los valores válidos (mismo contrato BE-1 §1.1); nunca filtrado parcial ni ignorado en silencio. |
| **R4** | **Sin eventos de audit nuevos**: la migración es DDL + reclasificación de un estado que ningún usuario seteó; §12 exige registro de acciones de usuario y no hay ninguna nueva. |
| **R5** | **Mapeo definitivo §20.1 ↔ enum**: `requested`=Borrador, `open`=Enviada («Aceptada» representada por la asignación aceptada, §5.6/§20.3, enmienda 17/10/2026), `in_progress`=En curso, `completed`=Cerrada, `cancelled`=Cancelada. Supera el mapeo de `etapa-3.md` §2 («`assigned` ≈ Aceptada»), que queda actualizado. |
| **R6** | Sin cambios de permisos ni de visibilidad: los filtros siguen solo estrechando el conjunto de §2.12 (BE-1 §5 intacto) y la validación corre tras el guard (401/404 antes que 422). |

## 2. Modelo de datos

Sin entidades nuevas ni columnas modificadas. Cambia **el enum** de
`orders.status`:

| Antes | Después |
|---|---|
| `requested \| open \| assigned \| in_progress \| completed \| cancelled` | `requested \| open \| in_progress \| completed \| cancelled` |

Migración nueva (nombre propuesto `20261020XXXXXX_be2_remove_order_assigned`),
SQL escrito a mano sobre `prisma migrate dev --create-only`:

```sql
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
--    se re-agrega sobre el tipo nuevo (ajuste de ejecución, ver §12).
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM
  ('requested', 'open', 'in_progress', 'completed', 'cancelled');
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
ALTER TABLE orders
  ALTER COLUMN status TYPE "OrderStatus" USING status::text::"OrderStatus";
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'open';
DROP TYPE "OrderStatus_old";
```

- Solo `orders.status` usa el tipo (verificado en el historial de
  migraciones); el default `'open'` sigue válido tras el cast.
- Todas las sentencias corren dentro de la transacción de la migración.
- **No es una migración destructiva** (§1.1.8): no se pierde ninguna fila ni
  historial; solo se reclasifica un estado que ningún flujo produjo (R2).
- `schema.prisma`: se elimina `assigned` del bloque `enum OrderStatus` y se
  regenera el cliente (`prisma generate`); los errores de compilación TS
  listan todas las referencias restantes (lista guiada, no búsqueda manual).

## 3. Convenciones de la API

Referenciar `docs/especificacion/etapa-1.md` §3 (errores RFC 7807, 422 en
validación, prefijo `/api/v1`) y `docs/especificacion/be-1-filtros-ordenes.md`
§3 (mismo contrato para el filtro `status`). Nada nuevo que agregar.

## 4. Endpoints

| Método | Ruta | Descripción | Permiso | Éxito / Fracaso |
|---|---|---|---|---|
| GET | `/api/v1/companies/{id}/orders?status=` | **Cambio de contrato**: `assigned` deja de ser valor legal del filtro | Igual que BE-1 (guard + §2.12) | 200 / 401 / 404 / **422 cuando `status` contiene `assigned`** |

- **Ningún endpoint nuevo** y ningún otro cambio de comportamiento: nadie
  producía `assigned`, por lo que ninguna respuesta lo emitía hoy.
- El enum `status` del objeto `Order` en el contrato OpenAPI queda con 5
  valores (snapshot regenerado).
- El resto de parámetros (`assignment_status`, filtros, paginación `take:
  100`) sin cambios.

## 5. Reglas de permisos

Sin cambios: no hay operaciones nuevas que verificar (§16.1) ni consultas
nuevas que pasar por el tenant guard (§16.2). La validación del filtro corre
**después** de los guards (patrón BE-1): 401 sin sesión y 404 de espacio
ajeno (§16.8) preceden al 422 del parámetro.

## 6. Matriz de permisos como tests

Convención de códigos: 401 sin sesión, 403 rol insuficiente en la propia
empresa, **404 recurso de otra empresa** (no se filtra existencia ajena).

| # | Escenario | Comportamiento esperado |
|---|---|---|
| 1 | Sin sesión + `status=assigned` | 401 (el guard precede a la validación) |
| 2 | Espacio de otra empresa + `status=assigned` | 404 (§16.8; nunca 422 ni 200) |
| 3 | Sesión válida + `status=assigned` | 422 con `detail` que lista los 5 valores válidos |
| 4 | `status=open,assigned,in_progress` (lista mixta) | 422 completo (R3: nunca filtrado «a medias») |
| 5 | `status=open,in_progress` (lista válida) | 200 solo con esos estados; ninguna orden `assigned` (imposible: sin filas ni valor) |
| 6 | Consulta sin parámetros | 200 idéntico al actual (AC-BE1.6 intacto) |
| 7 | `start` de job aceptado en orden `open` | 204 → orden `in_progress` (rama `open` de `orderStatusAfterJobStart`, sin `assigned`) |
| 8 | `cancel` de orden `open` sin jobs iniciados | 204 → `cancelled` (rama `open` de `canCancelOrder`) |
| 9 | Fixture con `UPDATE ... status='assigned'` + migración aplicada | ninguna fila `assigned` al final: `SELECT DISTINCT status FROM orders` ⊆ los 5 valores |
| 10 | Matrices completas de Etapas 2, 3, 5 y 6 | verdes sin cambios (el retiro no altera ningún otro flujo) |

## 7. Eventos de audit log de la etapa

Ninguno nuevo (R4).

## 8. Pruebas

- **Unitarias (Jest):**
  - `order-filters.spec.ts`: parser/validación sin `assigned` (lista legal de
    5 valores; casos que lo incluían ahora esperan 422 vía DTO) y
    `buildOrderListWhere` con los estados restantes.
  - `job-rules.spec.ts`: `orderStatusAfterJobStart`/`canCancelOrder` sin rama
    `assigned`; `canCloseOrder` probado con los estados reales.
  - `authorization-rules.spec.ts`: `canApproveAdditionalWork` sin `assigned`.
  - `invoice-rules.spec.ts`: fixture `baseOrder` con `orderStatus` real (la
    elegibilidad solo excluye `cancelled`, sin cambio de lógica).
- **Integración (Testcontainers + PostgreSQL real):**
  - `test/be1.e2e-spec.ts`: la fixture `assignedA` (SQL directo) se elimina y
    se agrega el escenario de 422 (§6 #3/#4); la fixture `assignedPendingA`
    se reconstruye **vía API** (orden `in_progress` por `start` + segunda job
    con asignación `pending` del llamador) para seguir probando el AND de
    status × assignment_status; matriz #5/#6 actualizada; **cero SQL directo
    de estado `assigned`** y verificación `SELECT DISTINCT status` (§6 #9).
  - `test/etapa2.e2e-spec.ts`: lista de estados permitidos del listado
    limitado (#11) sin `assigned`.
  - Regresión: suites de Etapas 3, 5 y 6 intactas (§6 #10).
- **Contrato:** `npm run openapi:update` con snapshot verde; en el frontend,
  `npm run openapi:generate` + `npm run check` (un cliente desactualizado
  falla el typecheck, nunca compila contra un enum inexistente).

## 9. Definición de hecho

- `OrderStatus` sin `assigned` en BD, `schema.prisma`, tipos TS y contrato
  OpenAPI; ninguna fila con ese valor.
- `?status=assigned` responde 422 con valores válidos; sin filtros, respuesta
  idéntica a la actual.
- Seed y fixtures sin `assigned` ni SQL directo de ese estado.
- Specs aprobadas actualizadas (`etapa-2`, `etapa-3`, `be-1`) y observación
  `assigned` de `MEMORY.md` §1 cerrada como resuelta.
- Gate backend `REQUIRE_DOCKER=true npm run check` y gate frontend
  `frontend/ npm run check` en verde; CI verde (3 jobs).

## 10. Criterios de aceptación

- **AC-BE2.1** Dada una BD con filas `assigned`, cuando se aplica la
  migración, entonces el enum queda con 5 valores, toda fila reclasificada a
  `in_progress` (con job iniciado) o `open` (sin job iniciado), y ninguna fila
  conserva `assigned` (§20.1, R2).
- **AC-BE2.2** Dada una sesión válida, cuando se consulta
  `?status=assigned`, entonces 422 con `detail` que lista los valores
  válidos (R3, contrato BE-1).
- **AC-BE2.3** Cuando `assigned` viene mezclado con valores válidos en la
  lista, entonces 422 completo — nunca un filtro parcial ni una respuesta
  200 con el valor ignorado (R3).
- **AC-BE2.4** Cuando el llamador no tiene sesión o consulta un espacio
  ajeno, entonces 401 / 404 respectivamente, con cualquier valor de `status`
  (§16.8, R6).
- **AC-BE2.5** Cuando la consulta viene sin parámetros o con valores
  válidos, entonces la respuesta es idéntica a la de BE-1 (AC-BE1.6 sin
  regresión).
- **AC-BE2.6** Cuando un job arranca en una orden `open`, entonces la orden
  pasa a `in_progress`, y `cancel` sigue funcionando desde `open` —
  comportamiento idéntico al actual para los 5 estados, sin ramas `assigned`
  en `job-rules.ts` (§20.1, §20.2).
- **AC-BE2.7** Cuando se compila el backend, ninguna referencia TS al valor
  `assigned` como estado de orden sobrevive (seed, fixtures, tests y reglas
  actualizados); los homónimos de asignación (`order_assigned`,
  `assigned_by`) permanecen intactos (§7, §12).
- **AC-BE2.8** Cuando la etapa cierra, entonces OpenAPI y cliente frontend
  regenerados, gates backend y frontend verdes y CI verde (3 jobs).

## 11. Casos excepcionales

- **Filas existentes `assigned` con trabajos en curso** (el caso real:
  O_3 del seed local, job J_4 `in_progress`): reclasificadas a
  `in_progress`, no a `open` — una orden con trabajo iniciado nunca puede
  quedar «Enviada» (§20.1). El resto, `open`.
- **Seed local vs. migración**: `seed.ts` usa `createMany(skipDuplicates)`,
  que no reescribe órdenes existentes; la corrección de O_3 en el seed
  (→ `in_progress`) y la reclasificación de la migración convergen en el
  mismo estado, sin necesidad de resetear la BD de desarrollo.
- **Cliente API desactualizado** (JSON viejo que envíe `status=assigned`):
  422 accionable, nunca 500 ni filtro silencioso (R3). En el frontend,
  tipos sin regenerar = error de typecheck.
- **Lock de la recreación del enum**: `ALTER TABLE ... ALTER COLUMN TYPE`
  toma un `ACCESS EXCLUSIVE` y reescribe la tabla `orders` — irrelevante sin
  despliegue en producción; documentado por si el volumen crece (las BDs de
  test son recreadas vacías y la de desarrollo es local).
- **Homónimos que no se tocan** (verificación por grep al cierre, AC-BE2.7):
  `NotificationType.order_assigned` (§7/§14), columna `assigned_by` y
  acciones `assignment.*` del audit (§12), comentario de `authorizations`
  sobre asignaciones. Son el concepto *asignación*, no el estado de orden.
- **`prisma migrate dev` sobre la BD de desarrollo**: la migración se aplica
  con las sentencias de §2 en ese orden (UPDATE antes del cast); si
  apareciera una fila con un valor desconocido, el cast fallaría de forma
  explícita — se prefiere fallar antes que reclasificar en silencio.

## 12. Nota de ejecución (20/10/2026)

Aplicación de la migración en la BD de desarrollo, documentada para
referencia futura (ver `MEMORY.md` §1):

- El SQL original de §2 falló en el cast porque el **default `'open'` de la
  columna quedaba tipado con el tipo viejo** y PostgreSQL no lo castea
  automáticamente: se agregaron `DROP DEFAULT` … `SET DEFAULT` alrededor del
  cast (el bloque de §2 refleja el SQL final).
- Prisma **no envolvió las sentencias en una sola transacción**: el primer
  intento dejó estado parcial commiteado (tipo renombrado + UPDATEs de
  reclasificación ya ejecutados — O_3 resultó `open` porque el `started_at`
  de J_4 es nulo en la semilla). Se reparó a mano en una sesión: cast al
  tipo nuevo, `DROP TYPE` del viejo, O_3 → `in_progress` (R2, condicionado a
  jobs en curso) y limpieza del registro fallido en `_prisma_migrations`.
- Reejecutar el archivo sobre la BD ya reparada es imposible por diseño
  (el literal `'assigned'` del UPDATE ya no existe en el tipo final), y es
  innecesario: el SQL es correcto para **BDs nuevas**, que es lo único que
  vuelve a ejecutarlo (CI/Testcontainers lo validan en cada gate). La
  migración se marcó con `prisma migrate resolve --applied`, el
  mecanismo estándar de Prisma para este caso.
