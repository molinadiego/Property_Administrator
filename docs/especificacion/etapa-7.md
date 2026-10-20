# Especificación técnica — Etapa 7

Documento de implementación de la **Etapa 7 (Impuestos — Nevada)**, que cierra
§18.2 de `proyect.md` (enmienda 19/10/2026). Extiende la facturación de la
Etapa 5 (`docs/especificacion/etapa-5.md`); las convenciones de API, el
patrón de errores y las reglas de tenancy se referencian, no se copian. Las
referencias (§x) apuntan a `proyect.md`.

Base normativa: `proyect.md` §11.1, §11.5, §11.6, §12, §16, §18.2 (resuelto),
§20.4.

> **Aprobada el 19/10/2026** por el dueño, junto con las decisiones de
> negocio T1–T5 de §1.2 (enmienda de `proyect.md` §11.6/§18.2 del mismo día).

---

## 1. Alcance

### 1.1 Entra / queda fuera

**Entra:**

- **Perfil fiscal por empresa** (§11.6): identificación fiscal, dirección
  fiscal, tasa de impuesto por defecto y bandera de exención; editable solo
  por el rol de máxima jerarquía de la propia empresa.
- **Renglones imponibles** (§11.6): cada renglón de factura lleva la marca
  `taxable` (nace **imponible por defecto**); el emisor la marca o quita según
  su caso; no existen reglas fijas por tipo de emisor y destinatario.
- **Tasa ajustable por factura** (§11.6): el borrador puede fijar una tasa
  propia; si no, se usa la del perfil. Nevada es *destination-based*, así que
  una empresa de un condado puede facturar con la tasa de otro.
- **Cálculo y congelado al emitir** (§11.6): el impuesto se calcula sobre la
  suma de los renglones imponibles y se congela (`tax_rate`, `tax_total`)
  junto a `subtotal`/`total` (D5 de la Etapa 5); la factura emitida sigue
  siendo inmutable (§11.5).
- **PDF de factura**: fila de impuesto (tasa e importe) y datos fiscales del
  emisor; el total pasa a ser `subtotal + impuesto` (§11.6, §18.2).
- **Export contable (Excel)**: columnas de subtotal, tasa e impuesto.
- **Semilla**: perfiles fiscales ficticios de Nevada y una factura demo con
  impuesto.
- **Auditoría**: `company.tax_profile_updated` y `taxTotal`/`taxRate` en el
  payload de `invoice.emitted` (§12, enmienda 18/10: datos maestros
  editables con auditoría).

**Queda fuera (documentado, no se implementa):**

- **Proveedores de impuestos** (TaxJar/Avalara): sin dependencias nuevas; la
  tasa vive en la configuración (§11.6).
- **Reglas hardcodeadas** por tipo de emisor/destinatario o por concepto
  (`kind`): la imponibilidad la decide el emisor línea por línea (§18.2).
- **Declaraciones, pagos de impuestos y registro ante el Nevada Department of
  Taxation**: fuera del sistema, a cargo del emisor (§11.6).
- **Nota de crédito / corrección de factura emitida con error fiscal**: el
  mecanismo sigue siendo anular y volver a emitir (§11.5, decisión de la
  Etapa 5).
- **Cálculo de impuesto en borradores**: API no persiste ni calcula impuesto
  antes de emitir (`tax_rate`/`tax_total` son null en borrador, mismo patrón
  que `subtotal`/`total`).
- Interfaz web: fuera del alcance del backend (§1).

### 1.2 Decisiones resueltas (19/10/2026, respuestas del dueño)

| # | Pregunta | Decisión |
|---|---|---|
| **T1** (§18.2) | ¿Cómo se calculan los impuestos en la v1? | **Perfil fiscal por empresa** con cálculo automático al emitir; sin proveedor externo. |
| **T2** (§18.2) | ¿Jurisdicción inicial? | **Nevada**: base estatal 6.85% (4.6% estado + 2.25% condado), combinada 6.85–8.375% según condado (Clark 8.375%, Washoe 8.265%); *destination-based*. La ley no se hardcodea: la tasa es configuración (§11.6). |
| **T3** (§18.2) | ¿Quién decide qué líneas llevan impuesto? | **El emisor marca cada línea**; sin reglas fijas por combinación emisor/destinatario. |
| **T4** | ¿Default de `taxable` al crear un renglón? | **Imponible por defecto**; el emisor quita la marca cuando corresponda. |
| **T5** | ¿Tasa ajustable por factura? | **Sí** (destination-based): override en el borrador, default = tasa del perfil; la tasa usada queda congelada. |

**Decisiones de diseño:**

- **D1 — Cálculo** (§11.6): `base_imponible = Σ(renglones con taxable=true)`;
  `impuesto = redondeo_half_up(base × tasa)`. La tasa se almacena en
  **milesimos de porcentaje entero** en memoria (`8.375%` → `8375`) y el
  cálculo se hace en centavos enteros: `tax_cents =
  round(base_cents × rate_milli / 100_000)` (sin `Float`, §12). Redondeo
  comercial half-up a 2 decimales.
- **D2 — Resolución de tasa al emitir**: `tasa = tax_rate de la factura
  (override) ?? default_tax_rate del perfil`. Reglas:
  - `tax_exempt = true` → `tax_total = 0.00` sin importar tasas ni renglones.
  - Sin líneas imponibles (o base 0) → `tax_total = 0.00`; `tax_rate` se
    congela igualmente (override ?? default, puede ser null).
  - Con líneas imponibles y **sin tasa disponible** (sin override ni default)
    → **422** al emitir, con mensaje que indique las tres salidas válidas:
    fijar tasa en la factura, configurar la tasa del perfil o marcar la
    empresa exenta. Nunca se cobra (ni se omite) impuesto por silencio.
- **D3 — Override de tasa**: campo opcional `taxRate` en `PATCH` del
  borrador (junto a `notes`/`dueDate`); `null` lo limpia. Validado 0–100 con
  ≤ 3 decimales (422 fuera de rango). Solo en `draft` (§11.5).
- **D4 — Congelado** (§11.6): al emitir se persisten `tax_rate` (la aplicada,
  aunque el impuesto sea 0) y `tax_total` (siempre ≥ 0; `0.00` para facturas
  antiguas por backfill); `total = subtotal + tax_total` con `CHECK` con nombre
  `invoices_total_includes_tax`. Emitidas inmutables (§11.5, D5 Etapa 5).
- **D5 — Perfil fiscal**: en `companies`; editable solo vía
  `PATCH /companies/:id` (ya gateado a `owner`) con audit dedicado
  `company.tax_profile_updated` (before/after, patrón de
  `company.economic_settings_changed` de la Etapa 4). Visible para cualquier
  miembro activo de la propia empresa (no es dato sensible).
- **D6 — PDF** (§11.6, §18.2): bloque del emisor agrega ID fiscal y dirección
  cuando existan; totales muestran fila «Impuesto (tasa%)» **solo cuando
  `tax_total > 0`** (así las facturas antiguas con `tax_total = 0.00` generan
  el PDF de siempre); la etiqueta «Total (sin impuestos en v1, §18.2)» pasa a
  «Total». Mismo builder para descarga de parte y para la cuenta limitada.
- **D7 — Excel contable**: la hoja de facturas gana las columnas «Subtotal»,
  «Tasa (%)» e «Impuesto» antes de «Total»; valores vacíos para facturas en
  borrador no incluidas (el export solo incluye emitidas/anuladas/pagadas,
  como hoy).
- **D8 — Semilla**: perfiles ficticios de Nevada para las empresas demo
  (p. ej. 8.375% Clark y 8.265% Washoe, IDs fiscales inventados) y una
  factura demo emitida con al menos un renglón no imponible para mostrar la
  diferencia. Nunca datos reales (convención de semilla).
- **D9 — Módulo**: sin módulos nuevos; cambios dentro de `billing/`,
  `companies/` y `prisma/`; sin dependencias nuevas (pdfmake/exceljs ya
  están justificados en `docs/stack.md`).

---

## 2. Modelo de datos

Convenciones idénticas a la Etapa 5 §2 (UUID, `timestamptz` UTC,
`company_id` tenant-scoped, `Decimal` para dinero, migraciones **solo
aditivas**, §1.1.8). Dinero en centavos enteros en cálculos (§12).

### 2.1 `companies` — perfil fiscal (§11.6)

| Campo | Tipo | Notas |
|---|---|---|
| tax_id | varchar(64) null | identificación fiscal del emisor (state business ID); ficticia en semilla |
| tax_address | text null | dirección fiscal; se muestra en el PDF |
| default_tax_rate | Decimal(5,3) null | tasa por defecto en % (0–100, ≤ 3 decimales, CHECK) |
| tax_exempt | boolean not null default false | si true, el impuesto es 0 sin importar tasas |

### 2.2 `invoices` — columnas fiscales (§11.6)

| Campo | Tipo | Notas |
|---|---|---|
| tax_rate | Decimal(5,3) null | tasa **aplicada**, congelada al emitir (override ?? default); null en borrador y en facturas antiguas |
| tax_total | Decimal(12,2) null | impuesto congelado al emitir; ≥ 0 (CHECK); null en borrador |

- `CHECK invoices_total_includes_tax`: `tax_total IS NULL OR total = subtotal + tax_total`.
- **Backfill**: `UPDATE invoices SET tax_total = 0.00 WHERE status <> 'draft'`
  (las facturas anteriores conservan sus importes con impuesto cero, §11.6).

### 2.3 `invoice_lines` — renglón imponible (§11.6)

| Campo | Tipo | Notas |
|---|---|---|
| taxable | boolean not null default **true** | T4: imponible por defecto; el emisor quita la marca si corresponde |

- Backfill de la migración: `default true` aplica a las filas existentes;
  como las facturas antiguas ya tienen `tax_total = 0.00` congelado, la marca
  retroactiva no altera ningún importe histórico (solo guía al emitir nuevos
  borradores).

### 2.4 Índices y constraints globales

- Sin índices nuevos (los cambios son por fila, no por búsqueda).
- `tax_exempt` es la única columna nueva sin null (default false).

---

## 3. Convenciones de la API

Se referencian `docs/especificacion/etapa-1.md` §3 y `etapa-5.md` §3 (RFC
7807, prefijo `/api/v1`, `CompanyAccessGuard`, dinero como string decimal ≤
2 decimales). Lo nuevo:

- **Tasas en la API**: string decimal con hasta 3 decimales y rango 0–100
  (`"8.375"`), validadas por helper `IsTaxRate` en `common/dto/` (patrón de
  `IsMoneyAmount`).
- **Impuesto en respuestas**: `taxRate` y `taxTotal` como string decimal o
  `null` (null en borrador; `taxTotal` nunca null una vez emitida).
- Renglones exponen `taxable: boolean`.

---

## 4. Endpoints

No hay rutas nuevas: la etapa extiende DTOs y respuestas existentes.

| Método | Ruta | Cambio | Permiso | Éxito / fallos |
|---|---|---|---|---|
| PATCH | `/companies/:id` | DTO acepta `taxId`, `taxAddress`, `defaultTaxRate`, `taxExempt` (todos opcionales); audit `company.tax_profile_updated` (D5) | **`owner`** (ya existente) | 200 / 401 / 403 / 404 / 422 |
| GET | `/companies/:id` | respuesta incluye el perfil fiscal completo (D5) | miembro activo | 200 / 404 |
| PATCH | `/companies/:id/invoices/:invId` | acepta `taxRate` opcional (override, D3); solo `draft` | emisor, solo `draft` (Etapa 5) | 200 / 403 / 404 / 409 / 422 |
| PUT | `/companies/:id/invoices/:invId/lines` | cada renglón acepta `taxable` opcional, **default true** (T4) | emisor, solo `draft` | 200 / 403 / 404 / 409 / 422 |
| POST | `/companies/:id/invoices/:invId/emit` | calcula y congela `tax_rate`/`tax_total`; `total = subtotal + tax_total` (D1/D2/D4); 422 si faltan datos (D2) | emisor, solo `draft` | 204 / 403 / 404 / 409 / 422 |
| GET | `/companies/:id/invoices/:invId` | respuesta incluye `taxRate`, `taxTotal`; renglones con `taxable` | parte | 200 / 404 |
| GET | `/companies/:id/invoices/:invId/pdf` | fila de impuesto y datos fiscales del emisor (D6) | parte; solo emitida/anulada | 200 / 404 / 409 |
| GET | `/companies/:id/accounting-exports?format=…` | hoja de facturas con columnas Subtotal/Tasa/Impuesto (D7) | miembro activo | 200 / 404 / 422 |
| GET | `/limited/:token/invoices/:invId` y `…/pdf` | mismos campos fiscales que ve una parte (D6) | token del destinatario | 200 / 401 / 404 / 409 |

---

## 5. Reglas de permisos (resumen normativo)

1. Toda operación verifica permiso en el servidor (§16.1); el tenant guard
   sigue siendo la única fuente de `company_id` (§16.2, §16.8); recurso ajeno
   → **404**.
2. El **perfil fiscal lo edita solo el `owner`** de la propia empresa (rol de
   máxima jerarquía, §11.6); un `member` recibe **403**; una empresa ajena
   → **404**.
3. El perfil fiscal **no es dato sensible**: cualquier miembro activo lo lee
   en el detalle de su empresa.
4. Las reglas de emisión, imutabilidad, pagos y visibilidad de facturas de
   la Etapa 5 §5 no cambian: emitir/editar es acción del emisor (destinatario
   → 403), anular solo `owner`, emitida inmutable → 409 (§11.5, §20.4).
5. Toda acción relevante queda en el audit log con actor y fecha (§12);
   los datos fiscales históricos de una factura emitida no se editan: el
   impuesto vive congelado en la factura (§11.6).
6. Las cuentas de acceso limitadas solo **leen** (detalle y PDF) con los
   mismos campos fiscales que una parte empresa; nada de edición (Etapa 5
   D13, §11.3).

---

## 6. Matriz de permisos como tests de integración (§16.1)

Tests con Testcontainers + PostgreSQL real (`test/etapa7.e2e-spec.ts`),
sobre la base de la Etapa 5. **Si un escenario falla, no se pasa de etapa.**

### 6.1 Perfil fiscal (#1–#5)

| # | Escenario | Esperado |
|---|---|---|
| 1 | `PATCH /companies/:id` con campos fiscales sin sesión | 401 |
| 2 | `member` de la propia empresa intenta editar el perfil fiscal | 403; `owner` → 200 + audit `company.tax_profile_updated` con before/after |
| 3 | Cualquier miembro activo lee el perfil fiscal en `GET /companies/:id` | 200 con los 4 campos |
| 4 | `PATCH` de perfil fiscal con `:id` de otra empresa | 404 (no filtra) |
| 5 | `defaultTaxRate` inválida (`"-1"`, `"100.001"`, `"abc"`) o `taxId` de más de 64 caracteres | 422 sin persistir nada |

### 6.2 Renglones y tasa del borrador (#6–#9)

| # | Escenario | Esperado |
|---|---|---|
| 6 | PUT de renglones **sin** `taxable` | 200 con `taxable: true` en todos (T4) |
| 7 | PUT de renglones mixtos (materiales imponibles, mano de obra no) | 200 con la marca persistida |
| 8 | PATCH `taxRate: "8.265"` sobre borrador propio | 200 con override; `taxRate: null` lo limpia |
| 9 | PATCH `taxRate` inválido (`"101"`, `"8.3756"`) o sobre factura emitida | 422 / 409 (§11.5) |

### 6.3 Emisión e impuesto (#10–#15)

| # | Escenario | Esperado |
|---|---|---|
| 10 | Emitir con líneas imponibles usando `default_tax_rate` del perfil (8.375%) | 204: `tax_rate` = «8.375», `tax_total` = half-up(base × 8.375%), `total = subtotal + tax_total`, audit `invoice.emitted` con `taxTotal` |
| 11 | Emitir con override en la factura (8.265%) y default distinto | 204 con la tasa del override congelada |
| 12 | Empresa `tax_exempt = true` con líneas imponibles | 204 con `tax_total` = «0.00» |
| 13 | Líneas imponibles sin ninguna tasa (sin override ni default, no exenta) | **422** con mensaje orientando a las tres salidas válidas (D2); la factura sigue `draft` |
| 14 | Sin líneas imponibles y sin tasa | 204 con `tax_total` = «0.00», `tax_rate` null |
| 15 | Factura emitida **antes** de la etapa (backfill `tax_total = 0.00`) | detalle 200 con «0.00»; PDF **sin** fila de impuesto (byte-idéntico salvo metadatos); emitida inmutable → PATCH → 409 |

### 6.4 PDF, export y cuenta limitada (#16–#20)

| # | Escenario | Esperado |
|---|---|---|
| 16 | PDF de factura con impuesto, como emisor y como destinatario | 200 `application/pdf` con fila «Impuesto (8.375%)», importe, «Total» (sin la etiqueta «sin impuestos en v1») y ID fiscal/dirección del emisor si existen |
| 17 | Excel contable propio | 200 xlsx con columnas Subtotal, Tasa (%), Impuesto en la hoja de facturas; audit `accounting.exported` |
| 18 | Cuenta limitada del cliente: detalle y PDF de su factura con impuesto | 200 con los mismos campos; factura de otro tenant → 404 (sin cambios de guard) |
| 19 | Tercera empresa lee el detalle o el PDF de una factura ajena con impuesto | 404 (§16.8, §11.3) |
| 20 | Emisión con redondeo: base «100.10» a 8.375% | 204 con `tax_total` = «8.38» (half-up); y base «0.05» a 8.375% → «0.00» (D1, unit test equivalente en `invoice-rules.spec.ts`) |

---

## 7. Eventos de audit log de la Etapa 7 (§12)

| `action` | `entity_type` | Cuándo / payload mínimo |
|---|---|---|
| `company.tax_profile_updated` | company | edición del perfil fiscal (before/after de los 4 campos; patrón `company.economic_settings_changed`) |
| `invoice.emitted` (ya existe) | invoice | payload ampliado con `taxTotal` y `taxRate` (§11.6) |

No hay acciones nuevas en facturas: el impuesto es parte de la emisión, que
ya se audita (§12).

---

## 8. Pruebas

- **Unitarias (Jest, `invoice-rules.spec.ts`)**: `taxCentsFor` — half-up en
  casos límite (`0.005`, `x.5`), rango y precisión de tasa (3 decimales,
  0–100), base 0, `tax_exempt`, resolución de tasa (override ?? default) y
  la regla 422 de D2. Sin `Float` en ningún cálculo (§12).
- **Integración (Testcontainers + Postgres)**: la matriz completa de §6
  contra la API real; el PDF se valida por texto extraído (fila de impuesto,
  ID fiscal, ausencia de «sin impuestos en v1») y el Excel por columnas con
  `exceljs`.
- **Contrato**: OpenAPI exportado y comparado por el gate local
  (`npm run openapi:update` + test de snapshot).

---

## 9. Definición de hecho (Etapa 7)

1. Perfil fiscal por empresa con edición `owner`-only y auditoría (§11.6).
2. Renglones con `taxable` (default imponible) y tasa ajustable por factura.
3. Emisión con cálculo half-up en centavos, congelado e inmutabilidad
   preservada (§11.5, §11.6); facturas antiguas intactas (impuesto 0.00).
4. PDF y Excel contable con impuesto y datos fiscales del emisor (§18.2).
5. Matriz de §6 (20 escenarios) verde en el gate local (`npm run check`).
6. Semilla con perfiles de Nevada ficticios y factura demo con impuesto.
7. CI en verde; OpenAPI y docs (`README.md`, `docs/plan.md`, `MEMORY.md`)
   actualizados.

---

## 10. Criterios de aceptación (Given/When/Then)

Cada criterio se implementa como test automatizado (§8). Toman la regla de
negocio de `proyect.md` por referencia (§x), no por copia.

- **AC-7.1** Dada una empresa, cuando su `owner` guarda el perfil fiscal,
  entonces 200, los 4 campos persisten y `company.tax_profile_updated` queda
  en el audit log con before/after (§11.6, §12); un `member` → 403 y una
  empresa ajena → 404.
- **AC-7.2** Dado un borrador, cuando se crean renglones sin indicar
  `taxable`, entonces nacen imponibles (T4); con la marca quitada, quedan no
  imponibles.
- **AC-7.3** Dado un borrador de una empresa con tasa por defecto 8.375% y
  líneas imponibles, cuando se emite, entonces 204, `tax_total` =
  redondeo_half_up(base × 8.375%) en centavos, `tax_rate` congelado y
  `total = subtotal + tax_total` (§11.6, D1/D4).
- **AC-7.4** Dado un borrador con `taxRate` propio (destination-based), cuando
  se emite, entonces la tasa congelada es la del override, no la del perfil
  (T5).
- **AC-7.5** Dada una empresa exenta, cuando emite con líneas imponibles,
  entonces `tax_total` = «0.00»; dada una empresa no exenta con líneas
  imponibles y sin ninguna tasa, cuando emite, entonces 422 y sigue en
  borrador (D2: nunca impuesto por silencio).
- **AC-7.6** Dada una factura emitida antes de la etapa, entonces su detalle
  y su PDF son idénticos a los de la Etapa 5 con `taxTotal` = «0.00» y sin
  fila de impuesto (§11.6: conserva sus importes).
- **AC-7.7** Dada una factura con impuesto, cuando cualquiera de las partes
  descarga el PDF, entonces 200 con fila «Impuesto (tasa%)», «Total» y los
  datos fiscales del emisor si están configurados (§11.6, §18.2); el
  destinatario no puede editar nada (403 en PATCH/PUT/emit).
- **AC-7.8** Dada una factura emitida, cuando se intenta cambiar `taxRate`,
  renglones o reemitirla, entonces 409 (§11.5: inmutable también en lo
  fiscal).
- **AC-7.9** Dada una empresa con facturas con y sin impuesto, cuando exporta
  el registro contable en Excel, entonces las columnas Subtotal, Tasa (%) e
  Impuesto reflejan cada factura y el export sigue auditado (§16.10).
- **AC-7.10** Dado el cliente con cuenta de acceso limitada, cuando consulta
  el detalle y el PDF de su factura con impuesto, entonces 200 con los
  mismos campos; una factura de otro tenant → 404 (§11.3, D13).
- **AC-7.11** Cada acción de §7 genera exactamente una entrada con actor y
  fecha correctos; no existen endpoints para editar datos fiscales de una
  factura emitida (§12, §1.1.8).

---

## 11. Casos excepcionales (comportamiento esperado)

| Caso | Comportamiento esperado |
|---|---|
| Redondeo half-up en el límite | `base_cents × rate_milli / 100_000` con redondeo comercial half-up; ejemplos fijos en unit tests (100.10 → 8.38 a 8.375%; 0.05 → 0.00) |
| Tasa con más de 3 decimales o fuera de 0–100 | 422 en DTO (perfil o override); nada se persiste |
| Empresa cambia su tasa de perfil después de emitir | Las facturas emitidas conservan su `tax_rate` congelado; el cambio solo afecta emisiones futuras (§11.6) |
| Empresa queda exenta después de emitir | Sin efecto retroactivo: las emitidas conservan su impuesto congelado (§11.5) |
| Líneas imponibles + empresa sin tasa + emitir | 422 con mensaje accionable; la factura permanece `draft` sin número ni totales (D2) |
| Factura antigua (backfill 0.00) + edición de renglones | 409: es emitida, inmutable; el `taxable` retroactivo de la migración no altera importes |
| Emisión concurrente (dos requests) | Sin cambios: lock de fila + contador; el cálculo de impuesto corre dentro de la misma transacción (Etapa 5 §11) |
| `tax_exempt` true pero con override de tasa en el borrador | Gana la exención: `tax_total` = 0.00 al emitir; el override queda congelado como `tax_rate` |
| Perfil fiscal con `tax_id`/dirección largos o vacíos | 422 > 64 caracteres; strings vacíos se normalizan a null |
| Datos sensibles (contraseñas, tokens) en el perfil fiscal o PDF | Nunca (§4.5, convención transversal); `tax_id` es registro público de negocio, no secreto |
