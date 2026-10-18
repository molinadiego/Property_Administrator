# Especificación técnica — Etapa 2: Propiedades y órdenes

> **Aprobada el 17/10/2026** por el dueño. Decisiones confirmadas: (1) cuentas de acceso limitado
> con **token opaco** entregado por correo (hash en BD); (2) `'own_business'` en `CompanyType`;
> (3) relación profesional↔cliente con tabla explícita `client_relationships`;
> (4) notificaciones in-app con tipo enumerado + `read_at`.
> Derivada de `docs/plan.md` §Etapa 2 = `proyect.md` §17 (Etapa 2).
> Las reglas de negocio se referencian por § a `proyect.md`, nunca se copian.

---

## 1. Alcance

Según `docs/plan.md` §Etapa 2, esta etapa implementa:

- **Propiedades e inquilinos** (`proyect.md` §4.1–§4.5).
- **Cuentas con acceso limitado** para propietarios, inquilinos y clientes propios (§4.3, §5.1).
- **Creación de órdenes**, siempre vinculadas a una propiedad (§5.1).
- **Alcance de los trabajos** (§5.3) y **órdenes compuestas** con división de trabajos (§5.5).
- **Asignación, aceptación y rechazo** (§5.6).
- **Notificaciones in-app básicas** para probar aceptación/rechazo sin depender del correo (§17 Etapa 2).

**Fuera de alcance de esta etapa** (pertenecen a etapas posteriores):

- Avances, finalización, trabajo incompleto, reasignación y «no pudo concretarse» → **Etapa 3** (§6).
- Fotografías, documentos e historial de archivos → **Etapa 3** (§7).
- Costos, límites de gasto, autorizaciones económicas → **Etapa 4** (§8).
- Facturas, PDF, pagos, saldos → **Etapa 5** (§11).
- Presupuestos (§5.4): **no se implementan**; §5.4 solo exige *no* generar presupuestos automáticos.
- Email real de asignación/órdenes (§14.1): la notificación de esta etapa es **in-app**; el correo con Resend queda operativo en modo sandbox (ver `MEMORY.md` §8) y no bloquea el criterio de salida.

### Decisiones de diseño que este borrador propone (requieren aprobación)

Son modelado técnico, no reglas de negocio nuevas:

1. **Un tipo de empresa distingue el negocio propio de un profesional** (§2). Agrega un cuarto valor al enum `CompanyType` existente, hoy limitado a administradora/contratista.
2. **El «pedido de trabajo» de una cuenta con acceso limitado es una orden en estado `requested`** (§4.3, §5.1), no un modelo aparte. Un usuario de la empresa o el profesional con el que se relaciona la **convierte** en orden real.
3. **La relación «cliente propio de un profesional» se modela explícitamente** (§2.3, §5.1, §4.3). No existe en el modelo de la Etapa 1 y es necesaria para dar cuenta de acceso limitado a clientes y de órdenes que el profesional crea para ellos.
4. **Notificación in-app con tipo enumerado y `read_at`** (§7, §10). Alcance suficiente para el criterio de salida sin sobre-modelar (reglas específicas de notificación abiertas en §18.4).
5. **Cuentas con acceso limitado NO usan la cookie de sesión** (§3): propongo un **token de acceso limitado** para que un inquilino/propietario/cliente consulte sus órdenes sin tener contraseña. Es el punto que más necesita tu decisión (ver §3 y AC-4.x).

---

## 2. Modelo de datos

Convenciones heredadas de `docs/especificacion/etapa-1.md` §2: `id` UUID, `created_at`/`updated_at` en UTC (`timestamptz`), `company_id` en toda tabla *tenant-scoped*. En esta etapa **no** se persiste dinero (los costos llegan en la Etapa 4).

### 2.1 Cambios en enums existentes

| Enum | Cambio | Motivo |
|---|---|---|
| `CompanyType` | se agrega `'own_business'` | El profesional independiente administra su propio negocio (§2.3, §3.1). Distinguirlo permite dar acceso limitado a *sus* clientes sin confundirlos con clientes de un contratista. |
| `MembershipRole` | **sin cambio** (`'owner'` \| `'member'` en empresas) | Los tipos de participación de esta etapa (propietario, inquilino, cliente propio) **no** son roles de `memberships`: son vínculos con una propiedad o relación (§2.4–§2.7). |

### 2.2 `properties` — propiedad (§4.1, §4.2)

Una propiedad pertenece a **una empresa** (el `company_id` es el *tenant*). Toda query pasa por el tenant guard (§16.2).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | índice; *tenant* |
| owner_name / owner_phone / owner_email | text null | propietario (§4.1) |
| owner_address / owner_city / owner_state / owner_postal_code | text null | dirección del propietario (§4.1) |
| address_line | text | dirección completa de la propiedad (mínimo para crear ficha, §5.1) |
| city | text | mínimo (§5.1) |
| state | text | mínimo (§5.1) |
| postal_code | text null | |
| occupancy | enum | `'occupied'` \| `'vacant'` |
| community_name | text null | comunidad/complejo (§4.2) |
| community_access_code | text null | código de acceso a la comunidad (§4.2); acceso restringido, ver §2.8/§11 |
| entry_instructions | text null | instrucciones de entrada (§4.2) |
| allow_unattended_entry | boolean | autorización para ingresar sin inquilino presente (§4.2) |
| pets_info | text null | información sobre mascotas (§4.2) |
| other_instructions | text null | otras instrucciones operativas (§4.2) |
| created_by | uuid FK → users | |
| created_at / updated_at | timestamptz | |

**Notas:**
- §4.1/§4.2 dicen «puede incluir»: solo `address_line`, `city` y `state` son mínimos para crear la ficha.
- El **código de lockbox no vive aquí** (§4.2): va en la orden (§2.6), porque rota periódicamente.

### 2.3 `tenants` — cuenta con acceso limitado (§4.3, §5.1)

Registro separado de `users`. No tiene `password_hash` ni `locale`: no inicia sesión con credencial propia. Se vincula a una propiedad (propietario/inquilino) o a una relación de cliente propio (§2.5).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text | nombre (§4.3) |
| phones | jsonb | lista de teléfonos (§4.3: «teléfono o teléfonos») |
| address | text null | dirección del inquilino, cuando corresponda |
| availability | text null | franjas horarias disponibles para la visita (§4.3) |
| created_at / updated_at | timestamptz | |

**Nota (§4.3):** si la propiedad está **vacante**, no se exigen datos de inquilino.

### 2.4 `property_tenants` — vínculo propiedad ↔ cuenta limitada (§4.2, §4.3)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| property_id | uuid FK → properties | índice |
| tenant_id | uuid FK → tenants | índice |
| kind | enum | `'owner'` (propietario) \| `'tenant'` (inquilino) |
| created_by | uuid FK → users | |
| created_at | timestamptz | |

`@@unique([property_id, tenant_id])`.

### 2.5 `client_relationships` — cliente propio de un profesional (§2.3, §4.3, §5.1)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | empresa del profesional (`own_business`); *tenant* |
| tenant_id | uuid FK → tenants | el cliente, como cuenta de acceso limitado |
| created_by | uuid FK → users | |
| created_at / updated_at | timestamptz | |

`@@unique([company_id, tenant_id])`.

### 2.6 `orders` — orden de trabajo (§5.1–§5.8)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | empresa que *posee* la orden; *tenant* |
| property_id | uuid FK → properties | **obligatorio** (§5.1) |
| title | text | título breve |
| description | text | descripción clara del trabajo solicitado (§5.3) |
| origin | enum | `'management'` \| `'contractor'` \| `'own_business'` (§5.1) |
| originator_id | uuid FK → users | usuario creador (la «entidad originadora», §5.3) |
| client_relationship_id | uuid null FK → client_relationships | solo cuando `origin = 'own_business'` |
| parent_order_id | uuid null FK → orders | orden de la que deriva (§5.3 cambio de objetivo; §5.5 compuesta) |
| access_lockbox | text null | lockbox de la visita (§5.8); **no** en la propiedad |
| access_community_code | text null | código de comunidad cuando cambia con frecuencia (§5.8) |
| access_entry_instructions | text null | instrucciones de entrada de la visita (§5.8) |
| status | enum | ver §2.10 |
| created_at / updated_at | timestamptz | |

**Presupuestos (§5.4):** no hay tabla; se cumple por ausencia.

### 2.7 `jobs` — trabajos de una orden (§5.3, §5.5, §5.6)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK → orders | índice |
| company_id | uuid FK → companies | *tenant* (denormalizado para el tenant guard) |
| title | text | |
| description | text | |
| sort_order | int | posición dentro de la orden (§5.5) |
| status | enum | ver §2.10 |
| created_at / updated_at | timestamptz | |

`@@unique([order_id, sort_order])`. Una orden simple tiene **un** job; una compuesta, varios.

### 2.8 `assignments` — asignación de un trabajo (§5.6, §5.7)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| job_id | uuid FK → jobs | índice |
| company_id | uuid FK → companies | *tenant* |
| assignee_membership_id | uuid FK → memberships | a quién se asigna |
| status | enum | `'pending'` \| `'accepted'` \| `'rejected'` |
| assigned_by | uuid FK → users | quién asignó |
| responded_at | timestamptz null | cuándo aceptó/rechazó |
| rejection_reason | text null | §5.6 |
| created_at | timestamptz | |

**Regla (§5.6, §5.7):** puede haber **varias asignaciones** por job; las anteriores se conservan. Solo la **activa** (`pending`/`accepted`) otorga acceso operativo a la información sensible (§4.5, §5.8).

### 2.9 `notifications` — notificación in-app (§17 Etapa 2)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | destinatario (cuenta con sesión) |
| company_id | uuid FK → companies | contexto; *tenant* |
| type | enum | ver §2.10 |
| title / body | text | resumen y detalle |
| entity_type | text | `'order'`, `'job'`, `'assignment'`, `'property'`, etc. |
| entity_id | uuid | id del recurso relacionado |
| link | text null | ruta del frontend (opcional) |
| read_at | timestamptz null | `null` = no leída |
| created_at | timestamptz | índice `(user_id, created_at DESC)` |

### 2.10 Estados (enums nuevos)

| Enum | Valores | Notas |
|---|---|---|
| `PropertyOccupancy` | `occupied` \| `vacant` | §4.3 |
| `PropertyTenantKind` | `owner` \| `tenant` | §4.2/§4.3 |
| `OrderOrigin` | `management` \| `contractor` \| `own_business` | §5.1 |
| `OrderStatus` | `requested` \| `open` \| `assigned` \| `completed` \| `cancelled` | `requested` = pedido de cuenta limitada sin convertir (§4.3, §5.1). `completed`/`cancelled` mínimos; lógica de cierre en Etapa 3/§6.4. |
| `JobStatus` | `pending` \| `in_progress` \| `done` \| `not_realized` | Seguimiento completo (§6) es Etapa 3; aquí se usa `pending` y se respeta que cada job avanza por separado (§5.5). |
| `AssignmentStatus` | `pending` \| `accepted` \| `rejected` | §5.6 |
| `NotificationType` | `order_created` \| `order_assigned` \| `assignment_requested` \| `assignment_accepted` \| `assignment_rejected` \| `job_added` | ver §7 |

### 2.11 Índices globales

- `properties`: `(company_id)`, `(company_id, created_at)`.
- `property_tenants`: `(property_id)`, `(tenant_id)`.
- `client_relationships`: `(company_id)`, `(tenant_id)`.
- `orders`: `(company_id, created_at)`, `(property_id)`, `(parent_order_id)`.
- `jobs`: `(order_id, sort_order)`, `(company_id)`.
- `assignments`: `(job_id)`, `(company_id)`, `(assignee_membership_id)`.
- `notifications`: `(user_id, created_at DESC)`, `(user_id, read_at)`.

### 2.12 Aislamiento entre empresas y órdenes derivadas (§5.2, §16.8)

§16.8 exige que una empresa no consulte **órdenes privadas** de otra; §5.2 permite enviar una orden a un contratista. Se resuelven **dos modelos**, ambos soportados:

1. **Orden en el espacio propio:** la orden vive en el `company_id` de quien la creó; el contratista recibe un **job** asignado y ve solo ese trabajo, no el resto del espacio de la administradora.
2. **Orden derivada:** la administradora crea la orden *en el espacio del contratista*; ahí el contratista es dueño en su propio `company_id`.

En ambos, el servidor verifica permiso por recurso (§16.1, §3.4) y **una empresa jamás lista órdenes de otro `company_id`** (§16.8). Regla operativa de la etapa: *una orden solo es visible si su `company_id` es el del usuario, o si el usuario tiene una asignación activa sobre alguno de sus jobs*. Detallado en §5 y probado en §6.

---

## 3. Convenciones de la API

Se **referencian** las de `docs/especificacion/etapa-1.md` §3 (prefijo `/api/v1`, cookie `mh_session`, permisos por request, tenant guard, códigos, RFC 7807, paginación). No se repiten.

**Agregado en esta etapa:**
- Nuevas listas paginadas (`/properties`, `/orders`, `/jobs`, `/notifications`) con el mismo esquema `{ data, nextCursor }`.
- **Sesión vs. acceso limitado:** las cuentas con acceso limitado (`tenants`) **no** usan la cookie `mh_session`. Sus endpoints (§4.4) se rutean por un **token de acceso limitado**.

> **Decisión a aprobar (la más importante):** para exponer los endpoints de una cuenta limitada sin sesión, propongo un **token de acceso limitado** (opaco o JWT corto, guardado solo como hash) entregado por correo al vincular la cuenta, al estilo de las invitaciones de Etapa 1. Alternativa más simple: que toda cuenta limitada se maneje desde la cuenta del profesional/empresa (sin acceso propio, sin endpoints `/limited`). **Requiere tu decisión**; se refleja en AC-4.x como supuesto.

---

## 4. Endpoints

Todos documentados en `/api/v1`; los *tenant-scoped* derivan `company_id` de la membresía, nunca del cliente (§16.2).

### 4.1 Propiedades e inquilinos

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/companies/:id/properties` | Crea ficha (mínima o completa) | miembro activo | 201 / 404 / 422 |
| GET | `/companies/:id/properties` | Lista paginada | miembro activo | 200 / 404 |
| GET | `/companies/:id/properties/:propId` | Detalle | miembro activo | 200 / 404 |
| PATCH | `/companies/:id/properties/:propId` | Editar ficha (§4.4) | miembro activo | 200 / 403 / 404 |
| POST | `/companies/:id/properties/:propId/tenants` | Registra inquilino y lo vincula (§4.3) | miembro activo | 201 / 404 / 422 |
| PATCH | `/companies/:id/tenants/:tenantId` | Editar datos del inquilino (§4.4) | miembro activo | 200 / 403 / 404 |

### 4.2 Clientes propios (§2.3, §4.3, §5.1)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/companies/:id/clients` | Registra un cliente propio (empresa `own_business`) | miembro activo | 201 / 403 / 404 |
| GET | `/companies/:id/clients` | Lista de clientes propios | miembro activo | 200 / 404 |

### 4.3 Órdenes y trabajos (§5.1–§5.8)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/companies/:id/orders` | Crea orden vinculada a propiedad; puede crear su primer job | miembro activo | 201 / 404 / 422 |
| GET | `/companies/:id/orders` | Lista paginada (espacio propio; §2.12) | miembro activo | 200 / 404 |
| GET | `/companies/:id/orders/:orderId` | Detalle de la orden y sus jobs | miembro activo o asignado activo | 200 / 404 |
| PATCH | `/companies/:id/orders/:orderId` | Editar instrucciones/acceso de la orden que gestiona (§4.4, §5.8) | miembro activo del espacio dueño o con asignación activa | 200 / 403 / 404 |
| POST | `/companies/:id/orders/:orderId/jobs` | Agrega trabajo (compuestas, §5.5) | miembro activo | 201 / 403 / 404 |
| POST | `/companies/:id/orders/:orderId/assignments` | Asigna un job (§5.6) | miembro activo | 201 / 404 |
| POST | `/companies/:id/assignments/:assignId/accept` | Acepta (§5.6) | asignado | 204 / 403 / 404 |
| POST | `/companies/:id/assignments/:assignId/reject` | Rechaza, con motivo opcional (§5.6) | asignado | 204 / 403 / 404 |
| POST | `/companies/:id/assignments/:assignId/reassign` | Reasigna (§5.7) — aquí solo crea la nueva asignación conservando historial | miembro activo | 201 / 403 / 404 |

### 4.4 Pedidos de cuentas con acceso limitado (§4.3, §5.1)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/limited/:token/requests` | Cuenta limitada pide un trabajo; se crea orden `requested` | token acceso limitado | 201 / 401 / 404 |
| GET | `/limited/:token/orders` | Órdenes de su vivienda/relación, **sin costos ni facturas** (§4.3) | token acceso limitado | 200 / 401 / 404 |

### 4.5 Notificaciones in-app

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| GET | `/notifications` | Lista paginada del usuario | sesión | 200 |
| POST | `/notifications/:notifId/read` | Marca como leída | sesión | 204 / 404 |

---

## 5. Reglas de permisos (resumen normativo)

Referenciadas por §, sin copiar:

1. **Verificación en el servidor por operación** (§16.1, §3.4).
2. **Tenant guard** (§16.2, §16.8): `company_id` de la membresía; orden de otra empresa → **404**.
3. **Visibilidad de órdenes** (§16.8, §2.2, §2.3): visible si `company_id` propio o asignación activa sobre algún job. Un contratista no ve más allá de lo asignado; un profesional asignado a un job no ve los demás trabajos.
4. **Datos oficiales de la propiedad** (§4.4): solo la administradora modifica la ficha; el contratista edita instrucciones de la orden que gestiona; el profesional solo reporta error.
5. **Información de acceso y sensible** (§4.5, §5.8): lockbox/códigos/datos del inquilino solo al profesional con **asignación activa**; al perderla, pierde ese acceso sin borrar historial.
6. **Cuentas con acceso limitado** (§4.3): solo estado de órdenes de su vivienda/relación; **nunca** costos, facturas ni otras propiedades/relaciones.
7. **Creación de órdenes** (§5.1): las cuentas limitadas no crean órdenes; su pedido se transforma en orden por un usuario de la empresa o el profesional relacionado.
8. **Aislamiento de clientes propios** (§4.3, §2.3): no visibles para otras empresas (§16.8).
9. **Rechazo no cancela el trabajo** (§5.6): deja el job `pending` para reasignar, sin borrar la orden ni su historial.

---

## 6. Matriz de permisos como tests de integración (§16.1)

Tests con Testcontainers + PostgreSQL real. **Si un escenario falla, no se pasa de etapa.**

| # | Escenario | Esperado |
|---|---|---|
| 1 | Request autenticado sin sesión | 401 |
| 2 | Miembro de empresa A: `GET` propiedad de empresa B | 404 |
| 3 | Miembro de empresa A: crear propiedad en empresa B | 404 |
| 4 | Miembro de empresa A: `GET` orden de empresa B (sin asignación) | 404 |
| 5 | Contratista ve orden de la administradora **no** asignada | 404 |
| 6 | Contratista ve la orden con job asignado | 200 |
| 7 | Profesional asignado a un job ve **solo** su job | 200 su job; demás restringido (§2.3) |
| 8 | Profesional **no** asignado lee lockbox de la orden | 404/403 |
| 9 | Profesional con asignación **activa** lee el lockbox | 200 |
| 10 | Tras **rechazar**, el profesional ya no lee el lockbox | 404/403 |
| 11 | Cuenta limitada lista órdenes de su vivienda | 200, solo estado (sin costos/facturas) |
| 12 | Cuenta limitada ve otra propiedad/relación | 401/404 |
| 13 | Cuenta limitada **crea** una orden directamente | 401 — no tiene sesión de empresa (su único flujo es el pedido `requested` de §5.1; jamás crea órdenes reales) |
| 14 | Usuario de la empresa convierte un pedido `requested` | pasa a `open`, audit log |
| 15 | Inquilino sobre propiedad **vacante** sin datos | 422 (§4.3) |
| 16 | Contratista edita datos oficiales de la propiedad | 403 (§4.4) |
| 17 | Contratista edita instrucciones de la orden que gestiona | 200 |
| 18 | Profesional edita la ficha de la propiedad | 403 (solo reporta, §4.4) |
| 19 | Rechazo deja el job `pending` y conserva historial | job `pending`, asignaciones intactas |
| 20 | Reasignación conserva la asignación anterior | 2 asignaciones: vieja `rejected`, nueva `pending` |
| 21 | Orden sin propiedad vinculada | 422 (§5.1) |
| 22 | Orden compuesta: job extra asignado a otro profesional | 201, cada job con su asignación |
| 23 | Cada acción genera su entrada de audit log con actor y fecha | aserción por acción (§7) |
| 24 | Usuario ve **solo sus** notificaciones | 200, lista filtrada por `user_id` |

---

## 7. Eventos de audit log de la Etapa 2

Mínimo exigido por §12 («quién y cuándo») y §4.4:

| `action` | `entity_type` | Cuándo |
|---|---|---|
| `property.created` / `property.updated` | property | alta y edición de ficha |
| `property_tenant.added` | property_tenant | vínculo propietario/inquilino |
| `tenant.updated` | tenant | edición de datos de inquilino |
| `client.created` | client_relationship | registro de cliente propio |
| `order.created` / `order.updated` | order | creación y edición de instrucciones/acceso |
| `order.converted_from_request` | order | pedido convertido en orden |
| `job.added` | job | trabajo agregado a orden compuesta |
| `assignment.created` | assignment | asignación de trabajo |
| `assignment.accepted` / `assignment.rejected` | assignment | respuesta (en rechazo: motivo) |
| `assignment.reassigned` | assignment | reasignación con historial |

El `payload` guarda antes/después donde aplique. Los datos sensibles (códigos, teléfonos de inquilino) **nunca** van en el audit log.

---

## 8. Pruebas

- **Unitarias (Jest):** validación de propiedad mínima (§5.1), transiciones de `OrderStatus`/`AssignmentStatus`, la regla de que rechazo no cancela el job (§5.6), visibilidad de orden por asignación activa (§2.12), extracción del token de acceso limitado.
- **Integración (Testcontainers + PostgreSQL real):** la matriz completa de §6, incluyendo el flujo pedido → conversión → asignación → aceptación/rechazo end-to-end con notificación in-app.
- **Contrato:** OpenAPI regenerado con `npm run openapi:update` y comparado en el gate local (patrón de Etapa 1).

---

## 9. Definición de hecho (Etapa 2)

Igual que el criterio de salida de la Etapa 2 en `docs/plan.md`:

1. **Creación → asignación → aceptación/rechazo** funcionan extremo a extremo con **notificación in-app**.
2. Las **cuentas con acceso limitado** ven exactamente lo que dice §4.3 (y nada más).
3. Un usuario de una empresa **no puede consultar órdenes privadas de otra** (§16.8), verificado por tests.
4. Matriz de §6 completa y verde en el gate local (`npm run check`).
5. `/api/docs` completo con los endpoints nuevos.

---

## 10. Criterios de aceptación (Given/When/Then)

Cada criterio se implementa como test (§8). Reglas por referencia (§x), no copia. **Supuesto** marca una decisión técnica propuesta que requiere aprobación.

### 10.1 Propiedades e inquilinos

- **AC-1.1** Dado un miembro activo, cuando crea una propiedad con los campos mínimos, entonces 201 y `property.created` (§5.1, §4.2).
- **AC-1.2** Dado un miembro activo, cuando registra un inquilino sobre propiedad **ocupada**, entonces 201, vínculo `kind='tenant'` y `property_tenant.added` (§4.3).
- **AC-1.3** Dada propiedad **vacante**, cuando se intenta inquilino sin nombre/teléfono, entonces 422 (§4.3).
- **AC-1.4** Dado un miembro activo, cuando edita datos oficiales, entonces 200 y `property.updated` con actor y fecha (§4.4).
- **AC-1.5** Dado un contratista, cuando intenta editar datos oficiales, entonces 403 (§4.4).

### 10.2 Órdenes y trabajos

- **AC-2.1** Cuando se crea una orden **sin** propiedad, entonces 422 (§5.1).
- **AC-2.2** Cuando se crea una orden con propiedad y descripción, entonces 201, `order.created` y su primer job creado (§5.1, §5.3).
- **AC-2.3** Dado el creador, cuando lee la orden, entonces 200 con la información de acceso **en la orden** (lockbox no en la propiedad, §5.8).
- **AC-2.4** Cuando se agrega un trabajo a una orden compuesta, entonces 201 y cada job con su operativa y `sort_order` (§5.5).
- **AC-2.5** Dado un contratista gestor, cuando edita las instrucciones de acceso de **su** orden, entonces 200 (§4.4, §5.8).
- **AC-2.6** Dado un profesional, cuando intenta editar la ficha de la propiedad, entonces 403 (solo reporta error, §4.4).

### 10.3 Asignación, aceptación y rechazo

- **AC-3.1** Cuando se asigna un job, entonces 201, asignación `pending` y `assignment.created` (§5.6).
- **AC-3.2** Dado el asignado, cuando **acepta**, entonces 204, `accepted` y `assignment.accepted` (§5.6).
- **AC-3.3** Dado el asignado, cuando **rechaza**, entonces 204, el job queda `pending` (no se cancela) y `assignment.rejected` con motivo (§5.6).
- **AC-3.4** Dado un responsable, cuando **reasigna** tras un rechazo, entonces 201, la asignación anterior se conserva y `assignment.reassigned` (§5.7).
- **AC-3.5** Dado un profesional con asignación **activa**, cuando lee la información sensible (lockbox, datos del inquilino), entonces 200 (§4.5, §5.8).
- **AC-3.6** Dado el mismo profesional **tras perder** la asignación, cuando intenta leer esa información, entonces 404/403 sin borrar historial (§4.5).

### 10.4 Cuentas con acceso limitado

- **AC-4.1** *(Supuesto: token de acceso limitado, §3)* Cuando una cuenta limitada consulta sus órdenes, entonces 200 con **solo el estado**, sin costos ni facturas (§4.3).
- **AC-4.2** Cuando una cuenta limitada consulta otra propiedad/relación, entonces 401/404 (§4.3, §16.8).
- **AC-4.3** Cuando una cuenta limitada intenta **crear** una orden directamente, entonces 403 (§5.1).
- **AC-4.4** Cuando una cuenta limitada envía un pedido, entonces 201 con orden `requested` y `order.created` (§4.3, §5.1).
- **AC-4.5** Dado un usuario de la empresa, cuando convierte el pedido, entonces 200, pasa a `open` y `order.converted_from_request` (§5.1).

### 10.5 Aislamiento entre empresas

- **AC-5.1** Dado un miembro de empresa A, cuando consulta propiedad/orden de la empresa B, entonces 404 (§16.8).
- **AC-5.2** Dado un contratista, cuando lista órdenes, entonces ve las de su espacio y las asignadas, **nunca** órdenes privadas de la administradora sin asignación (§2.2).
- **AC-5.3** Dado un profesional asignado a **un** job, cuando consulta la orden, entonces ve su trabajo y no los de otros profesionales (§2.3).

### 10.6 Notificaciones in-app

- **AC-6.1** Dado un evento de la etapa, cuando ocurre, entonces se crea una notificación con `type`, `entity_type` e `entity_id` correctos (§17, §7).
- **AC-6.2** Dado un usuario, cuando lista sus notificaciones, entonces ve **solo** las suyas, paginadas (§16.8).
- **AC-6.3** Dado un usuario, cuando marca una como leída, entonces 204 y `read_at` establecido.

---

## 11. Casos excepcionales (comportamiento esperado)

| Caso | Comportamiento esperado |
|---|---|
| Orden sin propiedad | 422 (§5.1); validación de DTO. |
| Propiedad vacante con inquilino exigido | 422 (§4.3). |
| Código de lockbox en la propiedad | No ocurre: el modelo no lo permite; vive en la orden (§4.2, §5.8). |
| Rechazo simultáneo de dos asignaciones sobre el mismo job | Lock por fila de job: una gana; la otra 404/409; el job queda `pending`. |
| Reasignación en paralelo tras un rechazo | Ambas asignaciones en el historial; solo la nueva queda activa (§5.7). |
| Cuenta limitada con token expirado/revocado | 401/404; hash en BD, nunca el token crudo (patrón Etapa 1). |
| Datos sensibles del inquilino o códigos en payloads/audit log | Nunca (§4.5); solo campos operativos necesarios. |
| Cambio de objetivo con trabajo ya realizado | §5.3: no se cancela la orden completa; se vincula una nueva (`parent_order_id`); la cancelación/derivación completa es Etapa 3. |
| Orden compuesta con un job rechazado y otro aceptado | Cada trabajo avanza por su lado (§5.5). |
| Listar notificaciones de otro usuario | 200 con lista filtrada por `user_id` propio; jamás ajenas (§16.8). |
| Pedido `requested` que nadie convierte | Permanece `requested`; estado explícito y auditable. |

---

## Preguntas para aprobar antes de implementar

**Resueltas el 17/10/2026 (aprobación del dueño):**

1. **Token de acceso limitado (§3 / AC-4.1):** ✔ aprobado — token opaco entregado por correo al vincular la cuenta; en la BD solo su hash (patrón de las invitaciones de Etapa 1).
2. **`own_business` en `CompanyType`:** ✔ aprobado.
3. **Cliente propio modelado como `client_relationships`:** ✔ aprobado.
4. **Notificaciones in-app con tipo enumerado + `read_at`:** ✔ aprobado.
