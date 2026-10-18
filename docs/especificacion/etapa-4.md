# Especificación técnica — Etapa 4: Costos y autorizaciones

> **Estado: APROBADA el 18/10/2026 (9/9 decisiones resueltas por el dueño).**
> Referencias por § a `proyect.md` (v1.0, fuente de verdad de negocio); las
> reglas de negocio se referencian, no se copian.

Base normativa: `proyect.md` §5.3, §8 (8.1–8.8), §9, §12, §14.1, §16, §17
(Etapa 4), §18.1, §20. Alcance y criterio de salida: `docs/plan.md` (Etapa 4).

---

## 1. Alcance

### 1.1 Entra / queda fuera

**Entra (§17 Etapa 4, `docs/plan.md`):**

- Registro de costos por asignación: materiales, mano de obra y otros
  conceptos, con revisión previa y confirmación explícita de envío (§8.1).
- Correcciones de costos que conservan importe original, corrección, fechas e
  historial; notificación al destinatario original (§8.2).
- Separación de costos por relación comercial: cada parte ve solo lo suyo
  (§8.3, §16.9).
- Límites de gasto: política general por empresa, aplicación por orden al
  crearla, límite por orden editable, «sin límite» cuando no se configura
  (§8.4).
- Margen comercial opcional de hasta 20 %, activado expresamente, registrado y
  **sin** aumento automático del límite de gasto (§8.5).
- Autorizaciones: solicitudes (trabajo adicional y exceder el límite) que solo
  la entidad originadora aprueba (§8.4, §9); constancias de autorizaciones
  recibidas fuera de la plataforma —teléfono u otro medio— (§8.7, §18.1).
- Política de emergencia: general por empresa, con sobrescritura por la
  relación comercial vinculada a la orden (§8.6, entidad `commercial_relations`
  §2.4).
- Libro de trazabilidad económica de la orden: límite inicial, autorizaciones,
  costos enviados y excesos reales (§8.7, §12).
- Correos electrónicos de envío de costos, correcciones y solicitudes de
  autorización (§14.1).

**Queda fuera (documentado, no se implementa en esta etapa):**

- Bloqueo físico del trabajo o del registro de costos por exceder el límite:
  §8.5 exige **conservar** el gasto real; el sistema marca y exige
  autorización para el exceso, no impide registrarlo. El juicio de «consecuente
  con lo pedido» (§5.3) sigue siendo humano; lo ejecutable es el flujo de
  autorización (quién aprueba, constancia, historial).
- Facturas y pagos (Etapa 5). Una corrección de costos **no** modifica facturas
  ya emitidas (§8.2); ese enlace se diseña en la Etapa 5.
- Cadenas comerciales multinivel dentro de una misma orden (M→C→P en un único
  pedido): el modelo actual representa la relación como empresa dueña de la
  orden ↔ empresa asignada del trabajo; los costos van por asignación, de modo
  que el modelo ya lo soportará cuando existan órdenes encadenadas.
- Plazos, recordatorios y mecanismos de escalación de contacto (§14.2, §18.4):
  fuera de alcance; la falta de respuesta nunca autoriza (se respeta).
- Multi-moneda: en v1 la moneda es USD fija (decisión 2, §1.2); el campo moneda
  se agrega cuando exista la necesidad real.

### 1.2 Decisiones resueltas (18/10/2026, respuestas del dueño)

| # | Decisión |
|---|---|
| 1 | **§18.1 — registro de autorizaciones offline:** registro en un paso por un miembro de la empresa originadora: quién autorizó (nombre/rol), cuándo, qué autorizó, tope opcional y quién lo registró; constancia auditable, sin segunda confirmación y sin modificar costos ni estados por sí sola. |
| 2 | **Moneda:** USD fija en v1 (jurisdicción EE.UU., §18.2); el campo moneda se agrega cuando haya multi-moneda real. |
| 3 | **Modelo de costos:** por asignación (relación comercial) con flujo borrador → envío → corrección versionada; versiones enviadas inmutables. |
| 4 | **Emergencias:** se crea la **entidad `commercial_relations`** (§2.4): la relación comercial puede sobreescribir la política general de la empresa (§8.6). La orden se vincula a una relación de su empresa; la política vigente es la de la relación si define una, si no la general de la empresa. Sin override por orden. |
| 5 | **Trabajo adicional aprobado:** la aprobación crea automáticamente el job en la misma orden (pendiente, sin asignar), enlazado a la constancia. |
| 6 | **Margen:** registrado en la orden, activado por un miembro de la empresa originadora; visible solo para esa empresa. |
| 7 | **Configuración económica de empresa:** solo rol `owner`. Por extensión (mismo criterio), crear/modificar relaciones comerciales —que definen overrides de política— también exige `owner`. |
| 8 | **Envío tras perder la asignación:** solo si la asignación llegó a `accepted` en algún momento (§20.2 conserva «cualquier costo incurrido»); `pending`/`rejected` nunca envían. |
| 9 | **Visibilidad:** la asignada ve límite efectivo, techo autorizado y su propio total; el margen es privado de la empresa originadora. |

Detalle de diseño de la decisión 4: las filas de relación las crea la empresa
cuyas órdenes gobiernan (`company_id`), registrando a la contraparte
(`counterparty_company_id` o `client_relationship_id`); no requieren
confirmación de la contraparte en v1 (reflejan un acuerdo comercial offline,
quedan audadas). `ended_at` impide adjuntar la relación a órdenes nuevas; las
órdenes existentes conservan su referencia (§1.1.8).

---

## 2. Modelo de datos

Convenciones generales (`proyect.md` §1.1, `docs/especificacion/etapa-1.md` §2):
UUID, timestamps `timestamptz` en UTC, `company_id` en toda tabla de ámbito
tenant, **dinero en `Decimal(12,2)`, nunca `Float`**, sin borrados destructivos
(§1.1.8): lo histórico se conserva y se audita.

### 2.1 Enums nuevos

```prisma
enum EmergencyPolicy {
  prior_authorization      // Solicitar autorización antes de intervenir (§8.6)
  resolve_without_authorization // Resolver sin autorización previa (§8.6)
  emergency_amount         // Importe adicional previamente autorizado (§8.6)
}

enum CostCategory {
  material
  labor
  other
}

enum CostReportStatus {
  draft      // Editable; invisible para el destinatario (§8.1)
  submitted  // Enviado: inmutable (§8.1, §8.2)
}

enum AuthorizationRequestType {
  exceed_spending_limit  // Autorización para superar el límite (§8.4)
  additional_work        // Trabajo adicional propuesto (§9)
}

enum AuthorizationRequestStatus {
  pending
  approved
  rejected
}

enum AuthorizationSource {
  platform_request  // Nace de una solicitud aprobada
  offline           // Autorización recibida fuera: teléfono u otro medio (§8.7)
}
```

### 2.2 `companies` — política económica general (§8.4, §8.6)

| Columna | Tipo | Notas |
|---|---|---|
| `default_spending_limit` | `Decimal(12,2)?` | Límite general; `null` = sin límite económico (§8.4). Se aplica por defecto al crear órdenes. |
| `emergency_policy` | `EmergencyPolicy` | Default `prior_authorization` (§8.6). |
| `emergency_extra_amount` | `Decimal(12,2)?` | Importe adicional pre-autorizado cuando la política es `emergency_amount`. |

### 2.3 `orders` — política económica de la orden (§8.4, §8.5, §8.6)

| Columna | Tipo | Notas |
|---|---|---|
| `spending_limit` | `Decimal(12,2)?` | Límite de la orden; `null` = sin límite. Al crearse: el valor enviado o, si no, el default de la empresa (aplicado por defecto, §8.4). |
| `spending_limit_set_by` | `Uuid?` | Quién fijó/actualizó el límite. |
| `spending_limit_set_at` | `timestamptz?` | Cuándo. |
| `margin_enabled` | `Boolean` default `false` | Margen activado expresamente (§8.5). |
| `margin_percent` | `Decimal(5,2)?` | 0–20; `null` si nunca se configuró. |
| `margin_set_by` / `margin_set_at` | `Uuid?` / `timestamptz?` | Trazabilidad del margen. |
| `commercial_relation_id` | `Uuid?` | Relación comercial vinculada (§2.4); la elige la originadora al crear o editar la orden y debe ser de la que la empresa sea parte. |

La política de emergencia **vigente** de una orden (§8.6) es la de su relación
comercial si está vinculada y define una; si no, la general de su empresa.

### 2.4 `commercial_relations` — relación comercial (§8.6, decisión 4)

Entidad que representa una relación comercial real (empresa↔empresa o
profesional↔cliente propio) y puede sobrescribir la política general de
emergencia de la empresa. La crea la empresa cuyas órdenes gobiernan (rol
`owner`, decisión 7); la contraparte no confirma en v1.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `Uuid` | PK. |
| `company_id` | `Uuid` | Empresa que gobierna la relación (la que adjuntará sus órdenes). |
| `counterparty_company_id` | `Uuid?` | Contraparte empresa (exclusivo con `client_relationship_id`). |
| `client_relationship_id` | `Uuid?` | Cliente propio del profesional (caso §8.6 «cliente propio»; exclusivo con `counterparty_company_id`). |
| `label` | `String?` | Nombre comercial libre (p. ej. «Contratista Norte»). |
| `emergency_policy` | `EmergencyPolicy?` | Override; `null` = no sobrescribe (manda la empresa). |
| `emergency_extra_amount` | `Decimal(12,2)?` | Importe del override cuando aplica `emergency_amount`. |
| `ended_at` | `timestamptz?` | Relación finalizada: no admite órdenes nuevas (las existentes conservan la referencia, §1.1.8). |
| `created_by` | `Uuid` | |
| `created_at` / `updated_at` | | |

Constraints: exactamente uno de `counterparty_company_id` /
`client_relationship_id` no nulo (check en servicio, 422);
`@@unique([company_id, counterparty_company_id])` cuando hay contraparte
empresa; `@@index([company_id])`.

### 2.5 `cost_reports` — versiones del reporte de costos (§8.1, §8.2)

Una asignación tiene a lo sumo un reporte en `draft` y cero o más versiones
`submitted` (inmutables). Las correcciones crean la siguiente versión.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `Uuid` | PK. |
| `assignment_id` | `Uuid` | La asignación = la relación comercial que emite (§8.3). |
| `company_id` | `Uuid` | Empresa emisora (la de la membresía asignada). |
| `version` | `Int` | 1, 2, … consecutivos por asignación. |
| `status` | `CostReportStatus` | `draft` por defecto. |
| `notes` | `String?` | Notas del emisor. |
| `total` | `Decimal(12,2)?` | `null` en borrador; calculado al enviar (suma de sus ítems). |
| `submitted_by` / `submitted_at` | `Uuid?` / `timestamptz?` | Quién confirmó el envío y cuándo (§8.1: acción explícita). |
| `previous_report_id` | `Uuid?` | Versión anterior al corregir (§8.2). |
| `created_at` / `updated_at` | | |

Constraints: `@@unique([assignment_id, version])`; índice
`[assignment_id, status]`. Un `INSERT` de versión N solo se permite si no
existe otra versión ≥ N (check en servicio con transacción).

### 2.6 `cost_items` — renglones (§8.1)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `Uuid` | PK. |
| `cost_report_id` | `Uuid` | |
| `category` | `CostCategory` | material / labor / other. |
| `description` | `String` | Requerida. |
| `amount` | `Decimal(12,2)` | ≥ 0; máx. 2 decimales. |
| `is_emergency` | `Boolean` default `false` | Marca emergency (§8.6): el ítem se registra dentro de una intervención de emergencia. |
| `created_at` / `updated_at` | | |

Los ítems solo se agregan/modifican/borran mientras el reporte está en
`draft`; el servidor lo verifica (§16.1).

### 2.7 `order_authorizations` — constancias (§8.4, §8.7, §18.1)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `Uuid` | PK. |
| `order_id` | `Uuid` | |
| `type` | `AuthorizationRequestType` | `exceed_spending_limit` o `additional_work`. |
| `source` | `AuthorizationSource` | `platform_request` o `offline`. |
| `granted_by_user_id` | `Uuid?` | Aprobador en plataforma; `null` si fue fuera (teléfono). |
| `granted_by_description` | `String?` | Nombre/rol de quien autorizó (obligatorio en `offline`, §18.1). |
| `granted_at` | `timestamptz` | Cuándo autorizó (en `offline`: lo declara el registrador; no futuro). |
| `authorized_by_user_id` | `Uuid` | Quién registró la constancia (en `offline`: el miembro que la anota; §18.1 «quién registró la constancia»). |
| `amount_cap` | `Decimal(12,2)?` | Para `exceed_spending_limit`: importe **adicional** autorizado sobre el límite vigente. |
| `description` | `String` | Qué autorizó (obligatoria). |
| `authorization_request_id` | `Uuid?` | Enlace a la solicitud que la originó (`platform_request`). |
| `job_id` | `Uuid?` | Job creado por aprobar `additional_work` (decisión 5). |
| `created_at` | | |

No se admiten UPDATE ni DELETE de filas (patrón `job_events`/`audit_log`):
una constancia solo se emite; el historial no se reescribe (§1.1.8, §12).

### 2.8 `authorization_requests` — solicitudes (§8.4, §9, §14.1)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `Uuid` | PK. |
| `order_id` | `Uuid` | |
| `requesting_company_id` | `Uuid` | Empresa del solicitante (asignada). |
| `requested_by_user_id` | `Uuid` | |
| `type` | `AuthorizationRequestType` | |
| `description` | `String` | Qué se propone/por qué (obligatoria). |
| `requested_amount` | `Decimal(12,2)?` | Importe propuesto (tope para exceder; referencia para adicional). |
| `status` | `AuthorizationRequestStatus` | `pending` por defecto. |
| `resolved_by_user_id` | `Uuid?` | Aprobador/rechazador (originador). |
| `resolved_at` | `timestamptz?` | |
| `resolution_note` | `String?` | Nota de rechazo (obligatoria al rechazar, §9 «se espera»; registro del porqué). |
| `authorization_id` | `Uuid?` | Constancia creada al aprobar. |
| `created_at` / `updated_at` | | |

### 2.9 Directorio de módulos (convención de `docs/stack.md` §4)

```
backend/src/modules/costs/               # cost_reports + cost_items (§8.1–§8.3)
backend/src/modules/authorizations/      # requests + constancias + libro (§8.4, §8.7, §9)
backend/src/modules/economic-settings/   # política de empresa, orden y relaciones (§8.4–§8.6)
```

Las reglas puras van en `*-rules.ts` dentro de cada módulo (patrón de la
Etapa 3): `spending-rules.ts` (techo efectivo, excesos, margen ≤ 20, política
de emergencia vigente relación ?? empresa), `cost-rules.ts` (validación de
ítems, transiciones de reporte), `authorization-rules.ts` (máquinas de
solicitud y permiso de resolución) y `relation-rules.ts` (contrapartes
exclusivas y vigencia de la relación).

### 2.10 Índices globales

- `commercial_relations`: `@@index([company_id])`, `@@unique([company_id, counterparty_company_id])`.
- `cost_reports`: `@@unique([assignment_id, version])`,
  `@@index([assignment_id, status])`, `@@index([company_id])`.
- `cost_items`: `@@index([cost_report_id])`.
- `order_authorizations`: `@@index([order_id])`,
  `@@index([authorization_request_id])`.
- `authorization_requests`: `@@index([order_id, status])`,
  `@@index([requesting_company_id])`.

---

## 3. Convenciones de la API

Se referencian `docs/especificacion/etapa-1.md` §3 y
`docs/especificacion/etapa-3.md` §3 (RFC 7807 `problem+json`, prefijo
`/api/v1`, tenant guard `CompanyAccessGuard`, sesión global, paginación por
cursor donde aplica). Lo nuevo de esta etapa:

- **Dinero:** los importes se serializan como **string decimal** de hasta 2
  decimales (`"250"`, `"1234.56"`); se validan con `IsDecimal` y rango
  `[0, 9999999999.99]`. Nunca `Float` en modelo, API ni cálculos (§12,
  criterio de la Etapa 5).
- **Porcentajes:** `margin_percent` decimal 0–20 con máx. 2 decimales.
- **Estados financieros son append-only:** constancias (`order_authorizations`)
  y versiones `submitted` de reportes no se editan ni se borran; se corrigen
  emitiendo la versión siguiente (§8.2, §1.1.8).
- Los campos sensibles (`access_lockbox`, motivos privados) no aparecen en
  payloads de esta etapa.

---

## 4. Endpoints

### 4.1 Política económica general de la empresa (§8.4, §8.6)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| GET | `/companies/:id/economic-settings` | Lee la política general | miembro activo | 200 |
| PATCH | `/companies/:id/economic-settings` | Actualiza `default_spending_limit`, `emergency_policy`, `emergency_extra_amount` | **rol `owner`** de esa empresa (decisión 7) | 200 / 403 / 422 |

### 4.2 Política económica de la orden (§8.4, §8.5, §8.6)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| GET | `/companies/:id/orders/:orderId/economic-policy` | Límite, margen y política de emergencia vigente (ver §4.6 para el resumen completo) | dueña o asignada (cada una ve lo que le corresponde, §4.6) | 200 / 404 |
| PATCH | `/companies/:id/orders/:orderId/economic-policy` | Fija `spending_limit` (o lo limpia con `null`), margen (`margin_enabled`, `margin_percent`) y `commercialRelationId` (vincula o desvincula con `null`); registra actor y fecha | miembro activo de la **empresa dueña** (originadora) | 200 / 403 / 404 / 422 |

`POST /companies/:id/orders` (Etapa 2) acepta además, en la creación:
`spendingLimit?` (o `null` explícito para «sin límite»), `applyCompanyDefault`
(default `true`; si la empresa tiene default y no se envía límite, se aplica),
`marginEnabled?`, `marginPercent?`, `commercialRelationId?` (la relación debe
ser de la que la empresa creadora sea parte y no estar finalizada; §4.7). La
creación sigue exigiendo `propertyId` y los campos ya existentes; nada de esta
etapa cambia los permisos de Etapa 2.

### 4.3 Costos por asignación (§8.1–§8.3)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| GET | `/companies/:id/assignments/:assignId/cost-report` | Reporte vigente + ítems + historial de versiones enviadas | emisor (empresa de la membresía asignada) o empresa dueña de la orden | 200 / 403 / 404 |
| PUT | `/companies/:id/assignments/:assignId/cost-report/items` | Reemplaza los ítems del **borrador** (lista completa, patrón put-list) | emisor; solo con reporte en `draft` | 200 / 403 / 404 / 409 |
| POST | `/companies/:id/assignments/:assignId/cost-report/submit` | Confirma el envío: congela el borrador, calcula total, notifica al destinatario (§8.1) | emisor; ver regla de §1.2 decisión 8 | 204 / 403 / 404 / 409 |
| POST | `/companies/:id/assignments/:assignId/cost-report/correct` | Crea una nueva versión borrador copiando la última enviada (§8.2) | emisor; requiere al menos una versión enviada | 201 / 403 / 404 / 409 |

### 4.4 Solicitudes de autorización (§8.4, §9, §14.1)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| GET | `/companies/:id/orders/:orderId/authorization-requests` | Lista solicitudes; la dueña ve todas, la asignada solo las suyas | miembro activo (dueña o asignada) | 200 / 404 |
| POST | `/companies/:id/orders/:orderId/authorization-requests` | Informa y propone: `type` (`exceed_spending_limit` o `additional_work`), `description`, `requestedAmount?` | miembro de una empresa con **asignación activa** en la orden (§9: «informar y proponer», jamás autorizar) | 201 / 403 / 404 / 422 |
| POST | `/companies/:id/authorization-requests/:requestId/approve` | Aprueba: crea la constancia; si es `additional_work`, crea el job en la misma orden (decisión 5) | miembro activo de la **empresa originadora** (§8.4) | 204 / 403 / 404 / 409 |
| POST | `/companies/:id/authorization-requests/:requestId/reject` | Rechaza con `resolutionNote` obligatorio | miembro activo de la empresa originadora | 204 / 403 / 404 / 409 |

### 4.5 Autorizaciones fuera de la plataforma y libro (§8.7, §18.1)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| GET | `/companies/:id/orders/:orderId/authorizations` | Constancias de la orden (plataforma y offline) | dueña; la asignada ve las que afectan su límite (sin notas internas) | 200 / 404 |
| POST | `/companies/:id/orders/:orderId/authorizations` | Registra una autorización recibida fuera (§18.1): `type`, `grantedByDescription`, `grantedAt`, `description`, `amountCap?` | miembro activo de la empresa originadora (solo ella autoriza, §8.4) | 201 / 403 / 404 / 422 |

### 4.6 Resumen económico de la orden (§8.4, §8.5, §8.7, §12)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| GET | `/companies/:id/orders/:orderId/economic-summary` | Límite efectivo, techo autorizado (límite + Σ autorizaciones `exceed_spending_limit`), total de costos enviados de la orden, `exceedsLimit`, política de emergencia vigente; la dueña además ve `margin` y todos los reportes; la asignada solo los suyos y su propio total (§8.3, §16.9; sin `margin`, §1.2 decisión 9) | dueña o asignada | 200 / 404 |

Cálculos (reglas puras en `spending-rules.ts`, §8):

- `effectiveLimit = order.spending_limit ?? company.default_spending_limit` (`null` = sin límite).
- `authorizedCeiling = effectiveLimit + Σ amount_cap` de constancias
  `exceed_spending_limit` (`null` si `effectiveLimit` es `null`).
- `submittedTotal = Σ total` de reportes `submitted` de todas las asignaciones de la orden.
- `exceedsLimit = authorizedCeiling ≠ null && submittedTotal > authorizedCeiling`.
- `emergencyCeiling`: importe pre-autorizado de la política vigente
  (relación vinculada si define una; si no, empresa; §8.6); los ítems
  `is_emergency` se comparan contra él para señalar excesos de emergencia.
- `effectiveEmergencyPolicy`: relación si define política; si no, la de la
  empresa (§8.6, decisión 4).

### 4.7 Relaciones comerciales (§8.6, decisión 4)

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| GET | `/companies/:id/commercial-relations` | Relaciones de la empresa con su override de emergencia y estado | miembro activo | 200 |
| POST | `/companies/:id/commercial-relations` | Crea una relación: `counterpartyCompanyId` o `clientRelationshipId` (exclusivos), `label?`, `emergencyPolicy?`, `emergencyExtraAmount?` | **rol `owner`** (decisión 7) | 201 / 403 / 404 / 409 / 422 |
| PATCH | `/companies/:id/commercial-relations/:relationId` | Actualiza override o finaliza (`endedAt` implícito al pasar `ended: true`); no admite cambiar las contrapartes | **rol `owner`** | 200 / 403 / 404 / 422 |

---

## 5. Reglas de permisos (resumen normativo)

Referencias a `proyect.md`; verificación en servidor por operación (§16.1) y
tenant guard en todas las rutas (§16.2), como en las Etapas 1–3.

1. **Solo la entidad originadora autoriza** (§8.4, §9, §1.1.7): aprobar/rechazar
   solicitudes y registrar constancias offline lo hace un miembro activo de la
   empresa dueña de la orden. El contratista/profesional informa y propone,
   nunca autoriza.
2. **Costos por relación comercial** (§8.3, §16.9): el reporte pertenece a la
   asignación; emisor y dueña lo ven completo; otra asignación de la misma
   orden es invisible (404 en rutas directas por asignación ajena).
3. **Límite visible, margen privado** (§8.4, §8.5): la asignada ve límite
   efectivo, techo autorizado y su total; el margen solo lo ve la originadora.
4. **Emergencias** (§8.6): la política vigente de la orden es la de su
   relación comercial si define una; si no, la general de la empresa. El
   sistema no bloquea la intervención, pero la registra y compara con el
   importe pre-autorizado.
5. **Conservación** (§1.1.8, §8.5, §12): registrar un exceso no significa que
   fuera autorizado; los reportes enviados, constancias e historiales nunca se
   borran ni se reescriben.
6. **Roles** (Etapa 1): la política general de empresa **y las relaciones
   comerciales** (que definen overrides de política) las gestiona solo `owner`
   (decisión 7); el resto de operaciones aceptan cualquier miembro activo con
   la relación correcta.

---

## 6. Matriz de permisos como tests de integración (§16.1)

Convención de códigos (igual que Etapas 1–3): 401 sin sesión; 403 con sesión
pero sin permiso en la propia empresa; **404 recurso de otra empresa o fuera de
alcance** (nunca filtrar existencia ajena, §16.8). Cada escenario es un test
e2e en `test/etapa4.e2e-spec.ts`.

### 6.1 Política de empresa y de orden (#1–#8)

| # | Escenario | Esperado |
|---|---|---|
| 1 | Sin sesión en cualquier endpoint nuevo | 401 |
| 2 | `owner` de A actualiza la política general de A | 200 |
| 3 | `member` de A (rol sin `owner`) actualiza la política de A | 403 |
| 4 | `owner` de B actualiza la política de A | 404 |
| 5 | Miembro dueño actualiza límite/margen de su orden | 200 + actor y fecha registrados |
| 6 | Miembro de la empresa asignada actualiza la política de la orden | 403 |
| 7 | Empresa sin relación toca la política de una orden ajena | 404 |
| 8 | `margin_percent` > 20 o importe negativo | 422 |

### 6.2 Costos (#9–#20)

| # | Escenario | Esperado |
|---|---|---|
| 9 | Profesional crea/modifica ítems en el borrador | 200, invisible para la dueña hasta enviar |
| 10 | Envío explícito (`submit`) | 204, estado `submitted`, total calculado, correo al destinatario, audit |
| 11 | Segundo `submit` o `PUT` de ítems sobre un reporte enviado | 409 |
| 12 | Corrección tras un envío | 201, versión nueva copiada, anterior conservada, correo de corrección, audit |
| 13 | `correct` sin ninguna versión enviada | 409 |
| 14 | Dueña de la orden lee el reporte de su asignado | 200 con ítems y versiones |
| 15 | Profesional A lee/modifica el reporte de la asignación de B (misma orden) | 404 |
| 16 | Miembro de empresa sin relación toca una asignación ajena | 404 |
| 17 | Asignación revocada tras haber aceptado: el emisor aún puede enviar | 204 (§20.2: costos incurridos se conservan) |
| 18 | Asignación `pending` o `rejected` intenta enviar | 403 |
| 19 | Ítem con importe negativo, > 2 decimales o sin descripción | 422 |
| 20 | Envío concurrente del mismo reporte (carrera) | un 204 y un 409 |

### 6.3 Solicitudes y autorizaciones (#21–#34)

| # | Escenario | Esperado |
|---|---|---|
| 21 | Asignado propone `exceed_spending_limit` con importe | 201 + audit `authorization.requested` |
| 22 | Asignado propone `additional_work` | 201; **no** crea job todavía |
| 23 | Aprobación por la originadora de exceder límite | 204 + constancia con `amount_cap`; techo autorizado crece |
| 24 | Aprobación de trabajo adicional | 204 + constancia + **job nuevo en la misma orden** (pendiente, sin asignar) enlazado |
| 25 | Rechazo con nota | 204 + audit; solicitud cerrada |
| 26 | Rechazo sin nota | 422 |
| 27 | Aprobación por la asignada (empresa no originadora) | 403 |
| 28 | Aprobar/rechazar solicitud ya resuelta | 409 |
| 29 | Empresa sin relación aprueba o propone | 404 |
| 30 | Constancia offline: registro correcto (quién autorizó, cuándo, qué, quién registró) | 201 + audit `order_authorization.recorded` |
| 31 | Constancia offline sin `grantedByDescription` o con `grantedAt` futuro | 422 |
| 32 | Constancia offline registrada por la asignada | 403 (solo originadora, §8.4) |
| 33 | Asignada lee `authorizations` | 200 sin notas internas de la originadora |
| 34 | Doble resolución concurrente de la misma solicitud | un 204 y un 409 |

### 6.4 Resumen, límites, margen y emergencias (#35–#46)

| # | Escenario | Esperado |
|---|---|---|
| 35 | Orden con default de empresa y sin relación vinculada | límite efectivo = default (§8.4) |
| 36 | Orden creada con `applyCompanyDefault: false` | «sin límite» (`null`) |
| 37 | Costos enviados superan límite + autorizaciones | `exceedsLimit: true`; el registro **no** se bloquea (§8.5) |
| 38 | Autorización `exceed_spending_limit` aprobada | techo sube; `exceedsLimit` vuelve a `false` si cubre |
| 39 | Asignada lee el resumen | 200 con límite y su total; **sin** `margin` ni costos ajenos |
| 40 | Dueña lee el resumen | 200 con margen y todos los reportes |
| 41 | Margen activado: el techo autorizado **no** cambia | `authorizedCeiling` idéntico (§8.5) |
| 42 | Desactivar el margen | flag en `false`, historial e importes conservados (audit) |
| 43 | Política de emergencia `resolve_without_authorization` | el flujo de autorización no se exige para registrar costos emergency |
| 44 | Política `emergency_amount` con importe y exceso emergency mayor | resumen señala el exceso de emergencia; se propone autorización (flujo #21) |
| 45 | Orden con relación vinculada que define política de emergencia | manda la de la relación, no la de la empresa (§8.6) |
| 46 | Empresa sin relación lee resumen/historial de costos ajeno | 404 |

### 6.5 Relaciones comerciales (#47–#52)

| # | Escenario | Esperado |
|---|---|---|
| 47 | `owner` crea relación con contraparte y override de emergencia | 201 + audit `commercial_relation.created` |
| 48 | `member` (sin `owner`) crea o modifica una relación | 403 (decisión 7) |
| 49 | `owner` de otra empresa parchea una relación ajena | 404 |
| 50 | Adjuntar a una orden una relación de la que la empresa no es parte, o una finalizada (`ended_at`) | 404 / 422 sin crear vínculo |
| 51 | Orden con relación que **no** define política | manda la general de la empresa (§8.6) |
| 52 | Finalizar una relación | `ended_at` seteado; sus órdenes existentes conservan la referencia y su política |

---

## 7. Eventos de audit log de la Etapa 4 (§12)

| Acción | Entidad | Payload mínimo (sin datos sensibles) |
|---|---|---|
| `company.economic_settings_changed` | company | `defaultSpendingLimit`, `emergencyPolicy`, `emergencyExtraAmount` |
| `order.spending_limit_changed` | order | `previousLimit`, `newLimit`, `setBy` |
| `order.margin_changed` | order | `marginEnabled`, `marginPercent` |
| `cost_report.submitted` | cost_report | `assignmentId`, `orderId`, `version`, `total`, `itemCount` |
| `cost_report.corrected` | cost_report | `assignmentId`, `previousVersion`, `newVersion` |
| `authorization.requested` | authorization_request | `orderId`, `type`, `requestedAmount`, `requestingCompanyId` |
| `authorization.approved` | authorization_request | `orderId`, `type`, `authorizationId`, `jobId?` |
| `authorization.rejected` | authorization_request | `orderId`, `type` (nunca la nota interna completa si es privada; se registra solo que hubo nota) |
| `order_authorization.recorded` | order_authorization | `orderId`, `type`, `amountCap`, `grantedAt` |
| `commercial_relation.created` | commercial_relation | `counterpartyCompanyId` o `clientRelationshipId`, `emergencyPolicy?`, `emergencyExtraAmount?` |
| `commercial_relation.changed` | commercial_relation | `emergencyPolicy`, `emergencyExtraAmount` (antes/después) |
| `commercial_relation.ended` | commercial_relation | `endedAt` |

Reglas: actores identificados (`actor_user_id`), timestamps del sistema,
payloads solo con ids e importes (§16.4, patrón Etapa 3: sin textos libres
como motivos ni descripciones). `order_authorizations` es **append-only a nivel
de BD** (grants `REVOKE UPDATE, DELETE`, patrón `job_events`, escenario #49 de
la Etapa 3).

---

## 8. Pruebas

- **Unitarias** (Jest, reglas puras): `spending-rules.spec.ts` (límite
  efectivo, techo autorizado, `exceedsLimit`, margen ≤ 20 y su inefectancia
  sobre el techo, política de emergencia vigente relación ?? empresa),
  `cost-rules.spec.ts` (validación de ítems,
  máquina borrador→enviado→corrección, doble submit),
  `authorization-rules.spec.ts` (máquina de solicitudes, quién resuelve),
  `relation-rules.spec.ts` (validación de contrapartes exclusivas, vigencia).
- **Integración** (Testcontainers + PostgreSQL real + `s3rver` no requerido):
  `test/etapa4.e2e-spec.ts` con la matriz de §6 completa, aserciones de audit
  por acción (§7), verificación de correos capturados (§14.1) y el escenario
  de grants append-only de `order_authorizations`.
- **Regresión:** el gate `npm run check` debe mantener verde las Etapas 1–3.

---

## 9. Definición de hecho (Etapa 4)

Criterio de salida de `docs/plan.md` (Etapa 4), sin cambios:

> - Los tests demuestran que ningún trabajo fuera de regla avanza sin
>   autorización de la entidad originadora.
> - Todo cambio de costo queda en el historial (§12).

Traducción ejecutable:

- Aprobar trabajo adicional y exceder límite solo funciona con sesión de la
  empresa originadora (matriz #23–#32); la asignada recibe 403/404.
- Todo envío, corrección, solicitud, resolución y constancia genera su evento
  de audit con actor y fecha; los reportes enviados y las constancias son
  inmutables (verificado por test y por grants de BD).
- Un job creado por aprobación nace en la misma orden original, enlazado a su
  constancia (matriz #24).

---

## 10. Criterios de aceptación (Given/When/Then)

### 10.1 Costos (§8.1–§8.3)

- **AC-4.1** Given un profesional con asignación aceptada, When prepara ítems
  en el borrador, Then la dueña aún no los ve y el emisor sí.
- **AC-4.2** Given un borrador con ítems, When el emisor confirma el envío,
  Then el reporte queda `submitted` con total calculado, hay evento
  `cost_report.submitted` y el destinatario recibe correo (§14.1).
- **AC-4.3** Given un reporte enviado, When el emisor lo corrige, Then existe
  una versión nueva enlazada a la anterior, la anterior permanece intacta y el
  destinatario original recibe la notificación (§8.2).
- **AC-4.4** Given dos asignaciones de la orden a empresas distintas, When cada
  emisor registra costos, Then cada parte ve solo su reporte (§8.3, §16.9).
- **AC-4.5** Given una asignación revocada que llegó a `accepted`, When su
  emisor envía costos, Then el envío procede (§20.2, §8.1); si la asignación
  nunca aceptó, Then 403.

### 10.2 Límites y margen (§8.4, §8.5)

- **AC-4.6** Given una empresa con límite general USD 250, When se crea una
  orden sin especificar límite, Then la orden hereda 250; con
  `applyCompanyDefault: false`, Then queda sin límite.
- **AC-4.7** Given una orden con límite 250 y costos enviados de 300, When se
  consulta el resumen, Then `exceedsLimit` es `true` y el registro existente
  se conserva (§8.5: «el gasto real debe conservarse»).
- **AC-4.8** Given un exceso, When la originadora aprueba una autorización
  `exceed_spending_limit` con tope 100, Then el techo autorizado pasa a 350 y
  `exceedsLimit` resulta `false` con total 300.
- **AC-4.9** Given un margen del 20 % activado, When se consulta el techo
  autorizado, Then es idéntico al caso sin margen (§8.5).
- **AC-4.10** Given un margen activado, When se consulta el resumen como la
  empresa asignada, Then no aparece el margen.

### 10.3 Autorizaciones (§8.4, §8.7, §9, §18.1)

- **AC-4.11** Given un asignado, When propone trabajo adicional, Then se crea
  la solicitud sin job nuevo y la originadora puede aprobarla.
- **AC-4.12** Given una solicitud `additional_work` aprobada, Then existe un
  job pendiente y sin asignar en la misma orden, enlazado a la constancia
  (§8.4, §9).
- **AC-4.13** Given una solicitud aprobada o rechazada, When se intenta
  resolver de nuevo, Then 409.
- **AC-4.14** Given una autorización recibida por teléfono, When un miembro de
  la originadora la registra, Then la constancia identifica quién autorizó,
  cuándo, qué y quién registró (§18.1), con evento audit; si la registra la
  asignada, Then 403 (§8.4).
- **AC-4.15** Given constancias y costos en la orden, When se consulta el
  historial económico, Then se distinguen límite inicial, autorizaciones y
  gasto realizado (§8.7).

### 10.4 Emergencias (§8.6)

- **AC-4.16** Given la política vigente `resolve_without_authorization`, When
  el profesional registra costos de emergencia, Then no se exige autorización
  previa y los ítems quedan marcados `is_emergency`.
- **AC-4.17** Given la política `emergency_amount` con importe 150, When los
  costos emergency enviados suman 200, Then el resumen señala el exceso de 50
  sobre el importe pre-autorizado.
- **AC-4.18** Given una orden con relación comercial vinculada que define una
  política de emergencia, Then manda la de la relación; si la relación no
  define ninguna o no hay relación, Then manda la general de la empresa (§8.6).

### 10.5 Relaciones comerciales (§8.6, decisión 4)

- **AC-4.19** Given una relación finalizada (`ended_at`), When se intenta
  adjuntar a una orden nueva, Then 404/422; las órdenes que ya la referenciaban
  conservan su política vigente.
- **AC-4.20** Given un `owner` que crea una relación con override, Then hay
  evento `commercial_relation.created` con actor; un `member` recibe 403.

- **AC-4.21** Given una empresa con política general `prior_authorization` y
  una relación con `resolve_without_authorization`, When una orden de esa
  empresa se vincula a la relación, Then el resumen reporta
  `resolve_without_authorization` como política vigente.
- **AC-4.22** Given una relación cuya contraparte es una empresa, When otro
  intenta crear la misma pareja, Then 409 (única por pareja).

---

## 11. Casos excepcionales (comportamiento esperado)

| Caso | Comportamiento |
|---|---|
| Importe negativo, > 2 decimales o fuera de rango | 422; nada persiste (§3). |
| Doble submit o submit tras corrección abierta | 409 con RFC 7807 (§11 Etapa 3). |
| Dos usuarios envían el mismo borrador a la vez | Transacción con bloqueo: un 204 y un 409 (matriz #20). |
| Corregir sin versión enviada | 409. |
| Ítems sobre reporte enviado | 409 (immutabilidad, §8.2). |
| Asignación revocada/rechazada | Ver §1.2 decisión 8: envía solo si llegó a `accepted`; el reporte y sus versiones se conservan siempre (§12). |
| Solicitud resuelta dos veces (carrera) | Transacción: un 204 y un 409 (matriz #34). |
| Aprobar `additional_work` cuando la orden se canceló/cerró | 409: no se agregan trabajos a órdenes terminales (§20.1). |
| Constancia offline con `grantedAt` futuro o pasado lejano sin nota | Futuro → 422; pasado se acepta con la descripción (registro humano). |
| `amount_cap` de una autorización `exceed_spending_limit` = 0 o negativo | 422 (la autorización debe autorizar algo). |
| Costos superan el límite | Nunca se bloquea el registro; el resumen señala `exceedsLimit` (§8.5). |
| Trabajo adicional aprobado en orden `cancelled`/`completed` | 409 (§20.1; crear orden vinculada, Etapa 2). |
| Default de empresa nulo y orden sin límite | «Sin límite económico» explícito: `effectiveLimit: null` (§8.4). |
| Datos sensibles en payloads | Descripciones de trabajo adicional y notas de solicitud son internas: la asignada ve sus propias solicitudes; el texto de rechazo lo ve el solicitante; nunca aparecen códigos de acceso (§16.4). |
| Re-enviar la misma corrección dos veces | Cada corrección es una versión nueva; el historial completo es navegable vía `previous_report_id`. |
| Relación con ambas contrapartes o con ninguna | 422; exactamente una contraparte (§2.4). |
| Relación con la misma empresa como contraparte | 422 (no se registran relaciones internas). |
| Adjuntar a una orden una relación ajena o finalizada | 404/422; la orden queda sin vínculo y su política sigue siendo la de la empresa (matriz #50). |
| PATCH que intente cambiar la contraparte de una relación | 422; solo se editan etiqueta, override y `ended` (§2.4). |
| Relación duplicada (misma pareja empresa↔empresa activa) | 409 (§2.4 único). |
| Política `emergency_amount` con importe nulo o negativo | 422; `emergency_amount` exige importe ≥ 0. |
| Finalizar dos veces la misma relación | 200 idempotente (segundo PATCH no altera `ended_at`). |
