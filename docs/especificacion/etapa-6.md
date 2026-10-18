# Especificación técnica — Etapa 6

Documento de implementación de la **Etapa 6 (Funciones complementarias)** del
`docs/plan.md`, derivado de `proyect.md` (requisitos aprobados v1.0). Las
referencias (§x) apuntan a `proyect.md`.

Base normativa: `proyect.md` §12, §13, §14 (14.1–14.3), §15, §16, §17,
§18.3, §18.4 (resueltos el 18/10/2026), §20.

> **Estado: aprobada para implementar (18/10/2026).** Aprobada por el dueño
> con las 7 decisiones de diseño D1–D7 de §1.2. Regla SDD cumplida
> (`AGENTS.md`): el criterio de aceptación de cada regla es un test.

---

## 1. Alcance

### 1.1 Entra / queda fuera

**Entra (§17 Etapa 6, `docs/plan.md`):**

- **Garantías y reparaciones repetidas (§13):** reclamos de garantía
  ligados al trabajo reparado, iniciados y gestionados por la empresa
  originadora de la orden original, privados en su propio espacio.
- **Notificaciones avanzadas (§14 + §18.4):**
  - Marcado de orden como **urgente** (§14.2) con **ventana de respuesta
    configurable por empresa** (24 h por defecto), **recordatorio** a mitad
    de ventana a quien debe responder y **escalación** al vencer al
    responsable de la empresa (§18.4). La falta de respuesta no autoriza
    gastos ni trabajos (§14.2).
  - **Preferencias de notificación por usuario y tipo** (§18.4): el aviso
    siempre queda en la aplicación; cada usuario decide si además recibe
    correo. Transaccionales por defecto sí.
  - **Correo de §14.1 que faltaba** para los tipos in-app existentes
    (nuevas órdenes, asignaciones y cambios de asignación).
- **Suscripciones (§15 + §18.3):** planes por categoría (profesional,
  contratista, administradora) con precios de ejemplo 33/66/99 USD/mes,
  sin límites de uso ni funciones diferenciadas; el sistema asocia cada
  empresa a su plan. **La cobranza queda fuera del sistema** (§18.3).
- **Corrección de registros erróneos (§18.4):** verificación de que toda
  corrección de datos maestros (propiedades, inquilinos) deja auditoría;
  los historiales siguen siendo solo correctivos (patrón vigente).

**Queda fuera:**

- **Integraciones y automatizaciones** (§17 las lista pero `proyect.md` no
  las define): **pospuestas** por decisión del dueño (18/10/2026).
- **SMS** (§14.3, pospuesto).
- **Cobro de suscripciones / pasarela de pagos** — la cobranza es externa
  (§18.3); impuestos y obligaciones por estado siguen abiertos en §18.2.
- **Informes nuevos** — solo export contable y listados existentes (§18.4).
- **Interfaz web** (§1: producto nuevo, fuera del alcance del backend).

### 1.2 Decisiones de diseño de esta spec (a aprobar con la spec)

| # | Decisión | Fundamento |
|---|----------|------------|
| D1 | La ventana de respuesta se aplica a la **asignación pendiente** de una orden urgente: es la única «respuesta» con estado en el modelo (la orden no tiene estado «enviada»; la propuesta de asignación sí). Reloj: `assignments.created_at`. | §14.2 + modelo Etapa 2 |
| D2 | **Recordatorio** → al miembro asignado (quien debe responder), in-app + correo. **Escalación** → a los owners de la empresa del asignado, in-app + correo. | §18.4 («a quien debe responder» / «al responsable de la empresa») |
| D3 | Una empresa `own_business` cae en el **plan de profesional independiente** (§15 pide «al menos tres categorías»; no hay cuarta). | §15 |
| D4 | Los importes de los planes se ajustan **por semilla/despliegue** en la v1: no existe rol de administrador de plataforma y no se crea uno. | §18.3 + decisión del dueño 18/10/2026 |
| D5 | Reclamo de garantía: solo para trabajos en estado **Completado**, **privado** de la empresa originadora (otros responden 404), inmutable salvo su resolución. | §13 + §20.2 |
| D6 | Las preferencias cubren **todos los tipos de aviso** (lista in-app + correos de costos, autorizaciones y facturación, por defecto encendidos). **Nunca son opcionales** los correos de autenticación (reset de contraseña, enlace de acceso limitado) ni las invitaciones: son mecanismo de cuenta, no avisos. | §18.4 (interpretación aprobada con la spec) |
| D7 | Barrido de urgencias **cada 15 minutos** con `@nestjs/schedule` (dependencia nueva, justificada en `docs/stack.md` al implementar); idempotencia por marcas de tiempo en la asignación. | §18.4 |

---

## 2. Modelo de datos

Convenciones generales (UUID `@db.Uuid`, timestamps `timestamptz` en UTC,
`company_id` en toda tabla tenant-scoped, `Decimal` para dinero, índices por
tenant): `docs/especificacion/etapa-1.md` §2.

### 2.1 `warranty_claims` (nueva)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID pk | |
| `company_id` | UUID NOT NULL → `companies` | Empresa **originadora** de la orden original (§13); dueño tenant de la fila. |
| `order_id` | UUID NOT NULL → `orders` | Orden original. |
| `job_id` | UUID NOT NULL → `jobs` | Trabajo/reparación original; debe estar `done` (§13, D5). |
| `description` | text NOT NULL | El reclamo del usuario. |
| `status` | enum `warranty_claim_status` | `open` \| `resolved`. |
| `resolution` | text? | Obligatoria al resolver. |
| `resolved_at` | timestamptz? | |
| `resolved_by_user_id` | UUID? → `users` | |
| `created_by` | UUID NOT NULL → `users` | |
| `created_at` / `updated_at` | timestamptz | |

- Índices: `[company_id]`, `[company_id, order_id]`, `[job_id]`.
- **No se duplica el historial de la reparación** (§13: fechas, profesional,
  materiales, costos, fotos y documentos se conservan **enlazando** la orden,
  el trabajo, los costos y los archivos ya existentes; el reclamo aporta
  solo reclamo + resolución).

```prisma
enum warranty_claim_status { open resolved }

model WarrantyClaim {
  id              String        @id @default(uuid()) @db.Uuid
  companyId       String        @map("company_id") @db.Uuid
  orderId         String        @map("order_id") @db.Uuid
  jobId           String        @map("job_id") @db.Uuid
  description     String
  status          WarrantyClaimStatus @default(open)
  resolution      String?
  resolvedAt      DateTime?     @map("resolved_at") @db.Timestamptz()
  resolvedByUserId String?      @map("resolved_by_user_id") @db.Uuid
  createdBy       String        @map("created_by") @db.Uuid
  createdAt       DateTime      @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt       DateTime      @updatedAt @map("updated_at") @db.Timestamptz()
  // company/order/job/user relations + @@index como arriba
}
```

### 2.2 `orders` — campo nuevo

| Campo | Tipo | Reglas |
|---|---|---|
| `urgent` | boolean NOT NULL default `false` | §14.2; solo editable mientras la orden esté activa (§20.1: no `completed` ni `cancelled`). |

### 2.3 `assignments` — campos nuevos (estado de la ventana)

| Campo | Tipo | Reglas |
|---|---|---|
| `urgency_reminded_at` | timestamptz? | Marca de idempotencia del recordatorio (D7). |
| `urgency_escalated_at` | timestamptz? | Marca de idempotencia de la escalación (D7). |

### 2.4 `companies` — campos nuevos

| Campo | Tipo | Reglas |
|---|---|---|
| `urgent_response_hours` | int NOT NULL default `24` | Ventana de respuesta de las órdenes urgentes de **otras** empresas hacia esta (§18.4); rango 1–720. |
| `plan_id` | UUID? → `plans` | Plan explícito; `null` = plan por categoría (D3). |

### 2.5 `plans` (nueva)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID pk | UUIDs fijos en la semilla. |
| `name` | text NOT NULL | |
| `category` | enum `plan_category` | `profesional` \| `contractor` \| `property_management`; **única** (un plan por categoría en la v1). |
| `price` | Decimal(12,2) NOT NULL | USD/mes; semilla: 33.00 / 66.00 / 99.00 (§18.3, valores de ejemplo). |
| `currency` | text NOT NULL default `USD` | |
| `created_at` / `updated_at` | timestamptz | |

- **No hay** campos de límite ni de features: sin límites de uso ni gates
  en la v1 (§18.3). **No hay** endpoint de edición de planes (D4).

### 2.6 `notification_preferences` (nueva)

| Campo | Tipo | Reglas |
|---|---|---|
| `user_id` | UUID pk (compuesto) | Preferencias **por usuario**, no por empresa. |
| `type` | enum pk (compuesto) | Tipo de aviso (ver §2.7). |
| `email_enabled` | boolean NOT NULL default `true` | El in-app nunca se apaga (§18.4). |

- Ausencia de fila = correo **encendido** (default §18.4).

### 2.7 `NotificationType` — valores nuevos

```
urgent_reminder     // recordatorio a mitad de ventana (§18.4)
urgent_escalated    // escalación al vencer la ventana (§18.4)
```

Los 6 tipos existentes (`order_created`, `order_assigned`,
`assignment_requested`, `assignment_accepted`, `assignment_rejected`,
`job_added`) siguen vigentes. Las preferencias se aplican a **todos** los
valores del enum y a los correos de negocio ya existentes (costos,
autorizaciones, facturación) según D6.

### 2.8 Auditoría (§12)

Acciones nuevas en `audit-actions.ts`:

```
WARRANTY_CLAIM_CREATED   = 'warranty_claim.created'   // entidad: warranty_claim
WARRANTY_CLAIM_RESOLVED  = 'warranty_claim.resolved'
ORDER_URGENCY_SET        = 'order.urgency_set'        // metadata: { urgent }
```

`property.updated` y `tenant.updated` **ya existen** (Etapa 2): la
corrección de datos maestros con auditoría de §18.4 se verifica con tests
(AC-6.25/6.26), sin código nuevo salvo que un camino falte.

---

## 3. Convenciones de la API

Referenciar `docs/especificacion/etapa-1.md` §3 (cookie de sesión, RFC 7807,
paginación) y §5 (tenant guard por `company_id` de la ruta). Rutas anidadas
bajo `/api/v1/companies/:id/...` como en las etapas anteriores; la
empresa de la ruta debe coincidir con la sesión (404 si es ajena).

---

## 4. Endpoints

### 4.1 Garantías (§13)

| Método | Ruta | Permite | Éxito | Fracaso |
|---|---|---|---|---|
| POST | `/companies/:id/orders/:orderId/warranty-claims` | member+ de la originadora | 201 | 401, 404 (orden ajena o inexistente), 422 (trabajo no `done` o body inválido) |
| GET | `/companies/:id/orders/:orderId/warranty-claims` | miembro de la originadora | 200 lista | 401, 404 |
| GET | `/companies/:id/warranty-claims/:claimId` | miembro de la originadora | 200 detalle (incluye vínculos a orden/trabajo/costos/archivos) | 401, 404 (ajeno) |
| POST | `/companies/:id/warranty-claims/:claimId/resolve` | member+ de la originadora | 200 (body: `resolution`) | 401, 404, 409 (ya resuelto), 422 |

### 4.2 Urgencias (§14.2, §18.4)

| Método | Ruta | Permite | Éxito | Fracaso |
|---|---|---|---|---|
| PATCH | `/companies/:id/orders/:orderId` (campo `urgent`) | member+ de la empresa de la orden | 200 | 401, 404 (orden ajena), 409 (orden `completed`/`cancelled`) |
| GET | `/companies/:id/urgency-settings` | miembro de la propia empresa | 200 `{ responseHours }` | 401, 404 |
| PATCH | `/companies/:id/urgency-settings` | **owner** de la propia empresa | 200 | 401, 403 (member), 422 (fuera de 1–720) |

### 4.3 Preferencias de notificación (§18.4)

| Método | Ruta | Permite | Éxito | Fracaso |
|---|---|---|---|---|
| GET | `/me/notification-preferences` | usuario en sesión | 200: todos los tipos con `emailEnabled` (default `true`) | 401 |
| PUT | `/me/notification-preferences` | usuario en sesión | 200 con lo aplicado | 401, 422 (tipo desconocido o `emailEnabled` no booleano) |

Ruta de **usuario** (no anida empresa): las preferencias son personales.

### 4.4 Suscripciones (§15, §18.3)

| Método | Ruta | Permite | Éxito | Fracaso |
|---|---|---|---|---|
| GET | `/plans` | cualquier usuario en sesión | 200: 3 planes (id, name, category, price, currency) | 401 |
| GET | `/companies/:id/subscription` | miembro de la propia empresa | 200: plan efectivo de la empresa (`company.plan_id` o el de su categoría, D3) | 401, 404 (empresa ajena) |

---

## 5. Reglas de permisos (resumen normativo)

Referenciadas por § a `proyect.md`; verificación en el servidor por operación
(§16.1) y tenant guard (§16.2):

1. Los reclamos de garantía los inicia y gestiona **solo la entidad
   originadora de la orden original, dentro de su propio espacio** (§13);
   para el resto de empresas la existencia misma del reclamo es invisible
   (404, convención §16.8).
2. Un reclamo no implica cobertura aprobada ni autoriza un trabajo nuevo
   (§13): crear o resolver un reclamo **no** crea órdenes ni autorizaciones.
3. El marcado de urgencia lo hace la empresa de la orden mientras esté
   activa; una orden urgente **no** autoriza gastos ni trabajos (§14.2).
4. Configurar la ventana de respuesta es acción de **owner** de la propia
   empresa (mismos umbrales que §8.4/§8.6: settings de empresa en owner).
5. Las preferencias de notificación son **del usuario en sesión**: nadie
   edita preferencias ajenas (no existen como recurso de otra empresa).
6. Los planes son de **solo lectura** en la app; nadie los edita (D4).
7. La cobranza de suscripciones está **fuera del sistema**: no hay ningún
   endpoint que bloquee empresas por falta de pago (§18.3).
8. Las correcciones de datos maestros dejan audit con actor y entidad
   (§12, §18.4); los historiales nunca se editan (§18.4).

---

## 6. Matriz de permisos como tests de integración (§16.1)

Convención: 401 sin sesión · 403 rol insuficiente **en la propia empresa** ·
**404 recurso de otra empresa** (no filtrar existencia ajena).

### 6.1 Garantías (§13)

| # | Escenario | Esperado |
|---|---|---|
| 1 | POST claim sin sesión | 401 |
| 2 | member de la originadora crea claim sobre trabajo `done` de su orden | 201 `open` |
| 3 | owner de la originadora crea claim sobre trabajo no `done` | 422 |
| 4 | member de la **destinataria** (dueña del trabajo) intenta crear claim en la orden | 404 |
| 5 | member de una tercera empresa intenta leer el claim | 404 |
| 6 | GET lista del claim: solo la originadora ve el reclamo | 200 con 1 / 404 ajeno |
| 7 | owner de la originadora resuelve con `resolution` | 200 `resolved` con `resolved_at` |
| 8 | resolver un claim ya resuelto | 409 |
| 9 | resolver con `resolution` vacía | 422 |
| 10 | claim sobre orden inexistente | 404 |
| 11 | crear un claim **no** genera orden ni autorización nuevas (§13) | conteo de órdenes/autorizaciones sin cambios |

### 6.2 Urgencias (§14.2, §18.4)

| # | Escenario | Esperado |
|---|---|---|
| 12 | member de la empresa de la orden marca `urgent: true` (orden activa) | 200, `urgent=true` |
| 13 | marcar urgente una orden `completed` o `cancelled` | 409 |
| 14 | miembro de **otra** empresa marca urgente | 404 |
| 15 | sin sesión marca urgente | 401 |
| 16 | owner configura `responseHours: 12` | 200 |
| 17 | member configura `responseHours` | 403 |
| 18 | `responseHours: 0` o `10000` | 422 |
| 19 | barrido con asignación pendiente de orden urgente a mitad de ventana | 1 recordatorio in-app **y** correo al miembro asignado; segunda corrida del barrido **no** duplica (marca `urgency_reminded_at`) |
| 20 | barrido con ventana vencida sin respuesta | 1 escalación in-app **y** correo a los owners de la empresa del asignado; segunda corrida no duplica |
| 21 | orden **no** urgente con asignación pendiente vieja | ningún aviso |
| 22 | asignación ya respondida (accept/reject) tras el recordatorio | sin escalación posterior |
| 23 | recordatorio/escalación con correo desactivado en preferencias | in-app creado, correo **no** enviado |
| 24 | escalar no autoriza trabajo: un costo/envío posterior sigue exigiendo la autorización que corresponda (§14.2) | regla de la Etapa 4 intacta |

### 6.3 Preferencias, planes y auditoría (§18.4, §15, §12)

| # | Escenario | Esperado |
|---|---|---|
| 25 | GET `/me/notification-preferences` sin sesión / con sesión | 401 / 200 con todos los tipos en `true` |
| 26 | PUT desactiva correo de `urgent_reminder`; evento que lo origina | in-app sí, correo no |
| 27 | PUT con tipo inexistente | 422 |
| 28 | un usuario no puede leer ni escribir preferencias de otro (la ruta solo actúa sobre el usuario en sesión) | siempre su propio conjunto |
| 29 | GET `/plans` autenticado | 200 con 3 planes y precios 33/66/99 |
| 30 | GET `/companies/:id/subscription` de otra empresa | 404 |
| 31 | empresa sin `plan_id` explícito (o `own_business`) | plan efectivo = el de su categoría (D3) |
| 32 | PATCH propiedad (dato maestro) con sesión válida | 200 **y** fila `property.updated` en audit con el actor (§18.4) |
| 33 | PATCH inquilino con sesión válida | 200 **y** fila `tenant.updated` con el actor |
| 34 | correo de reset de contraseña con el tipo desactivado en preferencias | **se envía igual** (D6: mecanismo de cuenta, no aviso) |

---

## 7. Eventos de audit log de la Etapa 6

| Acción | Cuándo | Entidad |
|---|---|---|
| `warranty_claim.created` | crear reclamo (§13, §12) | `warranty_claim` |
| `warranty_claim.resolved` | resolver reclamo | `warranty_claim` |
| `order.urgency_set` | cambiar `urgent` (metadata `{ urgent }`) | `order` |
| `property.updated` / `tenant.updated` | corrección de datos maestros (ya existentes; se **verifican** con tests, §18.4) | `property` / `tenant` |

No se auditan: preferencias de usuario (dato personal, como §12 ya trata
los datos de cuenta), barridos automáticos (quedan como notificaciones
in-app persistentes) ni lecturas de planes.

---

## 8. Pruebas

- **Unitarias (Jest):**
  - cálculo de ventana (recordatorio a `created_at + hours/2`, escalación a
    `created_at + hours`, bordes exactos en UTC);
  - plan efectivo por categoría (D3) y coalescencia con `plan_id`;
  - gating de correo por preferencias (fila presente/ausente, default);
  - validaciones de `responseHours` (1–720) y del DTO de preferencias.
- **Integración (Testcontainers + PostgreSQL real):**
  - matriz de §6 como e2e (`test/etapa6.e2e-spec.ts`);
  - el barrido se invoca **directamente** como servicio (sin timers reales)
    para probar recordatorio/escalación e idempotencia;
  - captura de correos en consola (patrón de las etapas 2–5) para verificar
    envío / omisión por preferencias;
  - snapshot OpenAPI regenerado (`npm run openapi:update`).

---

## 9. Definición de hecho (Etapa 6)

Criterios de salida, tomados de `docs/plan.md` Etapa 6 (definidos aquí
porque el plan los dejó «a definir al llegar» y las decisiones que los
bloqueaban —§18.3/§18.4— quedaron resueltas el 18/10/2026):

1. `npm run check` en verde (lint + build + unit + e2e con PostgreSQL real).
2. Matriz de §6 completa en verde (`test/etapa6.e2e-spec.ts`).
3. `backend/openapi/openapi.json` regenerado y commiteado.
4. Semilla de desarrollo actualizada: 3 planes con precios de ejemplo y
   datos de demostración de la etapa (idempotente, UUIDs fijos).
5. `README.md` y `docs/plan.md` actualizados con el estado de la etapa;
   `docs/stack.md` con la justificación de `@nestjs/schedule` (D7).
6. Sin rojos en la CI de GitHub Actions (corrida en verde tras el push).

---

## 10. Criterios de aceptación (Given/When/Then)

### 10.1 Garantías (§13)

- **AC-6.1** Given una orden propia con trabajo Completado, When un member
  de la originadora crea un reclamo, Then responde 201 y el reclamo queda
  `open`, ligado a orden, trabajo, profesional, costos y archivos originales
  (§13).
- **AC-6.2** Given un trabajo no Completado, When se crea un reclamo, Then
  responde 422 (no hay reparación que garantizar, §20.2).
- **AC-6.3** Given un reclamo de la originadora, When un miembro de otra
  empresa lo lee o lista, Then recibe 404 (§13, §16.8).
- **AC-6.4** Given un reclamo `open`, When la originadora lo resuelve con
  motivo, Then queda `resolved` con `resolved_at` y actor, y un segundo
  intento responde 409.
- **AC-6.5** Given la creación o resolución de un reclamo, When se consulta
  el audit log, Then figuran `warranty_claim.created` / `.resolved` con
  actor y entidad (§12).
- **AC-6.6** Given un reclamo creado, When se cuentan órdenes y
  autorizaciones, Then no aparecen registros nuevos (§13: no autoriza).

### 10.2 Urgencias (§14.2, §18.4)

- **AC-6.7** Given una orden activa propia, When un member la marca
  urgente, Then responde 200 con `urgent=true` y audit
  `order.urgency_set`.
- **AC-6.8** Given una orden `completed` o `cancelled`, When se marca
  urgente, Then responde 409 (§20.1).
- **AC-6.9** Given la ventana de la empresa (default 24 h), When el
  barrido encuentra una asignación pendiente de orden urgente con
  `created_at + ventana/2 ≤ ahora`, Then el miembro asignado recibe
  in-app y correo **una sola vez** (§18.4).
- **AC-6.10** Given esa misma asignación sin respuesta, When llega
  `created_at + ventana`, Then los owners de la empresa del asignado
  reciben escalación in-app y correo, una sola vez (§18.4, D2).
- **AC-6.11** Given una asignación de orden no urgente o ya respondida,
  When corre el barrido, Then no se generan avisos.
- **AC-6.12** Given una ventana vencida sin respuesta, When el destinatario
  intenta un gasto que requiere autorización, Then sigue exigiéndose
  (§14.2: la falta de respuesta no autoriza).
- **AC-6.13** Given que el asignado desactivó el correo del tipo, When
  ocurre recordatorio o escalación, Then solo se crea el in-app (§18.4).
- **AC-6.14** Given `responseHours` fuera de 1–720 o configuración por un
  member, When se intenta, Then 422 / 403 respectivamente (settings de
  empresa en owner).

### 10.3 Preferencias y correo (§14.1, §18.4)

- **AC-6.15** Given un usuario nuevo, When consulta sus preferencias, Then
  todos los tipos aparecen con correo encendido (default §18.4).
- **AC-6.16** Given un tipo con correo desactivado, When se produce un
  aviso de ese tipo, Then existe notificación in-app y no hay correo.
- **AC-6.17** Given los tipos de órdenes/asignaciones de §14.1, When se
  producen, Then **además** del in-app se envía correo (cobertura que
  faltaba).
- **AC-6.18** Given un tipo desconocido en el PUT, Then responde 422.
- **AC-6.19** Given correos de autenticación (reset, acceso limitado) e
  invitaciones, When se disparan con cualquier preferencia, Then se envían
  (D6).
- **AC-6.20** Given un correo enviado, When se inspecciona, Then identifica
  la orden relacionada y no comparte información que el destinatario no
  pueda ver (§14.1).

### 10.4 Suscripciones (§15, §18.3)

- **AC-6.21** Given la semilla ejecutada, When se leen los planes, Then
  hay exactamente tres (profesional 33.00, contratista 66.00,
  administradora 99.00, USD) y repetir la semilla no duplica.
- **AC-6.22** Given una empresa `own_business` sin `plan_id`, When se lee
  su suscripción, Then muestra el plan de categoría `profesional` (D3).
- **AC-6.23** Given cualquier empresa, When se lee su suscripción, Then no
  hay efectos de bloqueo por pago (§18.3: cobranza fuera del sistema).
- **AC-6.24** Given un usuario autenticado, When lista `/plans`, Then
  responde 200 de solo lectura; no existe endpoint de edición (D4).

### 10.5 Corrección de registros (§18.4)

- **AC-6.25** Given una propiedad con dato erróneo, When un member la
  corrige, Then 200, el valor nuevo persiste y el audit registra
  `property.updated` con el actor (§18.4).
- **AC-6.26** Idem para inquilino con `tenant.updated`.
- **AC-6.27** Given un registro histórico (factura, asignación, evento de
  trabajo), When se intenta corregirlo in-place, Then no existe endpoint
  que lo permita: la corrección ocurre solo vía registros correctivos ya
  construidos (anulación, devolución, nueva asignación) (§18.4).

---

## 11. Casos excepcionales (comportamiento esperado)

1. **Resolución concurrente de un reclamo:** dos resoluciones simultáneas →
   un 200 y un 409 (transacción con `WHERE status='open'`).
2. **Idempotencia del barrido:** recordatorio/escalación insertados dos
   veces en la misma ventana → una sola fila de notificación y un solo
   correo, protegidos por `urgency_reminded_at` / `urgency_escalated_at`.
3. **Cambio de ventana en caliente:** una asignación pendiente usa el
   `responseHours` **vigente** en cada evaluación del barrido (no se
   congela al crear la asignación); el comportamiento queda documentado.
4. **Reloj y husos:** todo el cálculo en UTC (convención §2); el barrido
   corre aunque no haya actividad de usuarios.
5. **Falla del proveedor de correo:** el envío se reintenta/loguea sin
   tumbar la operación de negocio; el in-app persiste igual (patrón de las
   etapas 2–5).
6. **Orden urgente sin asignación:** no hay quién responder → sin
   recordatorios; el reloj empieza con la propuesta de asignación (D1).
7. **Reclamo sobre trabajo de otra empresa:** la orden ajena ya responde
   404 antes de validar el trabajo (no se filtra existencia).
8. **Preferencias y tipos futuros:** un tipo nuevo de enum sin fila de
   preferencia hereda correo encendido (default); el PUT solo acepta tipos
   del enum (422 si no).
9. **Semilla idempotente:** planes con UUIDs fijos + `skipDuplicates`;
   precios de ejemplo no se regeneran ni sobrescriben ajustes hechos por
   despliegue (el `update` de la semilla no toca `price`).
10. **Datos sensibles:** los avisos (in-app y correo) llevan solo título,
    identificador y enlace de la orden/reclamo; jamás costos de terceros,
    datos de inquilinos ajenos ni credenciales (§14.1, §16).
11. **Dinero:** precios de plan siempre `Decimal(12,2)`, nunca `Float`.
12. **Ventana vencida + cancelación de la orden:** al cancelar o cerrar la
    orden, el barrido ignora sus asignaciones pendientes (sin escalación
    post-muerte).
