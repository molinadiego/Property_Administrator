# Especificación técnica — Etapa 5

Documento de implementación de la **Etapa 5 (Facturación y pagos)** del
`docs/plan.md`, derivado de `proyect.md` (requisitos aprobados v1.0). Las
referencias (§x) apuntan a `proyect.md`.

Base normativa: `proyect.md` §2.1–2.3, §3.5, §5, §8.2, §11 (11.1–11.6), §12,
§14.1, §16, §17, §18.2, §20.4.

> **Aprobada el 18/10/2026** por el dueño, con las 6 decisiones de §1.2
> plegadas (incluida la ampliación de alcance P3 — facturación a cliente
> propio con cuenta limitada de solo lectura).

---

## 1. Alcance

### 1.1 Entra / queda fuera

**Entra (§17 Etapa 5, `docs/plan.md`):**

- Facturas: en la v1, una factura del contratista corresponde a **una sola
  orden aceptada**; el profesional factura su trabajo individual conforme a
  §11.4 (§11.1).
- **Facturación a cliente propio** (decisión P3): una empresa con orden
  vinculada a su `client_relationship` factura a su **tenant**; la cuenta de
  acceso limitada del cliente ve sus facturas en modo solo lectura
  (§11.3: la factura es privada entre emisor y destinatario).
- Borrador → emisión con **numeración propia correlativa por empresa**; la
  factura emitida es inmutable salvo anulación (§11.5, §1.1.8).
- PDF descargable con apariencia de factura, jurisdicción EE.UU., sin
  facturación electrónica (§11.6); generado en memoria con `pdfmake`, sin
  almacenar el archivo (se regenera en cada descarga).
- Estados y transiciones de §20.4: emitida, parcialmente pagada, pagada,
  vencida (evaluación perezosa, §11.2) y anulada.
- Pagos parciales y completos, saldos, devoluciones de pago y **detección de
  posibles duplicados con conciliación** entre emisor y destinatario
  (§11.1 último párrafo, §12).
- Visibilidad estricta de facturas por relación comercial: cada entidad ve
  las suyas y las emitidas hacia ella; nada de terceras empresas (§11.3,
  §16.9).
- Descargas contables propias en PDF y Excel con filtros, respetando
  permisos y disponibles también tras finalizar la relación (§3.5, §16.10).
- Correos de §14.1 relativos a facturas y pagos; **aviso cuando una
  corrección de costos posterior afecta una orden con factura emitida**
  (§8.2: el enlace se diseña aquí; la factura emitida no se modifica).
- Auditoría de §12: facturas emitidas/corregidas/anuladas, pagos,
  conciliaciones y devoluciones.

**Queda fuera (documentado, no se implementa en esta etapa):**

- **Impuestos y requisitos fiscales por estado (§18.2):** decisiones P1/P2 —
  v1 emite con subtotal = total, sin columnas de impuesto y solo con
  numeración propia + datos estándar de las partes; los campos y reglas
  fiscales se agregan por migración aditiva cuando se cierre §18.2.
- **Facturación multinivel dentro de una misma orden** (profesional → contratista →
  administradora en cadena): cada relación factura por separado (§11.3), tal
  como en Etapa 4.
- Edición de facturas emitidas con “nota de crédito”: el mecanismo de
  corrección de una emitida es **anular y volver a emitir** (§11.5); el
  detalle exacto puede revisarse con §18.2 al cierre fiscal.
- Colas de trabajo Redis + BullMQ (`docs/stack.md`, “5 (aprox.)”): la
  generación de PDF y los correos corren **síncronos** en v1; si el volumen
  lo exige se activa la cola ya prevista, sin cambiar el stack (decisión de
  diseño de esta spec: colas postergadas mientras el volumen no lo exija).
- Anticipos/adelantos para materiales (§10.4) y sus distinciones
  anticipo/reembolso/fondo: §10 no pertenece al alcance de la Etapa 5
  (§17); los pagos de esta etapa son contra factura.
- Multi-moneda: USD fija (decisión 2 de la Etapa 4), sin campo `currency`.
- Interfaz web: fuera del alcance del backend (§1, Etapa 6).

### 1.2 Decisiones resueltas (18/10/2026, respuestas del dueño)

| # | Pregunta | Decisión |
|---|---|---|
| **P1** (§18.2) | ¿Impuestos en la factura de v1? §11.1 lista “impuestos aplicables” como contenido *posible*, pero §18.2 sigue abierto. | **v1 sin impuestos**: subtotal = total, sin columnas de impuesto; al cerrar §18.2 se agregan `invoice_taxes` (o la regla que corresponda) por migración aditiva. |
| **P2** (§18.2) | ¿Requisitos fiscales por estado en v1 (EIN del emisor, estados de las partes, etc.)? | **No en v1**: solo numeración propia, fechas y datos estándar de las partes (§11.6). Los campos fiscales quedan abiertos con §18.2. |
| **P3** | ¿Facturación a cliente propio (empresa con `client_relationship` → `tenant` con cuenta limitada) en v1? | **Sí, entra**: el destinatario puede ser el `tenant` de la relación de cliente de la orden; la cuenta de acceso limitada del cliente ve sus facturas (lista, detalle y PDF) en **solo lectura** — sin pagos ni descargas contables (D13). |
| **P4** | ¿Quién emite, anula y registra pagos? §2.1–2.3 habilitan a la *empresa*; el rol `owner`/`member` no define datos concretos (Etapa 1 §2.3). | Emitir, editar borradores y registrar pagos: **cualquier miembro activo**; **anular: solo `owner`** (§20.4 “procedimiento autorizado”). |
| **P5** | ¿Devoluciones de pago (§12 lista “devoluciones”) en v1? | **Sí**, como `payments.kind = refund`: monto > 0 que reduce el pagado neto; factura pagada puede volver a parcial. |
| **P6** | Tensión interna de `proyect.md`: §11.2 (vencida = pasó el vencimiento **y** hay saldo) vs §20.4 (“Vencida → Parcialmente pagada: se registra un pago parcial”). | **Precedencia de §11.2**: un pago parcial sobre factura vencida queda registrado como evento, pero la factura sigue `overdue` hasta saldar; al saldar pasa a `paid`. (`proyect.md` no se modifica: la interpretación queda documentada aquí.) |

**Decisiones de diseño (revisadas con la spec):**

- **D1 — Elegibilidad para facturar** (§11.1, §11.4): el emisor debe ser parte
  de la orden; hay dos caminos:
  - **D1a — Con asignación** (contratista → administradora, profesional →
    contratista/administradora): el emisor tiene una asignación de la orden
    que **llegó a `accepted`** (misma regla de la decisión 8 de la Etapa 4:
    `accepted`, o `revoked` con `responded_at` —aceptó antes—);
    destinatario = empresa originadora de la orden. Corresponde a “una sola
    orden aceptada” (§11.1). Si el emisor es de tipo `own_business`
    (profesional), además **cada renglón debe referenciar un trabajo
    terminal** (`done` \| `incomplete` \| `not_realized`, §20.2) — “cuando ese
    trabajo está terminado” (§11.4); para tipo `contractor` basta la
    asignación aceptada (§11.1 no exige término). En ambos tipos, crear el
    borrador requiere **al menos un trabajo elegible** (aceptado; terminal si
    corresponde).
  - **D1b — Cliente propio (P3)**: la orden tiene `client_relationship_id`
    (empresa originadora con cliente propio); emisor = empresa originadora,
    destinatario = el `tenant` de esa relación. Requiere **al menos un
    trabajo de la orden en estado terminal** y los renglones solo pueden
    referenciar trabajos terminales (§11.4).
  - Empresa `property_management` no emite facturas en v1 (no recibe órdenes
    con asignación propia); solo es destinataria.
  - Orden `cancelled` (§20.1 solo cancelable sin trabajo realizado) → 409 al
    crear nuevos borradores; las facturas ya emitidas conservan su validez e
    historial (§11.5, §1.1.8).
- **D2 — Numeración**: correlativa por empresa, asignada **al emitir** bajo
  lock de fila (`invoice_counters`), sin huecos; las anuladas conservan su
  número y el siguiente sigue la serie. Borradores no tienen número.
- **D3 — Vencimiento**: `due_date` configurable en el borrador; si no se
  indica, **emisión + 30 días**. `due_date` debe ser ≥ fecha de emisión (422).
- **D4 — Vencida evaluada de perezosa**: sin cron ni cola; cualquier lectura
  o registro de pago reevalúa `overdue` (P6) y persiste la transición cuando
  corresponde.
- **D5 — Totales**: en borrador, subtotal/total se calculan de los renglones;
  **al emitir se congelan** (`subtotal`, `total`) para que la emitida sea
  inmutable (§11.5). Dinero en centavos enteros internamente
  (`common/dto/money.ts` + utilidades de la Etapa 4); nunca `Float` (§12).
- **D6 — Duplicados (§11.1)**: al registrar un pago se busca en la factura un
  pago del **mismo tipo** con igual `amount`, igual `paid_at` (fecha) y
  `reference` igual (normalizada; dos `null` cuentan como igual). Coincidencia
  → el nuevo queda `duplicate_suspect` enlazado al existente; **no suma** al
  pagado hasta resolverse. Resolución por cualquier miembro de cualquiera de
  las partes: `same` → `duplicate_confirmed` (conservado, no suma) o
  `distinct` → `recorded` (suma). Constancia en la fila
  (`reconciled_by`, `reconciled_at`) + audit `payment.reconciled`.
- **D7 — Saldos**: `paid_net = Σ(charge recorded) − Σ(refund recorded)`;
  `balance = total − paid_net`. **No se admite sobre-pago** (charge > balance
  → 422) ni devolución mayor que lo pagado (422). Un pago no puede quedar con
  `paid_at` futura (422).
- **D8 — Múltiples facturas por orden** permitidas (facturación por hitos);
  una factura siempre es de **una sola orden** (v1, §11.1).
- **D9 — Corrección de costos vs factura emitida (§8.2)**: la factura no se
  modifica; al enviar una corrección de costos de una orden con factura(s)
  emitida(s) no anulada(s), se envía un correo de aviso con los números de
  factura a las partes afectadas (plantilla `invoice.cost_correction_notice`).
- **D10 — Correos**: `invoice.issued` → destinatario (empresa: originador de
  la orden o, si no existe, los `owner` de la empresa destinataria; `tenant`
  con P3: su `tenants.email` si existe —si no, se omite el correo sin
  fallar—); `invoice.voided` → contraparte; `payment.recorded` → contraparte;
  `payment.duplicate_suspect` → registrante. Los destinatarios `tenant`
  siguen la misma regla de “solo si hay email”.
- **D11 — Descargas contables**: un solo endpoint con `format=pdf|excel` y
  filtros (`from`, `to`, `order_id`, `counterparty_company_id`); incluye solo
  registros visibles para la empresa solicitante (facturas emitidas y
  recibidas, pagos de esas facturas, reportes de costos propios). Auditado.
- **D12 — Módulo único** `src/modules/billing/` (facturas + pagos +
  descargas), convención de `docs/stack.md` §4.
- **D13 — Cuentas de acceso limitadas con facturas en solo lectura (P3)**:
  el cliente solo consulta (`GET` lista, `GET` detalle, `GET` pdf bajo
  `/limited/:token/…`); **no** registra pagos ni exporta registros contables
  (§4.3: comunicar pedidos y consultar; los pagos de esas facturas los
  registra la empresa emisora, con `paid_at` y referencia reales).

---

## 2. Modelo de datos

Convenciones: `id` UUID (generados en la app), timestamps `timestamptz` en
UTC, `created_at`/`updated_at` en todas las tablas, **`company_id` en toda
tabla tenant-scoped** (regla transversal de `docs/stack.md`). Dinero:
`Decimal(12, 2)` en BD, string decimal en la API (Etapa 4 §3), centavos
enteros en los cálculos. Migraciones **solo aditivas** (§1.1.8).

### 2.1 Enums nuevos

```prisma
enum InvoiceStatus {        // §11.2, §20.4 — «overdue» se deriva, no se almacena (D4/P6)
  draft
  issued
  partially_paid
  paid
  voided
}

enum InvoiceLineKind {      // §11.1: materiales, mano de obra, herramientas, desplazamiento, otros
  material
  labor
  tool_rental
  travel
  other
}

enum PaymentKind {          // §11.1, §12 «devoluciones» (P5)
  charge
  refund
}

enum PaymentStatus {        // §11.1: posible duplicado conservado y conciliado, nunca borrado
  recorded
  duplicate_suspect
  duplicate_confirmed
}

enum PaymentMethod {
  cash
  check
  transfer
  card
  other
}
```

### 2.2 `invoices` — factura (§11.1, §11.2, §11.5)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | **emisor** (tenant del emisor) |
| recipient_company_id | uuid null FK → companies | destinatario empresa (contratista→administradora, profesional→contratista) |
| recipient_tenant_id | uuid null FK → tenants | destinatario cliente propio (decisión P3, D1b) |
| order_id | uuid FK → orders | una sola orden por factura (v1, D8) |
| status | InvoiceStatus | base almacenada; la API expone el estado **derivado** (D4/P6) |
| number | int null | correlativo por empresa; asignado solo al emitir (D2) |
| issue_date | date null | al emitir |
| due_date | date null | configurable; default emisión + 30 días (D3) |
| subtotal | Decimal(12,2) null | congelado al emitir |
| total | Decimal(12,2) null | congelado al emitir; sin impuestos en v1 (P1) |
| notes | text null | editable solo en borrador |
| voided_at / void_reason / voided_by | | anulación (§11.5); `voided_by` FK → users |
| created_by | uuid FK → users | |
| created_at / updated_at | timestamptz | |

- **Exactamente un destinatario**: `CHECK` que garantiza
  `recipient_company_id XOR recipient_tenant_id` (§11.3: la factura es
  privada entre emisor y su destinatario).
- **Unique (company_id, number)**: la serie es por empresa y no admite
  huecos (D2).
- Emitida inmutable: `status ≠ draft` no permite editar campos ni renglones
  (§11.5); solo transiciones de pago/anulación (§20.4).
- No se borran facturas: ni endpoint ni grants de DELETE (§1.1.8, §12).

### 2.3 `invoice_lines` — renglones (§11.1)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| invoice_id | uuid FK → invoices | índice |
| job_id | uuid FK → jobs | **cada línea referencia el trabajo** (§11.1); debe pertenecer a la orden de la factura y cumplir la elegibilidad de D1 (asignación aceptada del emisor; terminal si el emisor es `own_business` o el destino es cliente propio) |
| kind | InvoiceLineKind | |
| description | text | 1–500 |
| amount | Decimal(12,2) | ≥ 0 (CHECK); el total de la factura es la suma |
| created_at / updated_at | timestamptz | |

Renglones solo editables con el borrador (PUT reemplaza la lista completa,
patrón de cost items de la Etapa 4).

### 2.4 `payments` — pagos y devoluciones (§11.1, §11.2, §12)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | **registrante**; debe ser el emisor o el destinatario de la factura |
| invoice_id | uuid FK → invoices | índice |
| kind | PaymentKind | `charge` \| `refund` (P5) |
| status | PaymentStatus | `recorded` cuenta en el saldo; los `duplicate_*` no (D6) |
| duplicate_of_id | uuid null FK → payments (auto) | enlace del posible duplicado con su canónico |
| amount | Decimal(12,2) | > 0 (CHECK) |
| paid_at | date | fecha del pago; ≤ hoy (422 si futura) |
| method | PaymentMethod null | |
| reference | text null | referencia o comprobante (parte de la comparación de duplicados) |
| notes | text null | |
| reconciled_by / reconciled_at | | constancia de conciliación (§11.1) |
| created_by | uuid FK → users | |
| created_at / updated_at | timestamptz | |

Los pagos **nunca se borran ni se editan** salvo la resolución de duplicado
(`status`, `duplicate_of_id`, `reconciled_*`) en su propio endpoint; nada los
sobrescribe silenciosamente (§11.1, §12).

### 2.5 `invoice_counters` — serie correlativa por empresa (D2)

| Campo | Tipo | Notas |
|---|---|---|
| company_id | uuid PK FK → companies | un contador por emisor |
| last_number | int | default 0; se incrementa con `SELECT … FOR UPDATE` en la transacción de emisión |

### 2.6 Tablas modificadas

Ninguna. La etapa es **totalmente aditiva** (§1.1.8): no toca `orders`,
`jobs`, `assignments` ni las tablas de las Etapas 1–4.

### 2.7 Directorio de módulos (convención de `docs/stack.md` §4)

```
src/modules/billing/
├── invoice-rules.ts       # reglas puras: elegibilidad (D1), totales en centavos,
│                          # estado derivado (D4/P6), duplicados (D6), anulación, números
├── invoice-rules.spec.ts
├── dto/                   # create-invoice, patch-invoice, put-lines, void,
│                          # create-payment, reconcile, accounting-export.query
├── billing.service.ts     # facturas + pagos con locks FOR UPDATE
├── pdf.service.ts         # pdfmake en memoria (síncrono, D-v1/Q5)
├── excel.service.ts       # exceljs (registros contables, D11)
├── billing.controller.ts
└── billing.module.ts
```

Más allá del módulo: `AUDIT_ACTIONS_ETAPA5` en `audit/audit-actions.ts`,
plantillas de correo nuevas en `email/email.service.ts` (D10 + D9),
`BillingModule` en `app.module.ts`, dependencias nuevas **justificadas** en
`docs/stack.md`: `pdfmake` (PDF de factura) y `exceljs` (descargas), ya
previstas para la Etapa 5.

### 2.8 Índices globales

- `invoices(company_id)`, `invoices(recipient_company_id)`,
  `invoices(recipient_tenant_id)`, `invoices(order_id)`,
  `invoices(status)`
- `invoices(company_id, number)` **unique**
- `invoice_lines(invoice_id)`, `invoice_lines(job_id)`
- `payments(invoice_id)`, `payments(company_id)`, `payments(status)`

**No hay `REVOKE` de UPDATE/DELETE sobre `invoices`/`payments`** (a diferencia
de `audit_log` y `order_authorizations`): las transiciones de estado, la
anulación y la conciliación requieren UPDATE en la propia fila. La
inmutabilidad de la factura emitida se garantiza en la aplicación (sin
endpoints de edición) y se prueba con tests (PATCH/PUT/emit sobre emitida →
409); el audit log conserva los grants append-only ya existentes.

---

## 3. Convenciones de la API

Se referencian `docs/especificacion/etapa-1.md` §3 y
`docs/especificacion/etapa-4.md` §3 (RFC 7807 `problem+json`, prefijo
`/api/v1`, `CompanyAccessGuard`, sesión global, paginación por cursor,
dinero como string decimal ≤ 2 decimales, estados financieros append-only).
Lo nuevo de esta etapa:

- **Fechas de dominio** (`issue_date`, `due_date`, `paid_at`): string
  `YYYY-MM-DD` (validadas con `IsDateString`); timestamps de eventos en ISO
  8601.
- **Respuestas de factura**: el campo `status` es el estado **derivado**
  (§11.2 + P6); `balance` y `paidNet` se calculan en cada lectura y se
  serializan como string decimal.
- **Descargas**: `GET …/pdf` → `application/pdf`;
  `…/accounting-exports?format=excel` →
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  El PDF se genera en memoria con `pdfmake` y no se almacena (se regenera en
  cada descarga); el Excel se construye en streaming con `exceljs`.
- Números de factura en respuestas como entero (`number: 7`); el PDF muestra
  «Factura N.º 7».
- Campos sensibles (`access_lockbox`, motivos privados, notas internas de
  otras etapas) no aparecen en payloads de esta etapa.

---

## 4. Endpoints

Todos documentados con decoradores `@nestjs/swagger` y visibles en
`/api/docs`. `:id` es siempre la empresa **del request** (tenant guard).

### 4.1 Facturas (§11.1, §11.4, §11.5, §20.4)

| Método | Ruta | Descripción | Permiso | Éxito / fallos |
|---|---|---|---|---|
| GET | `/companies/:id/invoices` | Lista en la que la empresa es emisora o destinataria; filtros `status`, `order_id`, `counterparty_company_id`; cursor | miembro activo | 200 / 404 |
| POST | `/companies/:id/invoices` | Crea **borrador** (`:id` = emisor) de una orden donde el emisor es parte (D1a/D1b); `orderId` obligatorio; el destinatario se deduce (empresa originadora, o `tenant` del `client_relationship` de la orden) | miembro (P4) | 201 / 403 / 404 / 409 / 422 |
| GET | `/companies/:id/invoices/:invId` | Detalle: renglones, pagos, `paidNet`, `balance`, estado derivado, datos de las partes | parte (emisor o destinatario) | 200 / 404 |
| PATCH | `/companies/:id/invoices/:invId` | Editar campos del borrador (`notes`, `dueDate`) | emisor, solo `draft` | 200 / 403 / 404 / 409 |
| PUT | `/companies/:id/invoices/:invId/lines` | Reemplazar renglones (valida `jobId` elegible) | emisor, solo `draft` | 200 / 403 / 404 / 409 / 422 |
| POST | `/companies/:id/invoices/:invId/emit` | Emitir: número correlativo, `issue_date`, `due_date` default, snapshot de totales, correo al destinatario, audit | emisor, solo `draft` | 204 / 403 / 404 / 409 / 422 |
| GET | `/companies/:id/invoices/:invId/pdf` | PDF descargable (§11.1, §11.6) | parte; solo emitida o anulada | 200 / 404 / 409 |
| POST | `/companies/:id/invoices/:invId/void` | Anular con `reason` obligatorio; conserva factura, renglones y pagos (§11.5) | **emisor + `owner`** (P4); estados `issued`/`partially_paid`/`overdue` | 204 / 403 / 404 / 409 / 422 |

### 4.2 Pagos (§11.1, §11.2, §20.4)

| Método | Ruta | Descripción | Permiso | Éxito / fallos |
|---|---|---|---|---|
| POST | `/companies/:id/invoices/:invId/payments` | Registrar `charge` o `refund` (D7); posible duplicado → 201 con `status: duplicate_suspect` y correo de aviso (D6) | parte (emisor o destinatario), miembro (P4) | 201 / 403 / 404 / 409 / 422 |
| POST | `/companies/:id/payments/:paymentId/reconcile` | Resolver posible duplicado: `{ resolution: "same" \| "distinct" }` (D6); constancia + audit | parte de la factura del pago | 204 / 404 / 409 / 422 |

No hay endpoints de listar/editar/borrar pagos fuera del detalle de la
factura: el historial vive en la factura y en el audit log (§12).

### 4.3 Descargas contables (§3.5, §16.10)

| Método | Ruta | Descripción | Permiso | Éxito / fallos |
|---|---|---|---|---|
| GET | `/companies/:id/accounting-exports?format=pdf\|excel&from=…&to=…&order_id=…&counterparty_company_id=…` | Registros contables **propios** visibles (facturas emitidas y recibidas, pagos de esas facturas, reportes de costos propios); audit `accounting.exported` | miembro activo; disponible **también tras finalizar la relación comercial** (§3.5) | 200 / 404 / 422 |

Los tokens de acceso limitado (tenantes/clientes, Etapa 2) **no** tienen
endpoints de exportación contable.

### 4.4 Cuentas de acceso limitadas — facturas al cliente propio (P3, D13)

Rutas bajo el patrón `/limited/:token/…` de la Etapa 2 §3 (token opaco hasheado, sin sesión). **Solo lectura**: sin pagos, sin borradores, sin anulación ni descargas contables — cualquier intento hacia rutas de empresa recibe 401/404 como hasta ahora (Etapa 2 §5.1).

| Método | Ruta | Descripción | Permiso | Éxito / fallos |
|---|---|---|---|---|
| GET | `/limited/:token/invoices` | Facturas cuyo destinatario es **su** `tenant` (§11.3: privadas entre emisor y destinatario) | token válido del tenant | 200 / 401 / 404 |
| GET | `/limited/:token/invoices/:invId` | Detalle: renglones, pagos, saldo, estado derivado (mismos datos que ve una parte empresa) | token del destinatario | 200 / 401 / 404 |
| GET | `/limited/:token/invoices/:invId/pdf` | PDF descargable de su factura (§11.1, §11.6) | token del destinatario; solo emitida o anulada | 200 / 401 / 404 / 409 |

Una factura dirigida a otro `tenant` responde **404** (no se filtra). Los costos siguen invisibles para las cuentas limitadas (§4.3); solo ven las facturas emitidas hacia ellos.

---

## 5. Reglas de permisos (resumen normativo)

1. Toda operación verifica permiso en el servidor (§16.1); ocultar en la
   interfaz no cuenta.
2. Toda query pasa por el tenant guard: `company_id` deriva de la membresía
   del request, nunca del cliente (§16.2, §16.8). Una factura de una empresa
   ajena responde **404** — no se filtra su existencia (§16.8, §11.3).
3. Las facturas son privadas entre emisor y destinatario: ambas partes las
   ven; cualquier otra empresa, 404 (§11.3, §16.9).
4. Emitir/editar/anular es acción del **emisor**: el destinatario que lo
   intente sobre la factura (vista como parte) recibe **403** (relación
   existe, acción no corresponde — mismo patrón que la Etapa 4).
5. Anular exige `owner` del emisor; el resto de las operaciones de la etapa
   las puede hacer cualquier miembro activo de la parte correspondiente (P4).
6. Emitir requiere que el emisor sea parte de la orden con la elegibilidad
   de D1a/D1b (§11.1, §11.4); registrar pagos requiere ser **empresa**
   emisora o destinataria de **esa** factura (§11.1); cuando el destinatario
   es un `tenant` (P3), solo la empresa emisora registra pagos — su cuenta
   limitada es de solo lectura (D13, §4.3).
7. Las descargas respetan los permisos de quien las solicita (§16.10): solo
   registros visibles para esa empresa; el acceso a los propios registros no
   expira con la relación (§3.5). Las cuentas limitadas no exportan (D13).
8. Toda acción relevante queda en el audit log con actor y fecha (§12,
   §1.1.5); las facturas emitidas, sus anulaciones, pagos, conciliaciones y
   devoluciones no se borran ni se editan silenciosamente (§11.5, §12).
9. Una corrección de costos **no modifica** facturas emitidas; solo genera
   aviso (§8.2, D9).
10. Las cuentas de acceso limitadas solo **leen** sus facturas (lista,
    detalle, PDF) bajo `/limited/:token/…`; una factura de otro `tenant` es
    404 y los costos siguen invisibles (§4.3, §11.3, D13).

---

## 6. Matriz de permisos como tests de integración (§16.1)

Tests con Testcontainers + PostgreSQL real (patrón de las Etapas 1–4):
**54 escenarios**. **Si un escenario falla, no se pasa de etapa.**

### 6.1 Acceso base, borradores y elegibilidad (#1–#12)

| # | Escenario | Esperado |
|---|---|---|
| 1 | Cualquier endpoint nuevo sin sesión (lista, crear, detalle, PATCH, PUT lines, emit, pdf, void, payments, reconcile, exports) | 401 |
| 2 | Contratista con asignación `accepted` en orden de la administradora crea borrador | 201 `draft`, sin número, `total` null |
| 3 | Miembro (rol `member`) de la emisora crea/edita borrador y registra pago | 201/200/201 (decisión P4: emisión y pagos para cualquier miembro activo) |
| 4 | Empresa cuya asignación sigue `pending` intenta crear borrador | 409 (§11.1: orden no aceptada) |
| 5 | Empresa con asignación `rejected` (nunca aceptó) intenta crear borrador | 409 |
| 6 | Profesional (`own_business`) con trabajo aún `pending`/`accepted`/`in_progress` | 409 (§11.4: no terminado); con el job en `done` → 201 |
| 7 | Empresa que no es parte de la orden (sin asignación y sin `client_relationship` propio de ella) crea factura o la lee | 404 (no filtra existencia, §16.8) |
| 8 | Renglón con `jobId` de otra orden, de un trabajo ajeno o inexistente | 422 |
| 9 | PATCH de campos o PUT de renglones sobre borrador | 200 (recalcula total) |
| 10 | PATCH/PUT sobre factura emitida | 409 (§11.5: inmutable) |
| 11 | Destinatario intenta editar, emitir o anular la factura bajo su propia empresa | 403 (es parte, pero la acción es del emisor) |
| 12 | Miembro `member` intenta anular (con P4: anulación solo `owner`) | 403; `owner` del emisor → 204 |

### 6.2 Emisión y PDF (#13–#20)

| # | Escenario | Esperado |
|---|---|---|
| 13 | Emitir borrador válido | 204: número correlativo, `issue_date` = hoy, `due_date` default hoy+30, totales congelados, audit `invoice.emitted`, correo al destinatario |
| 14 | Emitir sin renglones o con total 0 | 422 |
| 15 | Emitir dos veces en paralelo | carrera: un 204 y un 409 (lock del contador y de la factura) |
| 16 | Emitir ya emitida / borrador inexistente | 409 / 404 |
| 17 | Descarga PDF de la emitida por emisor y por destinatario | 200 `application/pdf` con número, partes, renglones, total y saldo |
| 18 | PDF de borrador | 409; PDF de anulada | 200 (conserva el original, §11.5) |
| 19 | Tercera empresa (ni emisora ni destinataria) lee detalle, lista o PDF | 404 |
| 20 | Dos empresas emiten en paralelo | series independientes: cada una recibe su número sin interferir |

### 6.3 Estados y anulación (#21–#27)

| # | Escenario | Esperado |
|---|---|---|
| 21 | Emitida sin pagos → pago parcial → pago total | estados derivados: `issued` → `partially_paid` → `paid`, saldo 0 |
| 22 | Pago total a factura `paid` | 422 (sin saldo, D7) |
| 23 | `due_date` pasado con saldo | estado derivado `overdue`; tras pago parcial sigue `overdue` hasta saldar (P6) y el pago queda como evento |
| 24 | Anular emitida/parcial/vencida con motivo | 204: conserva renglones y pagos, audit `invoice.voided`, correo a la contraparte |
| 25 | Anular pagada o borrador; anular sin motivo | 409 / 409 / 422 (§20.4) |
| 26 | Registrar pago sobre factura anulada | 409 |
| 27 | Orden cancelada después de emitir facturas | facturas emitidas intactas; nuevo borrador sobre esa orden → 409 |

### 6.4 Pagos, duplicados y devoluciones (#28–#37)

| # | Escenario | Esperado |
|---|---|---|
| 28 | Emisor y destinatario registran pagos legítimos distintos | 201 cada uno; `paidNet` suma ambos (sin doble conteo) |
| 29 | Pago con importe > saldo, `paid_at` futura o importe ≤ 0 | 422 / 422 / 422 |
| 30 | La contraparte registra el mismo pago (importe + fecha + referencia) | 201 con `duplicate_suspect`, **no suma** al pagado, correo de aviso |
| 31 | `reconcile { "same" }` | 204 `duplicate_confirmed`, no suma, `reconciled_by/at` + audit `payment.reconciled` |
| 32 | `reconcile { "distinct" }` | 204 `recorded`, suma al pagado + audit |
| 33 | Reconciliar pago sin sospecha, con `resolution` inválida, o dos reconciliaciones en paralelo | 409 / 422 / carrera: un 204 y un 409 |
| 34 | Reconciliar desde una tercera empresa; desde cualquier miembro de una parte | 404 / 204 |
| 35 | Devolución registrada (P5) | 201, reduce `paidNet`; factura `paid` vuelve a `partially_paid`/`issued`; devolución mayor que lo pagado → 422 |
| 36 | Dos pagos totales simultáneos cuando el saldo solo alcanza para uno | carrera con lock: un 201 y un 422 |
| 37 | Cada acción de §7 genera su entrada con actor y fecha | aserción por acción (ver §7) |

### 6.5 Visibilidad y descargas contables (#38–#47)

| # | Escenario | Esperado |
|---|---|---|
| 38 | Emisor y destinatario listan y detallan facturas con filtros | 200 con sus facturas (emitidas + recibidas), pagos y saldo |
| 39 | Una tercera empresa filtra/lista | sus propias facturas vacías o de sus relaciones; el detalle ajeno → 404 |
| 40 | Cualquier miembro de una parte lee pagos y saldo de la factura | 200 (§11.3: ambas partes) |
| 41 | Export propio en Excel | 200 xlsx con hojas de facturas, pagos y costos; audit `accounting.exported` |
| 42 | Export propio en PDF | 200 `application/pdf` con el resumen contable |
| 43 | Export filtrado (`counterparty_company_id`, rango de fechas) | solo esos registros propios |
| 44 | Export con `:id` de otra empresa | 404 |
| 45 | Export tras finalizar la relación comercial (`ended_at`) | 200 (§3.5: el acceso a los propios registros no expira) |
| 46 | El export nunca incluye registros de terceras empresas ajenas | aserción de contenido (§16.10, §16.9) |
| 47 | Token de acceso limitado llama a rutas de empresa (`/companies/…`) | 401/404 según su guard (Etapa 2 §5.1, sin cambios) |

### 6.6 Facturación a cliente propio y cuentas limitadas (P3, D1b/D13) (#48–#54)

| # | Escenario | Esperado |
|---|---|---|
| 48 | Empresa originadora con `client_relationship` y al menos un trabajo terminal crea borrador para su cliente | 201 con destinatario = `tenant` de la relación |
| 49 | La misma empresa sin ningún trabajo terminal; o con trabajos aún en curso | 409 (§11.4 aplicado al trabajo propio) |
| 50 | Renglón de la factura a cliente que referencia un trabajo no terminal | 422 |
| 51 | Cuenta limitada del cliente: lista y detalle de **sus** facturas (con pagos y saldo) | 200; factura de otro `tenant` → 404; costos jamás visibles |
| 52 | Cuenta limitada descarga el PDF de su factura; intenta registrar pago, anular o exportar | 200 PDF; 404 en rutas inexistentes de pago/anulación/export (D13) |
| 53 | Factura emitida a cliente con `tenants.email` presente / ausente | correo `invoice.issued` enviado / omitido sin error (D10) |
| 54 | Export contable de la emisora (Excel/PDF) | incluye también las facturas emitidas a clientes propios y sus pagos (§11.3: son registros propios) |

---

## 7. Eventos de audit log de la Etapa 5 (§12)

Mínimo exigido por §12 (“Facturas emitidas, corregidas o anuladas”,
“Pagos, conciliaciones de pagos y devoluciones”):

| `action` | `entity_type` | Cuándo / payload mínimo |
|---|---|---|
| `invoice.created` | invoice | creación de borrador (orderId, destinatario) |
| `invoice.updated` | invoice | edición de borrador (campos/renglones cambiados) |
| `invoice.emitted` | invoice | emisión (número, total, dueDate) |
| `invoice.voided` | invoice | anulación (motivo; nunca se borra — §11.5) |
| `payment.registered` | payment | pago registrado (kind, amount, paidAt, duplicateSuspect) |
| `payment.refunded` | payment | devolución (amount, pago original si aplica) |
| `payment.reconciled` | payment | conciliación (resolution, contraparte vinculada, quién/cuándo — §11.1) |
| `accounting.exported` | accounting_export | descarga (formato, filtros) |

---

## 8. Pruebas

- **Unitarias (Jest):** `invoice-rules.spec.ts` — elegibilidad D1a/D1b, totales y
  saldo en centavos enteros, estado derivado (incluida la regla P6),
  detección de duplicados D6, límites D7, validación de anulación, formato
  de numeración D2.
- **Integración (Testcontainers + Postgres):** la matriz completa de §6
  contra la API real con HTTP; el PDF se valida por content-type y por
  presencia de texto extraído, el Excel por estructura de hojas con
  `exceljs`.
- **Contrato:** OpenAPI exportado y comparado por el gate local
  (`npm run openapi:update` + test de snapshot).

---

## 9. Definición de hecho (Etapa 5)

Criterio de salida de la Etapa 5 en `docs/plan.md`:

1. El ciclo orden → factura → pago → saldo cierra con integridad financiera
   (dinero en `Decimal`, sin `Float`).
2. Las transiciones de estado de factura coinciden con §20.4.
3. Los tests de visibilidad de facturas (§11.3) pasan.
4. Matriz de §6 (54 escenarios) completa y verde en el gate local
   (`npm run check`).
5. PDF de factura descargable (§11.6) y descargas contables PDF/Excel que
   respetan permisos (§16.10).
6. Audit log con los eventos de §7; nada de facturas/pagos se borra ni se
   edita silenciosamente (§11.5, §12).

---

## 10. Criterios de aceptación (Given/When/Then)

Cada criterio se implementa como test automatizado (§8). Toman la regla de
negocio de `proyect.md` por referencia (§x), no por copia.

### 10.1 Borradores y emisión (§11.1, §11.4, §11.5)

- **AC-5.1** Dado un contratista con asignación que llegó a `accepted` en una
  orden de una administradora, cuando crea un borrador para esa orden, entonces
  201, la factura es `draft` sin número, y el destinatario es la empresa
  originadora (§11.1, D1).
- **AC-5.2** Dado un profesional con trabajo en estado terminal, cuando crea
  el borrador, entonces 201; dado el mismo trabajo sin terminar, entonces 409
  (§11.4).
- **AC-5.3** Dada una empresa sin asignación en la orden, cuando crea o lee
  una factura de esa orden, entonces 404 (§16.8, §11.3).
- **AC-5.4** Dado un borrador con renglones válidos, cuando se editan campos y
  renglones, entonces 200 con total recalculado; dado un borrador sin
  renglones o con total 0, cuando se emite, entonces 422.
- **AC-5.5** Dado un borrador válido, cuando se emite, entonces 204, número
  correlativo por empresa sin huecos (D2), `issue_date` = hoy, `due_date` =
  hoy + 30 salvo indicación (D3), totales congelados, `invoice.emitted` en el
  audit log y correo al destinatario (§14.1).
- **AC-5.6** Dada una factura emitida, cuando se intenta editar campos,
  renglones o reemitirla, entonces 409 (§11.5: inmutable).
- **AC-5.7** Dos emisiones concurrentes de la misma factura → un 204 y un
  409; dos empresas emitiendo en paralelo → series independientes (carrera).
- **AC-5.8** Dada una factura emitida, cuando se descarga el PDF como emisor y
  como destinatario, entonces 200 `application/pdf` con número, partes,
  renglones, total y saldo (§11.1, §11.6); de un borrador → 409.

### 10.2 Estados y anulación (§11.2, §11.5, §20.4)

- **AC-5.9** Dada una emitida, cuando recibe un pago parcial y luego el total,
  entonces los estados derivados son `partially_paid` y `paid` con saldo 0
  (§20.4).
- **AC-5.10** Dada una factura con `due_date` pasado y saldo pendiente, cuando
  se consulta, entonces el estado derivado es `overdue`; un pago parcial
  posterior queda registrado y la factura sigue `overdue` hasta saldar
  (P6/§11.2).
- **AC-5.11** Dada una emitida/parcial/vencida, cuando un `owner` del emisor
  la anula con motivo, entonces 204, la factura y sus pagos se conservan
  íntegros, `invoice.voided` con actor y motivo en el audit log y correo a la
  contraparte (§11.5, §12); la anulación de una `paid` → 409 (§20.4); sin
  motivo → 422.
- **AC-5.12** Dada una factura emitida, cuando la orden subyacente se cancela
  más tarde, entonces las facturas emitidas conservan su validez e historial
  (§11.5, §1.1.8).

### 10.3 Pagos, saldo y duplicados (§11.1, §11.2)

- **AC-5.13** Dado emisor y destinatario registrando pagos de una factura,
  entonces ambos 201, `paidNet = Σ charges − Σ refunds` en centavos y
  `balance = total − paidNet` sin `Float` (§12).
- **AC-5.14** Dado un pago con importe mayor al saldo, `paid_at` futura o
  importe ≤ 0, entonces 422 y no se crea registro (D7).
- **AC-5.15** Dado un pago que coincide con otro registrado (importe, fecha y
  referencia), cuando la contraparte lo registra, entonces 201 con
  `duplicate_suspect` enlazado al canónico, **excluido** del pagado y con
  correo de aviso (§11.1, D6).
- **AC-5.16** Dado un `duplicate_suspect`, cuando se resuelve `same`, entonces
  `duplicate_confirmed` sin sumar y constancia `reconciled_by/at` +
  `payment.reconciled`; cuando se resuelve `distinct`, entonces `recorded` y
  suma al pagado; una tercera empresa → 404 (§11.1).
- **AC-5.17** Dada una factura pagada, cuando se registra un pago adicional,
  entonces 422; cuando se registra una devolución válida (P5), entonces 201
  y la factura vuelve a `partially_paid`/`issued`; devolución mayor que lo
  pagado → 422.

### 10.4 Visibilidad (§11.3, §16.9)

- **AC-5.18** Dado emisor y destinatario, cuando listan y detallan facturas,
  entonces ven las suyas y las recibidas con pagos y saldo; una tercera
  empresa → 404 en detalle/PDF y ausencia total en su lista.
- **AC-5.19** Dada una factura de la relación A↔B (empresas), cuando un miembro
  de A o de B la lee (cualquier rol, salvo anulación), entonces 200; ningún
  usuario de otra empresa recibe 200 en ninguno de sus endpoints (§11.3).
- **AC-5.20** Los tokens de acceso limitado solo llegan a `/limited/:token/…`
  (Etapa 2 §5.1, sin cambios): en rutas de empresa reciben 401/404, y en las
  rutas limitadas solo leen facturas — nunca costos (§4.3, D13).

### 10.5 Descargas y trazabilidad (§3.5, §16.10, §8.2, §12)

- **AC-5.21** Dada una empresa con facturas/pagos/costos propios, cuando
  exporta en Excel y PDF, entonces 200 con el formato correcto, solo sus
  registros visibles, filtros aplicados y `accounting.exported` en el audit
  log (§16.10); export de otra empresa → 404.
- **AC-5.22** Dada una relación comercial finalizada (`ended_at`), cuando una
  de sus partes exporta sus registros contables, entonces 200 (§3.5: el
  acceso no expira).
- **AC-5.23** Dada una orden con factura emitida, cuando el emisor de costos
  envía una corrección, entonces la factura no cambia y ambas partes reciben
  el aviso `invoice.cost_correction_notice` con los números de factura
  (§8.2, D9).
- **AC-5.24** Cada acción listada en §7 genera exactamente una entrada con
  `actor_user_id` y `created_at` correctos; no existen endpoints ni grants de
  DELETE sobre facturas/pagos (§12, §1.1.8).

### 10.6 Facturación a cliente propio (§11.1, §11.3, §11.4, P3)

- **AC-5.25** Dada una empresa originadora con `client_relationship` y al
  menos un trabajo de la orden en estado terminal, cuando crea el borrador,
  entonces 201 con destinatario = `tenant` de esa relación y renglones solo
  de trabajos terminales (§11.1, §11.4, D1b); sin trabajo terminal → 409.
- **AC-5.26** Dado el cliente con cuenta de acceso limitada, cuando consulta
  sus facturas (lista, detalle con pagos y saldo, PDF), entonces 200 solo
  para las facturas emitidas hacia **su** tenant; una factura de otro tenant
  → 404, y ningún pago ni exportación es posible desde su token (§11.3,
  §4.3, D13).
- **AC-5.27** Dada una factura emitida a un cliente con email, cuando se
  emite, entonces recibe `invoice.issued`; sin email en `tenants`, el correo
  se omite sin error (§14.1, D10).

---

## 11. Casos excepcionales (comportamiento esperado)

| Caso | Comportamiento esperado |
|---|---|
| Doble emisión simultánea de la misma factura | Lock de fila sobre la factura + lock del contador (`invoice_counters`): un 204 con número, un 409. |
| Numeración bajo carga concurrente (dos empresas) | Contadores independientes por `company_id`; la serie de cada empresa no se entremezcla ni se salta números. |
| Pago total simultáneo con saldo para uno solo | `SELECT … FOR UPDATE` sobre la factura: el segundo ve el saldo ya consumido → 422 (D7). |
| Ambas partes registran el mismo pago | El segundo queda `duplicate_suspect` (no suma); ambos registros se conservan; la conciliación deja quién/cuándo/vinculados en la fila y en el audit (§11.1). |
| Dos reconciliaciones del mismo pago en paralelo | Lock sobre el pago: gana una; la otra recibe 409 (estado ya resuelto). |
| Reembolso/devolución mayor que lo pagado | 422; el pagado neto nunca queda negativo (D7). |
| Factura emitida y luego su orden se cancela | Las emitidas conservan validez, pagos e historial (§11.5); no se pueden crear borradores nuevos sobre la orden cancelada (409). |
| Asignación revocada después de emitir una factura | La factura sigue válida (historial financiero); la elegibilidad de D1a/D1b solo se evalúa al crear borradores. |
| Corrección de costos posterior a una factura emitida | La factura no cambia; ambas partes reciben el aviso de §8.2 (D9). |
| `due_date` en el pasado al emitir | 422 (debe ser ≥ `issue_date`). |
| Factura con estado derivado `overdue` y pago total posterior | `paid` con saldo 0; el evento de pago queda registrado con su fecha real (`paid_at` puede ser anterior al día del registro). |
| Intento de PATCH/PUT/emit sobre factura emitida de otra empresa | 404 primero (tenant, §16.8); si es de la propia empresa pero no es el emisor, 403. |
| Registros contables de una relación ya finalizada | Descarga 200 siempre (§3.5); la revocación de la membresía sí corta el acceso al espacio completo (§3.3) — sin cambios respecto a las etapas previas. |
| Datos sensibles (contraseñas, tokens, `access_lockbox`) en payloads o PDFs | Nunca (§4.5, convención transversal). |
| Fechas de pago futuras o importes mal formados | 422 en DTO; dinero con ≤ 2 decimales, centavos enteros en cálculos (nunca `Float`, §12). |
| Cliente propio cuyo trabajo aún no tiene estado terminal | 409 al crear el borrador; los renglones de trabajos no terminales → 422 (§11.4, D1b). |
| `tenants.email` ausente en un destinatario cliente | El correo `invoice.issued` se omite sin error; el audit `invoice.emitted` queda igual (D10). |
| Token de cuenta limitada intenta pagar, anular, editar o exportar | 404 (no existen esas rutas bajo `/limited/:token/…`) — D13, solo lectura. |
| Factura a cliente (`recipient_tenant_id`) vista por otra empresa o por otro `tenant` | 404 en detalle/PDF; ausente de toda lista ajena (§11.3, §16.8). |
