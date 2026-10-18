# Especificación técnica — Etapa 3: Seguimiento, archivos e historial

> **Borrador generado el 17/10/2026** — pendiente de aprobación del dueño (condición previa a
> implementar, regla SDD en `AGENTS.md`). Decisiones ya confirmadas: (1) almacenamiento
> S3-compatible con **mock S3 en proceso** (`s3rver`) para dev/test y endpoint S3 real por
> variable de entorno en producción, tras una interfaz `StorageService` (17/10/2026);
> (2) alineación de `proyect.md` §5.6 con §20.1 (enmienda del 17/10/2026): tras un rechazo
> se crea una **nueva** orden que referencia la rechazada; la rechazada no se reabre.
> Decisiones de diseño que este borrador propone se listan en §1 y se aprueban o rechazan en
> «Preguntas para aprobar antes de implementar». Derivada de `docs/plan.md` §Etapa 3 =
> `proyect.md` §17 (Etapa 3). Las reglas de negocio se referencian por § a `proyect.md`,
> nunca se copian.

---

## 1. Alcance

Según `docs/plan.md` §Etapa 3, esta etapa implementa:

- **Avances y finalización de trabajos** (§6.1, §20.2): el profesional registra avances y marca
  **su propio** trabajo como terminado (§6.1).
- **Trabajos incompletos** (§6.2, §20.2): el profesional informa que no pudo terminar y por qué;
  el responsable decide la salida (resolver con el mismo profesional / reasignar /
  «No pudo concretarse»).
- **Reasignaciones, «No pudo concretarse» y cancelaciones** (§5.6, §5.7, §6.3, §20.1, §20.2,
  §20.3): la reasignación conserva el historial; `not_realized` es terminal con motivo y sin
  borrar el trabajo; la orden completa solo se cancela si **no se realizó ningún trabajo**
  (§20.1), con motivo obligatorio.
- **Cierre de la orden original** (§6.4): solo la entidad originadora cierra; registro
  separado de quién creó, qué entidad es originadora y quién cerró; una orden compuesta cierra
  cuando todos los trabajos están terminados o con «No pudo concretarse» registrado (§6.4).
- **Fotografías y documentos** (§7.1): adjuntar archivos a una orden o a un trabajo, con
  permisos de acceso por solicitud (§16.5, §1.1.8: retiro documentado, nunca borrado silencioso).
- **Historial** (§7.2–§7.6): historial de la propiedad, historial propio del profesional,
  historial del contratista/administradora, y **compartir antecedentes** expresamente (§7.5).

**Fuera de alcance de esta etapa** (y por qué):

- **Aceptación/rechazo de la orden a nivel de orden** (§5.6 «el contratista puede aceptar o
  rechazar una orden», §20.1 «Enviada → Aceptada/Rechazada»): la Etapa 2 aprobó modelar la
  aceptación/rechazo **a nivel de asignación** (spec etapa-2 §4.3) y no existe un modelo de
  «orden enviada a otra empresa» (solo orden propia + asignaciones, ver etapa-2 §2.12). La
  **contradicción detectada** entre §5.6 y §20.1 quedó **resuelta el 17/10/2026** en la
  fuente de verdad: `proyect.md` §5.6 enmendada para alinearse a §20.1 (nueva orden que
  referencia la rechazada; la rechazada no se reabre). Sigue **abierta** solo la decisión de
  implementar aquí el rechazo de órdenes (pregunta 2); mientras tanto, fuera de alcance.
- **Costos en el historial** (§7.2–§7.4 mencionan «costos registrados/comunicados/presentados»):
  llegan en la **Etapa 4**; el historial de esta etapa cubre trabajos, fechas, estados y
  resultados, y los campos de costo se agregan cuando existan (plan.md §Etapa 4).
- **Notificaciones in-app de los eventos de seguimiento**: `plan.md` no las lista en el alcance
  de la Etapa 3 (las avanzadas son Etapa 6, §14). Los eventos quedan visibles en el detalle de
  la orden y en el historial. *Opcional a aprobar:* agregar tipos de `NotificationType` para
  `job_incomplete` / `order_closed` (ver preguntas).
- **Cuentas con acceso limitado (§4.3) sobre archivos e historial**: sus endpoints siguen
  devolviendo solo estado de órdenes (etapa-2 §4.4); no reciben fotos, documentos ni historial.
- **Retención de documentos con periodo definido**: los «requisitos detallados para la
  conservación de documentos» siguen abiertos en §18.4. Supuesto pendiente (ver §10): borrado
  lógico y conserva indefinida en la v1; el retiro queda documentado en el audit log (§1.1.8).
- Presupuestos (§5.4), garantías (§13), costos/autorizaciones (§8), facturas (§11): etapas 4-6.

### Decisiones de diseño que este borrador propone (requieren aprobación)

Son modelado técnico, no reglas de negocio nuevas; se detallan en las secciones indicadas:

1. **`JobStatus` gana `accepted` e `incomplete`** (§2.1) para respetar las transiciones
   §20.2 «Aceptado → En curso» e «En curso → Incompleto». Esto **refina un comportamiento de la
   Etapa 2**: hoy aceptar la asignación pone el job en `in_progress` (etapa-2 fue placeholder:
   «el seguimiento completo §6 es Etapa 3»); a partir de la Etapa 3 aceptar deja el job en
   `accepted` y el inicio es una acción explícita (`start`). Implica actualizar un aserto del
   e2e de la Etapa 2 (`test/etapa2.e2e-spec.ts`: «asignación aceptada marca el job
   in_progress» → `accepted`).
2. **`OrderStatus` gana `in_progress`** (§2.1) para representar «En curso» de §20.1
   («Aceptada → En curso: comienza al menos uno de los trabajos»).
3. **«Borrador» y «Enviada» se colapsan en `open`** (§2.1): la v1 crea y pone a la orden a la
   vez; el preámbulo de §20 permite ajustar nombres sin cambiar el significado de las
   transiciones. «Cerrada» = `completed`, «Cancelada» = `cancelled`.
4. **`AssignmentStatus` gana `revoked`** (§2.1, §20.3) y la reasignación existente de la Etapa 2
   ahora **revoca la asignación anterior** si estaba `pending`/`accepted` (hoy la deja intacta:
   dos asignaciones activas simultáneas, hueco detectado al revisar `orders.service.ts`).
5. **Tabla `job_events` append-only** (§2.5) para los avances y motivos del §6.1-§6.3 y el
   timeline de cada trabajo (§7.2), separada de `audit_log` (cumplimiento §12). Los avances
   libres **no** generan entrada en el audit log; los cambios de estado sí (§7).
6. **Almacenamiento tras una interfaz `StorageService`** (§2.6): driver S3 con
   `@aws-sdk/client-s3` (compatible con cualquier endpoint S3); en dev/test, si no hay
   `STORAGE_ENDPOINT`, la app levanta `s3rver` **en proceso** (decisión aprobada 17/10/2026).
   La descarga **se sirve por la API** (stream con verificación de permiso en cada request,
   §16.1) en lugar de URLs prefirmadas, que saltarían la verificación por solicitud.
7. **«Responsable» = miembro activo de la empresa dueña de la orden** (`order.companyId` /
   `job.companyId`) para cerrar, cancelar, `not_realized`, `resume`, revocar y reasignar
   (§6.2, §6.3, §6.4, §5.6, §20.1-§20.3). En los dos modelos de etapa-2 §2.12, la empresa
   dueña es la originadora (o el contratista dueño de la orden derivada). Las decisiones del
   profesional sobre **su** job son las de §6.1 (`start`, `progress`, `complete`, `incomplete`).
8. **Cierre permitido a cualquier miembro activo de la empresa originadora** (§6.4 «usuario
   autorizado de esa administradora»); alternativa más estricta: solo `owner`. Ver preguntas.
9. **Compartir antecedentes (§7.5) modelado como `history_shares`** (§2.8): la empresa dueña de
   los antecedentes concede a una membresía concreta lectura del historial (y descarga de
   archivos) de **una** propiedad; revocable, con auditoría.
10. **Historial propio del profesional (§7.2) en `GET /me/job-history`** (§4.5): trabaja sobre
    todas las asignaciones que **alguna vez** tuvo (cualquier estado), incluso en empresas
    ajenas a la suya; no requiere membresía vigente en la empresa del trabajo histórico.

---

## 2. Modelo de datos

Convenciones heredadas de `docs/especificacion/etapa-1.md` §2: `id` UUID, timestamps
`timestamptz` en UTC, `company_id` en toda tabla *tenant-scoped*. En esta etapa **no** se
persiste dinero (los costos llegan en la Etapa 4; `Decimal` nunca `Float`, `docs/stack.md` §2).
Todas las migraciones son **aditivas**: enums ganan valores, tablas nuevas, columnas nuevas
anulables. Ninguna migración borra historial (§1.1.8).

### 2.1 Cambios en enums existentes

| Enum | Cambio | Motivo |
|---|---|---|
| `JobStatus` | se agregan `'accepted'` \| `'incomplete'` | §20.2 distingue «Aceptado», «En curso» e «Incompleto» como estados con transiciones propias («Incompleto → En curso» requiere autorización del responsable). Sin `incomplete` no existe el estado que exige §6.2. Valores finales: `pending` \| `accepted` \| `in_progress` \| `incomplete` \| `done` \| `not_realized`. «Asignado/esperando respuesta» de §20.2 sigue representándose por el job `pending` + la asignación `pending` (convención de la Etapa 2). |
| `OrderStatus` | se agrega `'in_progress'` | §20.1 «Aceptada → En curso». Valores finales: `requested` \| `open` \| `assigned` \| `in_progress` \| `completed` \| `cancelled`. Mapeo: `open` ≈ Borrador/Enviada, `assigned` ≈ Aceptada, `completed` = Cerrada (§6.4), `cancelled` = Cancelada. `rejected` **no** se agrega (rechazo de orden fuera de alcance, ver §1). |
| `AssignmentStatus` | se agrega `'revoked'` | §20.3: cada asignación queda Propuesta/Aceptada/Rechazada/**Revocada**; una revocada no se reactiva. Valores finales: `pending` \| `accepted` \| `rejected` \| `revoked`. |

Enums nuevos:

| Enum | Valores | Notas |
|---|---|---|
| `JobEventType` | `progress_note` \| `started` \| `completed` \| `incomplete` \| `resumed` \| `not_realized` | §2.5 |
| `FileKind` | `photo` \| `document` | §7.1 |
| `FileTargetType` | `order` \| `job` | §7.1 «adjuntar … a una orden o a un trabajo específico» |

### 2.2 `jobs` — columnas nuevas y estados (§6.1–§6.3)

| Campo | Tipo | Notas |
|---|---|---|
| status | enum | gana `accepted` \| `incomplete` (§2.1) |
| started_at | timestamptz null | primera vez que el trabajo comenzó (`start`). **No se limpia nunca**: es la marca de «ya se realizó trabajo» que decide la cancelación (§20.1). |
| completed_at | timestamptz null | cuándo el profesional lo marcó terminado (`done` es estado final, §20.2). |

Los motivos de `incomplete` y `not_realized` **no** viven en columnas del job: van en
`job_events` (§2.5), porque pueden repetirse (incompleto → en curso → incompleto).

### 2.3 `orders` — columnas de cierre y cancelación (§6.4, §20.1)

| Campo | Tipo | Notas |
|---|---|---|
| status | enum | gana `in_progress` (§2.1) |
| closed_by | uuid null FK → users | quién realizó el cierre (§6.4: «registrar por separado … qué usuario realizó el cierre») |
| closed_at | timestamptz null | |
| cancelled_by | uuid null FK → users | «La persona responsable debe registrar el motivo» (§20.1) |
| cancelled_at | timestamptz null | |
| cancellation_reason | text null | obligatorio al cancelar (422 si vacío) |

Los tres protagonistas de §6.4 quedan **separados** en la fila: `originator_id` (quién creó),
`company_id` (entidad originadora) y `closed_by` (quién cerró).

### 2.4 `assignments` — sin columnas nuevas

Solo cambia el enum (§2.1). Cada asignación sigue siendo registro propio con su historia
(§20.3); la reasignación (Etapa 2) y la nueva revocación actualizan el estado de la anterior a
`revoked` cuando estaba `pending`/`accepted`, dentro de la misma transacción.

### 2.5 `job_events` — avances, motivos y timeline del trabajo (§6.1–§6.3, §7.2)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| job_id | uuid FK → jobs | índice `(job_id, created_at)` |
| company_id | uuid FK → companies | *tenant* |
| type | enum | `JobEventType` (§2.1) |
| message | text null | avance, resultado o motivo. **Obligatorio** para `progress_note`, `incomplete` y `not_realized` (422 si vacío); opcional para el resto. Máx. 2000 caracteres. |
| actor_user_id | uuid null FK → users | «quién» (§12); null solo si algún día un sistema lo escribe (v1: siempre usuario) |
| created_at | timestamptz | default `now()`, índice `(job_id, created_at)` |

**Append-only:** la aplicación solo tiene INSERT/SELECT (mismo patrón de grants que
`audit_log`, etapa-1 §2.6 / test #23). Implementa «conservar el historial de las acciones
realizadas» (§6.3) y «mantener el historial de acciones relevantes» (§16.7) a nivel de trabajo.

### 2.6 `file_objects` — fotografías y documentos (§7.1, §16.5)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | empresa **dueña** de la orden a la que pertenece el archivo; *tenant* |
| order_id | uuid FK → orders | índice; todo archivo pertenece a una orden (aunque su target sea un job) |
| target_type | enum | `order` \| `job` |
| target_id | uuid | id de la orden o del job; índice `(target_type, target_id)` |
| kind | enum | `photo` \| `document` |
| filename | text | nombre original saneado (sin rutas); **nunca** va en payloads de audit log ni en logs |
| content_type | text | validado contra allowlist (§11) |
| size_bytes | int | máx. 10 MB (§11) |
| storage_key | text unique | clave en el almacenamiento; los bytes viven **fuera** de Postgres |
| uploaded_by | uuid FK → users | |
| deleted_at | timestamptz null | **borrado lógico** (§1.1.8): el registro se conserva y el retiro se audita; los bytes se dejan de servir. Sin borrado físico en la v1 (retención abierta en §18.4). |
| created_at | timestamptz | índice `(company_id, created_at)` |

Índices: `(order_id)`, `(target_type, target_id)`, `(company_id, created_at)`.

### 2.7 Directorio de módulos (convención de `docs/stack.md` §4)

- `modules/orders` (existente): **extiende** con las acciones de job (`start`, `progress`,
  `complete`, `incomplete`, `resume`, `not-realized`), `revoke`, `close` y `cancel` — son el
  mismo agregado orden/trabajo.
- `modules/storage` (nuevo): `StorageService` (interfaz: `put`, `get`) + driver S3
  (`@aws-sdk/client-s3`) + autoarranque de `s3rver` en dev/test cuando falta
  `STORAGE_ENDPOINT`. Módulo global.
- `modules/files` (nuevo): endpoints de `file_objects` (subir, listar, descargar, borrar lógico).
- `modules/history` (nuevo): historiales (§7.2–§7.4) y `history_shares` (§7.5).

### 2.8 `history_shares` — compartir antecedentes (§7.5)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | empresa **dueña de los antecedentes** que comparte; *tenant* |
| property_id | uuid FK → properties | la propiedad cuyo historial se comparte (índice) |
| shared_with_membership_id | uuid FK → memberships | a **quién** se concede (una membresía concreta) |
| shared_by | uuid FK → users | quién compartió (§12 «quién y cuándo») |
| note | text null | motivo / antecedentes relevantes (§7.5 «antecedentes relevantes para una nueva reparación») |
| revoked_at | timestamptz null | revocación (§16.6) |
| created_at | timestamptz | índice `(property_id, shared_with_membership_id)` |

El alcance del share: los registros de **`company_id`** en esa propiedad (sus órdenes y los
archivos de esas órdenes). Un share del dueño de la propiedad no cede registros de otras
empresas. La unicidad de «share activo por (empresa, propiedad, membresía)» se valida en la
aplicación (409); Postgres no tiene unique parcial soportado por Prisma.

### 2.9 Índices globales

- `jobs`: los existentes + consulta de cierre `(order_id, status)`.
- `job_events`: `(job_id, created_at)`, `(company_id)`.
- `file_objects`: `(order_id)`, `(target_type, target_id)`, `(company_id, created_at)`,
  `storage_key` unique.
- `history_shares`: `(property_id, shared_with_membership_id)`, `(company_id)`.
- `orders`: los existentes; los cierres se filtran por `status`.

---

## 3. Convenciones de la API

Se **referencian** las de `docs/especificacion/etapa-1.md` §3 (prefijo `/api/v1`, cookie
`mh_session`, permisos por request, tenant guard, códigos, RFC 7807, paginación por cursor) y
las de `docs/especificacion/etapa-2.md` §3 (sesión vs. acceso limitado, listas
`{ data, nextCursor }`). No se repiten.

**Agregado en esta etapa:**

- **Convención de rutas:** todas las rutas nuevas usan `/companies/:id/...` donde `:id` es la
  **empresa del que llama** (patrón de la Etapa 2: el `CompanyAccessGuard` exige membresía
  activa en `:id` o devuelve 404); el servicio resuelve después el recurso (orden, job,
  archivo) y su permiso por recurso (§16.1). La excepción es `GET /me/job-history`, ruteado
  por sesión como `GET /notifications`.
- **Multipart:** los uploads usan `multipart/form-data` con un campo `file`
  (`FileInterceptor` de `@nestjs/platform-express`, multer). Límites: 10 MB por archivo y
  allowlist de content types (§11). Respuesta 201 con la metadata del archivo.
- **Descarga binaria:** `GET` de archivo devuelve los bytes con su `content_type` y
  `Content-Disposition`; **sin** URLs prefirmadas (la verificación de permiso ocurre en cada
  request, §16.1).
- **Transiciones de estado:** los endpoints de transición (`start`, `complete`, `resume`,
  `close`, `cancel`, …) responden **204**; la creación de registros (`progress`, uploads,
  shares) responde **201**.
- **Códigos nuevos de esta etapa:** 415 para content type fuera de la allowlist de archivos
  (los 401/403/404/409/410/422/429 de etapa-1 §3 siguen igual).

---

## 4. Endpoints

Todos documentados en `/api/v1` y visibles en `/api/docs`. «Permiso» describe el rol por
recurso; la resolución completa está en §5.

### 4.1 Seguimiento del profesional (asignado con asignación activa, §6.1, §20.2)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/companies/:id/jobs/:jobId/start` | Comienza: `accepted → in_progress`; registra `started_at` y evento `started` | asignado activo de ese job | 204 / 403 / 404 / 409 |
| POST | `/companies/:id/jobs/:jobId/progress` | Registra un avance (§6.1): body `{ message }` → evento `progress_note` | asignado activo | 201 / 403 / 404 / 422 |
| POST | `/companies/:id/jobs/:jobId/complete` | Marca **su** trabajo terminado: `in_progress → done` (§6.1); body opcional `{ result? }` | asignado activo de ese job | 204 / 403 / 404 / 409 |
| POST | `/companies/:id/jobs/:jobId/incomplete` | Informa que no pudo terminar: `in_progress → incomplete`; body `{ reason }` obligatorio (§6.2) | asignado activo | 204 / 403 / 404 / 409 / 422 |

### 4.2 Decisiones del responsable — miembro de la empresa dueña (§6.2, §6.3, §20.2, §20.3)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/companies/:id/jobs/:jobId/resume` | Autoriza continuar: `incomplete → in_progress` con **el mismo** profesional (§20.2) | miembro empresa dueña | 204 / 403 / 404 / 409 |
| POST | `/companies/:id/jobs/:jobId/not-realized` | «No pudo concretarse»: `pending\|accepted\|in_progress\|incomplete → not_realized`; body `{ reason }` obligatorio (§6.3). Las asignaciones activas del job pasan a `revoked` (§16.6) | miembro empresa dueña | 204 / 403 / 404 / 409 / 422 |
| POST | `/companies/:id/assignments/:assignId/revoke` | Revoca una asignación activa: `pending\|accepted → revoked` y el job vuelve a `pending` si no comenzó (§20.3) | miembro empresa dueña | 204 / 403 / 404 / 409 |
| POST | `/companies/:id/assignments/:assignId/reassign` | *(existente Etapa 2, extendida)* crea la nueva asignación y ahora **revoca** la anterior si estaba `pending`/`accepted` (§5.7, §20.3); 409 si el job está `in_progress` (primero debe informarse `incomplete`) | miembro empresa dueña | 201 / 403 / 404 / 409 |

### 4.3 Cierre y cancelación de la orden (§6.4, §20.1)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/companies/:id/orders/:orderId/close` | Cierra la orden: exige **todos** los jobs en `done` o `not_realized` (§6.4); setea `closed_by`/`closed_at` | miembro empresa dueña (originadora) | 204 / 403 / 404 / 409 |
| POST | `/companies/:id/orders/:orderId/cancel` | Cancela la orden completa; body `{ reason }` obligatorio; solo si **ningún** job comenzó (`started_at` nulo en todos) y `status ∈ {open, assigned}` (§20.1); revoca asignaciones activas (§16.6) | miembro empresa dueña | 204 / 403 / 404 / 409 / 422 |

### 4.4 Archivos (§7.1, §16.5)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/companies/:id/orders/:orderId/files` | Sube archivo **a la orden** (multipart `file`, campo opcional `kind`) | miembro dueño o con asignación activa en algún job de la orden | 201 / 403 / 404 / 415 / 422 |
| POST | `/companies/:id/jobs/:jobId/files` | Sube evidencia **al trabajo** (§7.1: «durante el trabajo, al terminarlo o cuando no puede completarlo») | miembro dueño o **asignado activo de ese job** | 201 / 403 / 404 / 415 / 422 |
| GET | `/companies/:id/orders/:orderId/files` | Lista metadata visible de archivos de la orden (los de la orden + los de los jobs en alcance) | ver §5 (alcance de jobs) | 200 / 404 |
| GET | `/companies/:id/files/:fileId` | Descarga los bytes (stream, permiso verificado por request) | dueño \| asignado activo en alcance \| share activo (§7.5) | 200 / 404 |
| DELETE | `/companies/:id/files/:fileId` | **Borrado lógico** (`deleted_at`) + `file.deleted` en audit (§1.1.8) | miembro de la empresa dueña o quien lo subió | 204 / 403 / 404 |

### 4.5 Historial (§7.2–§7.4)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| GET | `/companies/:id/history/properties/:propId` | Historial de la propiedad (§7.2): dirección resumida, órdenes pasadas (incl. cerradas), sus jobs con fechas/estados/resultados, órdenes relacionadas (`parent_order_id`) | dueño de la propiedad: completo; con share activo: antecedentes compartidos; con asignación activa sin share: **solo sus trabajos** (§7.2) | 200 / 404 |
| GET | `/companies/:id/history/orders` | Órdenes gestionadas por el espacio (§7.3, §7.4): propias + de las que la empresa **tuvo** asignación (cualquier estado), con jobs y resultados | miembro activo | 200 / 404 |
| GET | `/me/job-history` | Los **propios** trabajos históricos del usuario (§7.2: «incluso si esos trabajos están cerrados»): job, orden, dirección de la propiedad, fechas, estado/resultado, motivos | sesión | 200 |

Los costos de §7.2–§7.4 no aparecen aún (Etapa 4).

### 4.6 Compartir antecedentes (§7.5)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/companies/:id/history/shares` | Comparte antecedentes de una propiedad a una membresía; body `{ propertyId, sharedWithMembershipId, note? }` | miembro de la empresa dueña de los antecedentes | 201 / 403 / 404 / 409 / 422 |
| DELETE | `/companies/:id/history/shares/:shareId` | Revoca el share (`revoked_at`) | miembro de esa empresa | 204 / 403 / 404 |

---

## 5. Reglas de permisos (resumen normativo)

Referenciadas por §, sin copiar:

1. **Verificación en el servidor por operación** (§16.1): cada endpoint de esta etapa resuelve
   el recurso y su permiso en el servicio; la interfaz no cuenta.
2. **Tenant guard** (§16.2, §16.8): `:id` es la empresa del llamador (membresía activa leída en
   cada request); una orden, job o archivo de otra empresa sin relación → **404**, jamás se
   filtra su existencia.
3. **Alcance por trabajo** (§16.3, §2.3): un profesional ve y acciona **solo** sus jobs (y los
   archivos de su alcance); los jobs y archivos de otros profesionales en la misma orden o
   propiedad responden **404** — no son su negocio (§2.3, §7.5).
4. **Solo el propio trabajo** (§6.1): `start`/`progress`/`complete`/`incomplete` exigen ser el
   **asignado activo** de ese job; nadie marca el trabajo de otro (403 para quien ve el job y
   no es el asignado; 404 para quien no lo ve).
5. **El responsable decide** (§6.2 «según la relación comercial y los permisos correspondientes»,
   §6.3, §5.6, §20.1–§20.3): `not_realized`, `resume`, `revoke`, `reassign`, `close` y `cancel`
   son de la **empresa dueña** de la orden/job (design decision §1.7); un profesional asignado
   de otra empresa recibe **403**; una empresa sin relación, **404**.
6. **Cierre solo por la entidad originadora** (§6.4): `order.companyId` debe ser la empresa del
   llamador; registro separado de `originator_id`, `company_id` y `closed_by` (§6.4).
7. **Archivos con permiso de solicitud** (§16.5, §4.5): descargar = empresa dueña, o asignado
   activo en el alcance del archivo, o **share activo** (§7.5). Sin esas relaciones → 404.
   Al perder la asignación se pierde el acceso operativo sin borrar registros (§16.6, §4.5).
8. **Antecedentes privados solo con compartir expresamente** (§7.5): un profesional jamás ve
   fotos privadas/costos/identidades/u órdenes de otros profesionales sin `history_share`.
9. **Historiales por rol** (§7.2–§7.4): propiedad → dueño completa / share / asignado solo lo
   suyo; profesional → `GET /me/job-history` solo trabajos propios; contratista/administradora
   → `history/orders` de su espacio, nunca órdenes privadas ajenas (§16.8).
10. **Sin borrados silenciosos** (§1.1.8, §12): los archivos se retiran con `deleted_at` +
    `file.deleted` en audit; `job_events` es append-only sin UPDATE/DELETE de la aplicación;
    el cierre/cancelación conservan jobs, asignaciones e historial.
11. **Revocación de acceso efecto inmediato** (§16.6, §3.3): los permisos se leen por request;
    una membresía revocada o asignación terminada no vuelven a autorizar (patrón etapa-1 §5.3).

---

## 6. Matriz de permisos como tests de integración (§16.1)

Tests con Testcontainers + PostgreSQL real (+ `s3rver` en proceso para los de archivos).
**Si un escenario falla, no se pasa de etapa.**

| # | Escenario | Esperado |
|---|---|---|
| 1 | Request sin sesión a cualquier endpoint nuevo | 401 |
| 2 | Asignado activo: `start` de **su** job `accepted` | 204, job `in_progress`, `started_at` fijado, orden → `in_progress`, evento `started` + `job.started` en audit |
| 3 | Miembro de la empresa dueña (no asignado): `start` de un job | 403 (ve el job, no es su trabajo, §6.1) |
| 4 | Usuario de empresa sin relación: `start` de un job ajeno | 404 (§16.8) |
| 5 | Profesional con asignación **rechazada**: `start` | 404 (perdió acceso operativo, §16.6) |
| 6 | Asignado activo: `complete` su job en curso | 204, `done` + `completed_at`, evento `completed` + audit (§6.1) |
| 7 | Asignado activo: `complete` un job ya `done` o `accepted` (sin iniciar) | 409 (§20.2: solo `En curso → Completado`; `done` es final) |
| 8 | Asignado activo: `incomplete` **sin** motivo | 422 (§6.2) |
| 9 | Asignado activo: `incomplete` con motivo | 204, job `incomplete`, evento con motivo + `job.incomplete` en audit |
| 10 | Asignado activo: `complete`/`start` sobre el job de **otro** profesional (empresa dueña) | 404 — el job ni se muestra en su alcance (§16.3, §6.1) |
| 11 | Empresa dueña: `resume` de job `incomplete` con asignación activa | 204, job `in_progress`, mismo asignado, evento + audit (§20.2) |
| 12 | Profesional asignado (empresa no dueña): `resume` | 403 (§6.2: el responsable decide) |
| 13 | Empresa dueña: `resume` cuando la asignación fue revocada/reasignada | 409 (§20.2: «el mismo profesional continúa») |
| 14 | Empresa dueña: `not-realized` con motivo (job `pending` o `incomplete`) | 204, job `not_realized`, asignación activa → `revoked`, evento + audit (§6.3, §16.6) |
| 15 | Empresa dueña: `not-realized` **sin** motivo | 422 (§6.3) |
| 16 | Empresa dueña: `not-realized` sobre job `done` | 409 (estado final, §20.2) |
| 17 | Profesional asignado (empresa no dueña): `not-realized` | 403 (§6.3 «el responsable») |
| 18 | Empresa dueña: `revoke` de asignación activa con job no iniciado | 204, asignación `revoked`, job `pending`, audit (§20.3) |
| 19 | Empresa dueña: `revoke` con job `in_progress` | 409 (primero el profesional informa `incomplete`, §6.2) |
| 20 | Empresa dueña: `reassign` tras aceptación (job `accepted`) | 201, anterior `revoked`, nueva `pending`, ambas conservadas (§5.7, §20.3) |
| 21 | Asignado: intenta `accept` una asignación `revoked` | 409 (una revocada no se reactiva, §20.3) |
| 22 | Empresa dueña: `close` con todos los jobs `done`/`not_realized` | 204, orden `completed`, `closed_by` ≠ `originator_id` donde aplica, audit `order.closed` (§6.4) |
| 23 | Empresa dueña: `close` con job `incomplete`/`pending`/`in_progress`/`accepted` | 409 (§6.4 explícito) |
| 24 | Empresa dueña: `close` con asignación rechazada/revocada pero jobs terminales | 204 (la asignación histórica no bloquea, §6.4) |
| 25 | Empresa **no** dueña con asignación activa: `close` | 403 (§6.4 solo originador) |
| 26 | Empresa sin relación: `close`/`cancel` | 404 (§16.8) |
| 27 | Empresa dueña: `cancel` con motivo, ningún job con `started_at`, orden `open`/`assigned` | 204, `cancelled` + motivo, asignaciones activas `revoked`, audit (§20.1) |
| 28 | Empresa dueña: `cancel` con algún job ya comenzado (o orden `in_progress`) | 409 (§20.1: una vez realizado trabajo no se cancela) |
| 29 | Empresa dueña: `cancel` **sin** motivo | 422 (§20.1) |
| 30 | Upload a orden/trabajo por miembro dueño o asignado activo | 201, bytes en el storage, fila en `file_objects`, `file.uploaded` en audit (§7.1) |
| 31 | Upload por quien **perdió** la asignación | 403/404 sin crear fila (§16.6) |
| 32 | Upload de empresa sin relación | 404 (§16.8) |
| 33 | Upload con content type fuera de la allowlist o >10 MB | 415 / 422, nada almacenado (§11) |
| 34 | Descarga: miembro dueño y asignado activo en alcance | 200 con los bytes (§16.5) |
| 35 | Descarga: pro con asignación activa en el job B, archivo del job **A** (otro pro, misma orden) | 404 (alcance privado, §16.3, §7.5) |
| 36 | Descarga: pro sin share, foto privada de otro pro en la misma propiedad | 404 (§7.5) |
| 37 | Descarga: pro **con** `history_share` activo para esa propiedad | 200 (§7.5) |
| 38 | `DELETE` de archivo y descarga posterior | 204 y luego 404; la fila permanece con `deleted_at` y `file.deleted` en audit (§1.1.8) |
| 39 | Historial de propiedad: miembro de la empresa dueña | 200 completo, incluye trabajos de otros profesionales y órdenes cerradas (§7.2) |
| 40 | Historial de propiedad: pro con asignación activa y **sin** share | 200 **solo** con sus trabajos (§7.2) |
| 41 | Historial de propiedad: pro con share | 200 con los antecedentes compartidos, incl. trabajos de otros profesionales (§7.5) |
| 42 | `/me/job-history` de un profesional | 200 solo con **sus** trabajos históricos (incluso cerrados); nunca los de otros (§7.2) |
| 43 | `history/orders` de una empresa | 200 incluye órdenes cerradas que gestionó; órdenes de otra empresa jamás aparecen (§7.3, §16.8) |
| 44 | Share: miembro de la empresa dueña de los antecedentes lo crea | 201, `history_share.created` en audit (§7.5) |
| 45 | Share: empresa que **no** es dueña de los antecedentes | 404/403 (§7.5) |
| 46 | Share duplicado activo (misma propiedad + membresía) | 409 |
| 47 | Share revocado y descarga posterior del ex-beneficiario | 404 + `history_share.revoked` en audit (§16.6) |
| 48 | Cada acción relevante genera su entrada de audit con `actor_user_id` y `created_at` correctos | aserción por acción (ver §7) |
| 49 | La aplicación no puede UPDATE/DELETE en `job_events` (grants de BD) | error de permiso de BD (patrón etapa-1 #23) |

---

## 7. Eventos de audit log de la Etapa 3

Mínimo exigido por §12 («quién y cuándo»), §6.4 y §1.1.8:

| `action` | `entity_type` | Cuándo |
|---|---|---|
| `job.started` | job | el profesional comienza (§20.2) |
| `job.completed` | job | finaliza su trabajo (§6.1; payload: resultado si se informó) |
| `job.incomplete` | job | informa incompletud (§6.2; payload: motivo) |
| `job.resumed` | job | el responsable autoriza continuar (§20.2) |
| `job.not_realized` | job | «No pudo concretarse» (§6.3, §12; payload: motivo) |
| `order.closed` | order | cierre (§6.4, §12; payload: originatorId, companyId, closedBy) |
| `order.cancelled` | order | cancelación (§20.1; payload: motivo) |
| `assignment.revoked` | assignment | revocación (§12 «asignaciones y reasignaciones», §20.3) |
| `file.uploaded` | file | alta de archivo (§7.1; payload: fileId, targetType, contentType, sizeBytes — **sin** filename) |
| `file.deleted` | file | retiro lógico documentado (§1.1.8; mismo payload mínimo) |
| `history_share.created` | history_share | compartir antecedentes (§12 «cambios de permisos») |
| `history_share.revoked` | history_share | revocación de acceso (§12) |

`assignment.reassigned` (Etapa 2) se conserva y su payload pasa a incluir
`revokedAssignmentId`. Los avances libres (`progress_note`) **no** entran al audit log: su
historial vive en `job_events` (append-only, §2.5); §12 no los exige y duplicarlos en las dos
tablas solo ensucia la lectura del log.

---

## 8. Pruebas

- **Unitarias (Jest):** funciones puras de transición (patrón `membership-rules.ts`): máquina
  de jobs §20.2 (todas las legales y todas las ilegales), máquina de órdenes §20.1 (cierre,
  cancelación y «una vez realizado trabajo no se cancela»), precondición de cierre §6.4,
  alcance de visibilidad de trabajos/archivos por rol, validación de allowlist/tamaño de
  archivos, scoping de `history_shares`, y el `StorageService` con driver en memoria (fake).
- **Integración (Testcontainers + PostgreSQL real + `s3rver`):** la matriz completa de §6
  contra la API real con HTTP; flujo completo orden → asignación → aceptación → inicio →
  avance → finalización (o incompleto → decisión) → cierre; roundtrip de archivos (subir →
  bytes idénticos → descargar → permisos → borrado lógico); historiales y shares; aserciones
  de audit y de `job_events`.
- **Contrato:** OpenAPI regenerado con `npm run openapi:update` y comparado en el gate local
  (patrón de Etapa 1); los endpoints multipart documentan `ApiConsumes('multipart/form-data')`.

---

## 9. Definición de hecho (Etapa 3)

Igual que el criterio de salida de la Etapa 3 en `docs/plan.md`:

1. Alcance completo: avances y finalización; trabajos incompletos; reasignaciones, «no pudo
   concretarse» y cancelaciones; fotografías, documentos e historial (permisos §16.5).
2. **Una orden recorre su vida completa hasta cierre** (§6.4, §20) — probado extremo a extremo.
3. **Las fotos/documentos respetan los permisos de quien los solicita** (§16.5, §7.5).
4. **El historial conserva todo lo que §12 manda conservar** (sin borrados silenciosos, §1.1.8).
5. Matriz de §6 completa y verde en el gate local (`npm run check`).
6. `/api/docs` completo con los endpoints nuevos.

---

## 10. Criterios de aceptación (Given/When/Then)

Cada criterio se implementa como test (§8). Reglas por referencia (§x), no copia. **Supuesto**
marca una decisión técnica propuesta que requiere aprobación (§1 y preguntas al final).

### 10.1 Avances y finalización (§6.1, §20.2)

- **AC-3.1** Dado un job `accepted` y su profesional asignado activo, cuando ejecuta `start`,
  entonces 204, el job pasa a `in_progress`, se fija `started_at`, la orden pasa a `in_progress`
  si estaba `assigned`, y quedan evento `started` + `job.started` en audit.
- **AC-3.2** Dado un profesional asignado, cuando registra un avance con mensaje, entonces 201
  y un `job_event` `progress_note` con `actor_user_id` y `created_at` (§6.1); el audit log **no**
  recibe entradas por avances libres (§7).
- **AC-3.3** Dado el profesional con su job `in_progress`, cuando lo completa (con o sin
  resultado), entonces 204, `done` + `completed_at`, evento + `job.completed` en audit (§6.1);
  un segundo `complete` responde 409 (§20.2 «Completado es un estado final»).
- **AC-3.4** Dado un profesional asignado, cuando intenta completar o iniciar un trabajo que
  **no** es el suyo, entonces 403 si ve ese trabajo y 404 si está fuera de su alcance (§6.1,
  §16.3).
- **AC-3.5** Dado el profesional con job `in_progress`, cuando informa `incomplete` con motivo,
  entonces 204, job `incomplete`, evento con el motivo + `job.incomplete` en audit; sin motivo,
  422 (§6.2).

### 10.2 Decisiones del responsable (§6.2, §6.3, §20.2, §20.3)

- **AC-3.6** Dada la empresa dueña, cuando autoriza `resume` de un job `incomplete` con
  asignación activa, entonces 204, job `in_progress` con **el mismo** profesional, evento +
  audit (§20.2); sin ser la empresa dueña, 403; con la asignación revocada/reasignada, 409.
- **AC-3.7** Dada la empresa dueña, cuando registra `not-realized` con motivo, entonces 204,
  job `not_realized`, evento + `job.not_realized` en audit, y **el job y su historial quedan
  intactos** (§6.3 «No se elimina el trabajo ni su historial»); sin motivo, 422.
- **AC-3.8** Dado `not-realized` sobre un job con asignación activa, entonces esa asignación
  queda `revoked` (§16.6) y las demás asignaciones históricas no cambian.
- **AC-3.9** Dada una reasignación sobre un job `accepted`, entonces 201, la asignación
  anterior queda `revoked` y la nueva `pending`, y **ambas** permanecen en la base (§5.7,
  §20.3) — corrige el hueco de doble asignación activa detectado en la Etapa 2.
- **AC-3.10** Dada la empresa dueña, cuando revoca una asignación activa de un job no
  iniciado, entonces 204, asignación `revoked` y job `pending` (§20.3); un `accept` posterior
  sobre esa asignación responde 409 («no se reactiva»).
- **AC-3.11** Dado un job `in_progress`, cuando la empresa dueña intenta revocar/reasignar
  directamente, entonces 409 — el flujo exige que el profesional informe primero `incomplete`
  (§6.2), preservando el relato del trabajo.

### 10.3 Cierre y cancelación (§6.4, §20.1)

- **AC-3.12** Dada una orden (compuesta o simple) con todos los jobs `done` o `not_realized`,
  cuando un miembro de la empresa originadora la cierra, entonces 204, orden `completed`, y
  la fila registra **por separado** `originator_id`, `company_id` y `closed_by`/`closed_at`
  (§6.4); `order.closed` en audit con los tres.
- **AC-3.13** Dada una orden con algún job `pending`, `accepted`, `in_progress` o `incomplete`,
  cuando se intenta cerrar, entonces 409 (§6.4); con una asignación rechazada/revocada pero
  todos los jobs terminales, entonces 204 (§6.4).
- **AC-3.14** Dada una orden de la empresa A, cuando la cierra una empresa B con asignación
  activa, entonces 403; sin relación, 404 (§6.4, §16.8).
- **AC-3.15** Dada una orden sin ningún trabajo realizado (`started_at` nulo en todos) en
  estado `open`/`assigned`, cuando su empresa dueña la cancela con motivo, entonces 204,
  `cancelled` con motivo y responsable, asignaciones activas `revoked`, `order.cancelled` en
  audit (§20.1).
- **AC-3.16** Dada una orden con **algún** trabajo realizado (o en `in_progress`), cuando se
  intenta cancelarla, entonces 409 — el trabajo realizado, su historial y sus costos se
  conservan (§20.1); sin motivo o desde estado no cancelable, 422/409 respectivamente (§20.1).
- **AC-3.17** *(Supuesto §1.8: cerrar = miembro activo de la empresa originadora)* Dado un
  miembro `member` (no `owner`) de la empresa dueña, cuando cierra una orden completa, entonces
  204.

### 10.4 Fotografías y documentos (§7.1, §16.5, §1.1.8)

- **AC-3.18** Dado un miembro dueño o un asignado activo, cuando sube un archivo válido a la
  orden o al trabajo, entonces 201 con metadata (filename, content_type, size_bytes, kind), los
  bytes quedan en el storage y `file.uploaded` en audit **sin** filename (§7.1, §16.4).
- **AC-3.19** Dado un usuario sin la relación exigida (asignación perdida o empresa sin
  relación), cuando intenta subir, entonces 403/404 sin crear fila ni bytes (§16.6, §16.8).
- **AC-3.20** Dado un archivo, cuando lo descarga quien tiene permiso (dueño, asignado activo
  en alcance o con share), entonces 200 con los bytes exactos (§16.5); quien no lo tiene,
  entonces 404 sin indicios de su existencia (§16.3, §7.5).
- **AC-3.21** Dado un archivo con content type no permitido o >10 MB, cuando se intenta subir,
  entonces 415/422 y nada se almacena (§11).
- **AC-3.22** Dado un archivo subido, cuando un miembro dueño (o el subidor) lo elimina,
  entonces 204 con `deleted_at` + `file.deleted` en audit; la descarga posterior responde 404
  pero la fila permanece (§1.1.8 «no se eliminan silenciosamente: su retiro queda
  documentado»).

### 10.5 Historial (§7.2–§7.4, §12)

- **AC-3.23** Dado un miembro de la empresa dueña de la propiedad, cuando consulta su
  historial, entonces 200 con órdenes pasadas (incl. cerradas), jobs con fechas, estados y
  resultados, y órdenes relacionadas (§7.2); los campos de costo **no** aparecen aún (Etapa 4).
- **AC-3.24** Dado un profesional con asignación activa y sin share, cuando consulta el
  historial de la propiedad, entonces 200 **solo** con sus trabajos; los de otros
  profesionales no figuran (§7.2).
- **AC-3.25** Dado un profesional, cuando consulta `/me/job-history`, entonces 200 con
  exactamente **sus** trabajos históricos — incluso de órdenes cerradas y en empresas donde ya
  no es miembro — y jamás los de otros profesionales (§7.2).
- **AC-3.26** Dado un contratista o administradora, cuando consulta `history/orders`, entonces
  200 con sus órdenes propias y las que **tuvo asignadas** en cualquier estado; órdenes
  privadas de otras empresas no aparecen (§7.3, §7.4, §16.8).
- **AC-3.27** Dado el ciclo completo de una orden (creación → asignación → aceptación → inicio
  → avances → finalización/«no pudo concretarse» → cierre), cuando se revisa el audit log y
  `job_events`, entonces **cada** evento exigido por §12 está presente con actor y fecha, y
  ningún registro fue eliminado (criterio de salida, §1.1.8).

### 10.6 Compartir antecedentes (§7.5)

- **AC-3.28** Dada la empresa dueña de los antecedentes, cuando comparte la propiedad a una
  membresía, entonces 201 + `history_share.created`; el beneficiario pasa a ver el historial
  (§7.5) y a descargar los archivos de esa propiedad (AC-3.20).
- **AC-3.29** Dada la empresa que **no** es dueña de los antecedentes, cuando intenta
  compartir, entonces 404/403 (§7.5); share duplicado activo, 409.
- **AC-3.30** Dado un share activo, cuando se revoca, entonces 204 + `history_share.revoked` y
  el ex-beneficiario queda sin acceso en el request siguiente (404) (§16.6).
- **AC-3.31** Dado un profesional **sin** share, cuando intenta ver fotos privadas, costos,
  identidades u órdenes de otros profesionales en la misma propiedad, entonces 404 (§7.5) —
  salvo sus propios trabajos (AC-3.25).
- **AC-3.32** Dada una cuenta con acceso limitado, cuando consulta sus endpoints, entonces su
  vista no cambia: **sin** archivos, historial ni nuevos datos (§4.3, alcance §1).

---

## 11. Casos excepcionales (comportamiento esperado)

| Caso | Comportamiento esperado |
|---|---|
| Cierre concurrente con la finalización de un job | La validación de §6.4 se re-evalúa **dentro** de la transacción de cierre (lock por fila de orden): si algún job aún no está terminal, 409; dos cierres simultáneos: uno gana, el otro 409 (estado ya `completed`). |
| Cancelación y cierre en paralelo | La precondición (jobs con `started_at` / estado de la orden) se verifica en la misma transacción: gana una; la otra recibe 409 por estado. |
| Doble `start` o `complete` repetido | 409: las transiciones siguen la máquina §20.2; ningún evento se duplica en `job_events`. |
| `not_realized` desde `pending` (job nunca asignado) | Válido: §20.2 lo permite desde cualquier estado no terminal; no se exige asignación previa. |
| Orden con **todos** los jobs `not_realized` sin haber empezado (nunca `in_progress`) | Cumple a la vez la precondición de cierre (§6.4: todos terminales con motivo) y la de cancelación (§20.1: sin trabajo realizado). El responsable elige; ambas vías quedan auditadas. |
| Orden `requested` (pedido de cuenta limitada sin convertir) | `close`/`cancel` responden 409: debe convertirse primero (flujo de la Etapa 2, §5.1). |
| El profesional marca trabajo de otro | 403 (si ve el trabajo) u 404 (si está fuera de su alcance): §6.1, §16.3. |
| Reasignar con el trabajo en curso | 409: primero el profesional informa `incomplete` (§6.2); así el motivo y el estado quedan en `job_events` antes del cambio de responsable. |
| Asignación aceptada y luego revocada mientras el job sigue `accepted` | Job vuelve a `pending`; `started_at` sigue nulo → la orden sigue siendo cancelable (§20.1 «si no se realizó ningún trabajo»). |
| Fallo del storage después de guardar los bytes y antes de la fila | Se intenta eliminar la clave de forma best-effort; no se escribe audit (la operación falló); la API responde 500 RFC 7807 y el cliente puede reintentar. |
| Reintento de upload (mismo archivo) | Cada upload crea su propia fila y clave (id con sufijo/UUID): no hay idempotencia implícita; el duplicado es visible y auditable. |
| Archivo borrado lógicamente referenciado en el historial | El historial muestra la metadata con `deleted_at` (la existencia ya fue conocida legítimamente); la descarga responde 404. |
| Share hacia una membresía revocada o inexistente | 404/422 al crear; un share previo a una membresía revocada deja de otorgar acceso (el permiso se evalúa por request, §16.6). |
| Share de una propiedad que la empresa no posee ni gestiona | 404/409: solo se comparten antecedentes de los que la empresa es dueña (§7.5). |
| Tamaño/content type del archivo | 10 MB y allowlist (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `text/plain`, `text/csv`, formatos Office `openxml`): fuera de eso, 415/422; nada se almacena. |
| Nombres de archivo maliciosos (rutas, `..`, no-ASCII) | Se sanean al guardar (`filename` es metadata, la clave de storage es un UUID generado); nunca se reflejan en `Content-Disposition` sin codificar. |
| Datos sensibles en payloads | Motivos, mensajes y filenames **nunca** en logs de la aplicación; en audit log solo ids, tipo y tamaño (§16.4); códigos de acceso e `entry_instructions` siguen sin aparecer en eventos nuevos. |
| Revocación/membresía perdida con un upload o descarga en vuelo | El permiso se evalúa al recibir el request: el request en curso puede completar; todos los siguientes fallan (criterio aceptado en etapa-1 §11). |
| `job_events` o `audit_log` intentando UPDATE/DELETE desde la app | Error de permiso de BD: ambos son append-only con grants restringidos (§1.1.8, §7). |
| Retención de documentos con periodo | Sin periodo definido (§18.4 abierto): en la v1 no hay purga; el retiro es lógico y documentado. **Supuesto pendiente** — si se define una retención, se implementa como purga programada que también audita. |

---

## Preguntas para aprobar antes de implementar

**Resuelta:**

1. **Contradicción detectada en `proyect.md` §5.6 ↔ §20.1 — RESUELTA (17/10/2026, decisión
   del dueño):** manda §20.1: si un contratista rechaza una orden, la administradora **crea
   una nueva orden** para otro contratista conservando la referencia a la rechazada; la
   rechazada **no se reabre**. Enmienda aplicada en `proyect.md` (§5.6 y nota en su
   historial) y registrada en `MEMORY.md` §3. Queda retirada de §5.6 la opción «o cancelarla»,
   que §20.1 no contempla entre sus transiciones. Efecto en esta etapa: **ninguno** mientras
   el rechazo de órdenes siga fuera de alcance (pregunta 2).

**Pendientes de decisión del dueño (2 a 7):**

2. **¿Aceptación/rechazo de la orden a nivel de orden en esta etapa?** Mi propuesta: **no**
   (fuera de alcance, §1): la Etapa 2 aprobó modelarlo a nivel de asignación y no existe el
   modelo «orden enviada a otra empresa». Si lo quieres dentro, se agrega una sección a la
   spec (el mecanismo ya está decidido en la pregunta 1: nueva orden que referencia la
   rechazada).
3. **Responsable de las decisiones (§1.7):** miembro activo de la empresa dueña de la
   orden/job para `not_realized`/`resume`/`revoke`/`reassign`/`close`/`cancel`. ¿Apruebas? (§5.6
   habla también de «el contratista que la gestiona»; en nuestros dos modelos ese contratista
   **es** el dueño de la orden derivada — el caso de un contratista con asignación sobre la
   orden de otra empresa queda como futura ampliación si la necesitas.)
4. **Autoridad de cierre (§1.7/AC-3.17):** cualquier miembro activo de la empresa originadora,
   o solo `owner`? (§6.4 dice «usuario autorizado» sin definir el rol.)
5. **Cambio de comportamiento de la Etapa 2 (§1.1):** aceptar la asignación deja el job en
   `accepted` (hoy salta a `in_progress`) y el inicio pasa a ser `start` explícito. Es
   necesario para respetar §20.1-§20.2 y la regla de cancelación. Implica actualizar un aserto
   del e2e de la Etapa 2. ¿Apruebas?
6. **Notificaciones in-app de la Etapa 3 (§1):** fuera de alcance según `plan.md`. Si quieres
   aviso al responsable cuando un profesional marca `incomplete` y al asignado cuando le
   reasignan, se agregan tipos de `NotificationType` reutilizando la infra de la Etapa 2 —
   dilo y lo incorporo a la spec.
7. **Supuesto §18.4 (retención de documentos):** borrado lógico y conserva indefinida en la
   v1, con retiro documentado en audit (§1.1.8). Cuando definas requisitos de retención, se
   agrega la purga.
