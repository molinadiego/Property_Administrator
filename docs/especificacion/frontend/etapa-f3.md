# Especificación técnica — Etapa F3 (frontend)

Etapa F3 del plan maestro (`frontend_plan.md`): **catálogos y acceso limitado**.
Construye sobre F0 (sesión, guards, selector de espacio, design system,
handler global de 401), F1 (cuentas, invitaciones, Miembros, patrón de
pantalla pública con token en URL) y F2 (portada, patrón de
queries/mutations por espacio) y consume los contratos backend de la Etapa 2
(`docs/especificacion/etapa-2.md` §2.2–§2.6, §4.1–§4.5), Etapa 4
(`docs/especificacion/etapa-4.md` §4.7), Etapa 5 (facturas a cliente propio,
D13) y el mapeo de estados BE-2 R5.

La spec **no redefine la API**: la consume tal como la documenta el contrato
`backend/openapi/openapi.json` y las specs backend citadas. Las reglas de
negocio se referencian por § a `proyect.md`, nunca se copian.

Base normativa: §1.1.8 (sin borrados destructivos), §2.3 (profesional
independiente y clientes propios), §2.4 (relaciones comerciales y espacios
separados), §4.1–§4.5 (propietario, propiedad, inquilino, acceso limitado,
datos sensibles), §5.1 (orden vinculada a propiedad; pedido de cuenta
limitada), §8.6 (política de emergencia), §11.3 (facturas privadas por
relación), §12 (dinero), §16.1, §16.8, §20.1 (estados de orden).

> **Aprobada por el dueño el 20/10/2026** (spec-driven, `AGENTS.md`),
> incluidas las decisiones F3-D1…F3-D7 — con aprobación expresa del cambio
> de contrato F3-D1 (Opción A) y F3-D2 (`GET /limited/{token}/properties`).
> Redactada el 20/10/2026.

---

## 1. Alcance

### 1.1 Entra / queda fuera

**Entra:**

- **Catálogos** en `/app/catalogs` (reemplaza el placeholder `ComingSoonStage`
  de F0) con sub-rutas:
  - **Propiedades**: lista, alta y detalle con edición de la ficha oficial
    (§4.1, §4.2, §4.4) y gestión de **inquilinos** (§4.3):
    `GET/POST /companies/{id}/properties`,
    `GET/PATCH /companies/{id}/properties/{propId}`,
    `POST /companies/{id}/properties/{propId}/tenants`,
    `PATCH /companies/{id}/tenants/{tenantId}`.
  - **Clientes propios** (solo espacios `own_business`, §2.3):
    `GET/POST /companies/{id}/clients`.
  - **Relaciones comerciales** (§2.4, Etapa 4 §4.7): lista, alta, edición de
    etiqueta/política de emergencia y cierre (`ended`):
    `GET/POST /companies/{id}/commercial-relations`,
    `PATCH /companies/{id}/commercial-relations/{relationId}`.
- **Portal de acceso limitado** en `/limited/:token` (público, sin sesión,
  §4.3): exactamente lo que la API limitada devuelve — «Mis órdenes»
  (`GET /limited/{token}/orders`), «Pedir trabajo»
  (`POST /limited/{token}/requests`) y «Facturas» del cliente propio
  (§11.3: `GET /limited/{token}/invoices`, detalle y PDF).
- **Cambios backend propuestos** (F3-D1 y F3-D2; aditivos, sin cambio de
  comportamiento sobre lo ya probado por los e2e de Etapa 2/4/5):
  1. **Opción A** (patrón aprobado F1-D3/F2-D5) sobre los DTOs de respuesta
     que F3 consume: `PropertyViewDto`, `PropertyDetailViewDto` (incluye
     `tenants`), `TenantViewDto`, `ClientViewDto`,
     `CommercialRelationViewDto`, `LimitedOrderViewDto`,
     `LimitedRequestViewDto` y los DTOs de factura limitada, con
     `@ApiResponse({type})`, regeneración de `openapi.json` y del cliente
     frontend, y test de contrato.
  2. **`GET /limited/{token}/properties`** (F3-D2): para token de vivienda,
     su propiedad; para token de cliente propio, las propiedades de **sus
     propias órdenes**. Cierra el hueco real del contrato: sin este
     endpoint, una cuenta de cliente propio **no puede armar un pedido
     válido** porque `CreateRequestDto.propertyId` es UUID y la superficie
     limitada no expone forma de conocerlo — el flujo de clientes de
     `POST /limited/{token}/requests` está sin exercitar hoy en los e2e
     backend (solo se prueba el token de vivienda de ana).
- Tests: unit de las pantallas y formularios (Vitest + Testing Library),
  unit de los DTOs backend, e2e Playwright de los flujos con API real.

**Queda fuera:**

- **Conversión de pedido a orden** (`…/convert`, §5.1, §20.1): es F4. El
  portal solo crea el pedido y lo muestra como «Borrador».
- **Detalle de orden en el portal**: la superficie limitada no lo expone
  (`GET /limited/{token}/orders` devuelve filas mínimas); no se simula.
- **Historial de propiedad** (`GET /companies/{id}/history/properties/{propId}`,
  F5).
- **Efecto de la política de emergencia en autorizaciones** (§8.6 runtime):
  F6. F3 solo configura los campos en la relación (F3-D7).
- **Ciclo de facturación** (crear/emitir/pagar/anular, §11, §20.4): F7. El
  portal solo **lee** facturas y su PDF (§11.3).
- **Borrados y ediciones inexistentes en la API** (F3-D6): no hay `DELETE`
  para propiedades, inquilinos ni clientes; el email y el `kind` de un
  inquilino no son editables (`UpdateTenantDto`); los clientes no tienen
  edición. La UI no inventa operaciones que el contrato no tiene.
- **Preferencias de portal / cambio de email de acceso limitado**: no existe
  endpoint; el token se entrega una vez por correo al crear la cuenta con
  email.
- Auditoría desde UI (F8), notificaciones del lado de la empresa sobre
  pedidos (ya llegan a la portada F2; su atención es F4).

### 1.2 Decisiones de diseño

| # | Decisión |
|---|---|
| **F3-D1** | **Opción A aplicada a catálogos y portal**: documentar en backend los DTOs de respuesta que F3 consume (propiedad, propiedad+inquilinos, inquilino, cliente, relación comercial, pedido/órdenes limitadas, factura limitada), con `@ApiResponse({type})`, regenerar `openapi.json` y el cliente frontend, y test de contrato — patrón F1-D3/F2-D5, ya aprobado en ese formato. Sin cambio de comportamiento. **Requiere aprobación** (código backend). |
| **F3-D2** | **`GET /limited/{token}/properties` (adición de contrato)**: para token de vivienda devuelve **su** propiedad (`id`, `addressLine`, `city`, `state`); para token de cliente propio devuelve **solo las propiedades de sus propias órdenes** (mismo alcance §4.3: nada de otras propiedades o relaciones). Sin órdenes aún → lista vacía y el portal muestra un aviso accionable en «Pedir trabajo» (el 422 del servidor sigue siendo la última palabra). Es la única forma de que un cliente propio pida un trabajo desde el portal sin exponer datos ajenos (§4.3, §16.8). **Requiere aprobación** (cambio de contrato). |
| **F3-D3** | **Navegación de Catálogos por sub-rutas con links locales** (`/app/catalogs/properties`, `/clients`, `/relations`), patrón Ajustes→Miembros de F1, sin dependencia nueva (no se agrega Tabs al design system). «Clientes» solo se muestra cuando `me.companyType === own_business`; «Relaciones» se muestra a todos los roles (lectura) y las acciones de escritura solo a `owner` — el servidor manda igual (§16.1). |
| **F3-D4** | **Detalle de propiedad en ruta propia** `/app/catalogs/properties/:propertyId`: ficha en modo lectura para cualquier miembro visible de la empresa; **edición solo para espacios `property_management`** (§4.4, matriz #16/#18 de Etapa 2). La sección **Inquilinos** (agregar/editar) la mantiene **cualquier miembro activo** (datos operativos, Etapa 2 §2.2): `kind` (Propietario/Inquilino), nombre, teléfonos, dirección, disponibilidad y **email opcional que entrega el token de acceso limitado** (§4.3); la respuesta informa `accessIssued` y la UI lo comunica. |
| **F3-D5** | **Portal público en `/limited/:token`**: token en la URL y no persistido, patrón de la invitación de F1. Pantalla única con «Mis órdenes» y «Pedir trabajo» siempre visibles; **«Facturas» (§11.3) solo se muestra cuando la lista trae ≥1 factura** — una cuenta de vivienda nunca tiene facturas y un título de sección permanente vacío confunde. Detalle de factura en `/limited/:token/invoices/:invoiceId` con descarga de PDF. **401 → pantalla de «enlace inválido o expirado»** (sin login, sin datos, sin reintentar sesión). |
| **F3-D6** | **Sin borrados destructivos en los catálogos** (§1.1.8): la API no expone `DELETE`; las relaciones comerciales se **cierran** (`ended: true`, dejan de admitir órdenes nuevas y **no se reabren**, §2.4 — la reapertura responde 422, Etapa 4); los inquilinos y clientes se editan/agregan pero no se borran desde la UI. |
| **F3-D7** | **Formulario de relación comercial completo** (espejo `CreateCommercialRelationDto`/`UpdateCommercialRelationDto`): contraparte **exactamente una** (empresa XOR cliente propio, §2.4), etiqueta opcional, y la **política de emergencia de la relación** (§8.6: `prior_authorization` / `resolve_without_authorization` / `emergency_amount`, con importe obligatorio en la última) se configura aquí porque vive en la relación; F6 consume su efecto en las autorizaciones. |

## 2. Pantallas y flujo

### 2.1 Catálogos (requiere sesión + espacio activo, F0)

| Ruta | Acceso | Contenido y estados |
|---|---|---|
| `/app/catalogs` | sesión + espacio | redirect a `/app/catalogs/properties`. |
| `/app/catalogs/properties` | sesión + espacio | Lista de propiedades del espacio activo: dirección (`addressLine`, ciudad/estado), badge de ocupación («Ocupada»/«Vacante», §4.2) y fecha. Botón «Nueva propiedad» (F3-D4: cualquier miembro activo). Estados: carga (skeleton), vacío («Aún no hay propiedades registradas»), error con reintento. Corte en 100 del servidor documentado con «100+» (patrón F2). |
| `/app/catalogs/properties/new` | sesión + espacio | Formulario de alta (§6) → 201 → navegación al detalle. |
| `/app/catalogs/properties/:propertyId` | sesión + espacio | **Ficha** (§4.1 propietario, §4.2 propiedad/comunidad/entrada/mascotas) en modo lectura; edición inline o por diálogo **solo si el espacio es `property_management`** (F3-D4), con nota «Solo la administradora de propiedades edita los datos oficiales (§4.4)» para el resto. **Sección Inquilinos**: filas (etiqueta Propietario/Inquilino, nombre, teléfonos), «Agregar inquilino» (diálogo del design system: kind, nombre, teléfonos, dirección, disponibilidad, email opcional con copy «Enviará un enlace de acceso por correo») y «Editar» por fila (`UpdateTenantDto`, sin email ni kind). Si la respuesta de alta trae `accessIssued: true`, la UI confirma «Enlace de acceso enviado por correo». |
| `/app/catalogs/clients` | solo `own_business` (D3) | Lista: nombre, email, teléfonos, fecha. Botón «Registrar cliente» (§2.3). Sin edición/borrado (D6). Estados carga/vacío/error. |
| `/app/catalogs/relations` | sesión + espacio (lectura) | Lista: etiqueta o contraparte (nombre de empresa / nombre de cliente), política de emergencia, estado («Activa»/«Cerrada»). «Nueva relación» y acciones por fila («Editar», «Cerrar relación») **solo para `owner`** (Etapa 4 decisión 7). Una relación cerrada no se reabre (§2.4). Estados carga/vacío/error. |

### 2.2 Portal de acceso limitado (público, sin sesión)

| Ruta | Contenido |
|---|---|
| `/limited/:token` | Pantalla propia (sin sidebar F0, patrón de la invitación F1): «Mis órdenes», «Pedir trabajo» y — solo si hay ≥1 factura (D5) — «Facturas» (§11.3). |
| `/limited/:token/invoices/:invoiceId` | Detalle de factura: encabezado (número, fechas, estado, totales, saldo), renglones y pagos según el contrato, y botón «Descargar PDF». |

Estructura del portal:

1. **Cabecera**: «Espacio de acceso limitado» (la superficie limitada no
   expone el nombre de la cuenta; no se inventa).
2. **Mis órdenes**: filas con título, badge de estado con las etiquetas del
   mapeo BE-2 R5 (§20.1) y fecha. El portal no muestra costos ni facturas
   de órdenes (§4.3): la fila es exactamente
   `{id, status, title, createdAt}`.
3. **Pedir trabajo**: formulario (§6) con título, descripción y selector de
   propiedad tomado de `GET /limited/{token}/properties` (F3-D2). Si la
   lista viene **vacía** (cliente propio sin órdenes), el formulario se
   reemplaza por el aviso «Tu profesional aún no tiene propiedades
   vinculadas a tu relación; comunícale tu pedido para que registre la
   orden». Éxito (201 `{id, title, status}`) → la fila aparece como
   «Borrador» en «Mis órdenes» (refetch); su conversión a orden real es
   de la empresa (F4, §5.1).
4. **Facturas** (solo si la lista trae ≥1, D5): filas con número, estado,
   total, saldo y vencimiento → enlace al detalle y PDF. Borradores y
   facturas de otras relaciones jamás aparecen (§11.3; lo decide el
   servidor).
5. **401** (token inválido, revocado o expirado): pantalla «Este enlace ya
   no es válido o expiró» con copy para pedir un enlace nuevo al
   profesional/empresa. **Nunca** redirige a `/login` (el portal no usa
   sesión; el handler global de 401 de F0 solo afecta a los guards de
   `/app`, que no rigen acá).

## 3. Vista de datos por rol

- **Todo lo que se lista y se edita lo decide el servidor** (§16.1, §3.4):
  la UI oculta acciones según `me.memberships[active]` (`companyType` y
  `role`), pero ninguna ocultación sustituye la verificación del backend.
- **Crear propiedad**: cualquier miembro activo, en **cualquier** tipo de
  empresa (Etapa 2 §2.2, matriz #15/#17: el contratista y el profesional
  también registran fichas para su trabajo).
- **Editar la ficha oficial**: solo espacios `property_management` (§4.4,
  matriz #16/#18). Un contratista/profesional que invocara `PATCH`
  recibe **403**; la UI ni siquiera ofrece el control.
- **Inquilinos**: cualquier miembro activo los agrega y edita (datos
  operativos de la vivienda, Etapa 2 §2.2).
- **Clientes propios**: solo espacios `own_business` (§2.3, matriz
  `own_business` #14/#15): la pestaña no se renderiza en otros tipos y
  `POST /clients` responde 403 fuera de ese tipo. `GET /clients` para otros
  tipos devuelve lista vacía (el servidor filtra por empresa).
- **Relaciones comerciales**: **lectura** para cualquier miembro activo
  (e2e #48 de Etapa 4: `GET` 200 para member); **alta y edición solo
  `owner`** (`@RequireRole('owner')`, decisión 7 de Etapa 4): un member que
  invocara `POST/PATCH` recibe **403** y la UI no le muestra las acciones.
- **Portal limitado**: el **token define el alcance** (vivienda o relación
  de cliente, §4.3) y el servidor responde 401/404 (§16.8). La UI no
  filtra ni descarta: dibuja exactamente lo que la API devuelve y nunca
  datos de otra propiedad o relación.
- **Datos sensibles** (§4.5): el código de acceso a la comunidad (§4.2) se
  muestra en la ficha como cualquier otro campo — la restricción la aplica
  el servidor decidiendo quién puede leer la ficha (solo miembros de la
  empresa dueña de la propiedad); no hay masking client-side (seguridad de
  teatro) ni envío a cuentas limitadas.

## 4. Consumo de la API

| Endpoint (contrato) | Pantalla | TanStack Query |
|---|---|---|
| `GET /companies/{id}/properties` | lista propiedades | `['company', id, 'properties']` |
| `POST /companies/{id}/properties` | alta | mutation → invalidar `['company', id, 'properties']` |
| `GET /companies/{id}/properties/{propertyId}` | detalle + inquilinos | `['company', id, 'properties', propertyId]` |
| `PATCH /companies/{id}/properties/{propertyId}` | editar ficha | mutation → invalidar lista + detalle |
| `POST /companies/{id}/properties/{propertyId}/tenants` | agregar inquilino | mutation → invalidar `['company', id, 'properties', propertyId]` |
| `PATCH /companies/{id}/tenants/{tenantId}` | editar inquilino | mutation → invalidar el detalle de su propiedad |
| `GET /companies/{id}/clients` | lista clientes | `['company', id, 'clients']` |
| `POST /companies/{id}/clients` | registrar cliente | mutation → invalidar `['company', id, 'clients']` |
| `GET /companies/{id}/commercial-relations` | lista relaciones | `['company', id, 'relations']` |
| `POST /companies/{id}/commercial-relations` | crear relación | mutation → invalidar `['company', id, 'relations']` |
| `PATCH /companies/{id}/commercial-relations/{relationId}` | editar/cerrar relación | mutation → invalidar `['company', id, 'relations']` |
| `GET /limited/{token}/properties` (F3-D2) | selector de propiedad del portal | `['limited', token, 'properties']` |
| `GET /limited/{token}/orders` | Mis órdenes | `['limited', token, 'orders']` |
| `POST /limited/{token}/requests` | Pedir trabajo | mutation → invalidar `['limited', token, 'orders']` |
| `GET /limited/{token}/invoices` | Facturas (§11.3) | `['limited', token, 'invoices']` |
| `GET /limited/{token}/invoices/{invoiceId}` | detalle de factura | `['limited', token, 'invoices', invoiceId]` |
| `GET /limited/{token}/invoices/{invoiceId}/pdf` | Descargar PDF | sin cache (blob en el momento de la descarga) |

Los tipos salen **solo** del cliente generado (F3-D1; aliases en
`src/api/types.ts`, patrón F0). Los query keys de catálogos usan la raíz
`['company', …]` de F0 (el cambio de espacio invalida las listas). Las
claves del portal llevan el token (`['limited', token, …]`): son ajenas al
espacio activo, no se invalidan al cambiar de espacio y no se escriben en
`localStorage` — el token vive en la URL (patrón invitación F1).

## 5. Interacciones y transiciones

- **Alta de propiedad**: formulario → `POST` (201) → navegación al detalle.
  Cualquier miembro activo; el tipo de empresa no restringe el alta (§5.1).
- **Edición de ficha** (solo `property_management`): PATCH con **solo los
  campos cambiados** (`UpdatePropertyDto` es un parche) → refetch de lista
  y detalle. 403 (si se invocara desde otro tipo de espacio) → banner de
  estado sin datos (matriz #16/#18).
- **Agregar inquilino**: diálogo → `POST …/tenants` (201
  `{id, name, email, accessIssued}`) → si `accessIssued`, copy «Enlace de
  acceso enviado por correo» (§4.3) → refetch del detalle. 409 (email ya
  registrado) → banner con el `detail`.
- **Editar inquilino**: fila → diálogo precargado → `PATCH /tenants/{id}`
  (200 `{id, name, phones}`) → refetch. El email y el `kind` no se
  editan (no existen en `UpdateTenantDto`, F3-D6).
- **Registrar cliente**: `POST /clients` (201; la respuesta confirma
  `accessIssued` si trajo email) → refetch. 409 email duplicado → banner.
- **Nueva relación** (owner): contraparte exclusiva (empresa **o** cliente
  propio) + etiqueta + política de emergencia → `POST` (201) → refetch.
  422 (ambas contrapartes / ninguna / importe ausente en
  `emergency_amount`), 409 (relación duplicada), 404 (contraparte
  inexistente): banner con `detail`.
- **Cerrar relación** (owner): confirmación («Cierra de admitir
  órdenes nuevas (§2.4)») → `PATCH {ended: true}` → la fila pasa a
  «Cerrada». Una relación cerrada **no se reabre**: el servidor
  responde 422 a `ended: false` (Etapa 4, §2.4) y la UI no ofrece la
  reapertura.
- **Pedir trabajo** (portal): `POST …/requests` (201) → refetch; la fila
  nueva muestra «Borrador» (§20.1, BE-2 R5). La conversión a orden real
  la hace la empresa (F4, §5.1): hasta entonces el estado no cambia.
- **Descargar PDF**: fetch del endpoint como blob → descarga con
  `URL.createObjectURL` y nombre `factura-{number}.pdf`.
- **Errores**: todo fallo RFC 7807 muestra su `detail` en banner con
  `aria-live` (F0-D4). 401 en catálogos → login con vuelta interna
  (F0-D2); 401 en el portal → pantalla de enlace inválido (§2.2.5).
- Ninguna acción escribe en la UI sin pasar por el servidor.

## 6. Validación de formularios

Espejo exacto de los DTOs; el servidor manda ante discrepancia (422 con
`detail` bajo el campo, F0-D4). Patrón: react-hook-form + zod (F0).

| Form | Reglas espejo (DTO backend) |
|---|---|
| **Crear/editar propiedad** | requeridos (solo al crear): `addressLine` 1–300, `city` 1–120, `state` 1–120; opcionales: `postalCode` ≤20, `occupancy` enum `occupied`/`vacant` (default `vacant`), `ownerName` ≤200, `ownerPhone` ≤50, `ownerEmail` ≤200, `ownerAddress` ≤300, `ownerCity` ≤120, `ownerState` ≤120, `ownerPostalCode` ≤20, `communityName` ≤200, `communityAccessCode` ≤50, `entryInstructions` ≤2000, `allowUnattendedEntry` boolean, `petsInfo` ≤1000, `otherInstructions` ≤2000 (`CreatePropertyDto`/`UpdatePropertyDto`). En edición todos opcionales y el PATCH solo lleva campos cambiados. |
| **Agregar inquilino** | requeridos: `kind` enum `owner`/`tenant`, `name` 1–200; opcionales: `phones` (hasta 5, cada uno ≤50), `address` ≤300, `availability` ≤500, `email` ≤200 (`CreatePropertyTenantDto`). Sin email no se entrega acceso (§4.3). |
| **Editar inquilino** | `name` 1–200; `phones` ≤5 × ≤50; `address` ≤300; `availability` ≤500 (`UpdateTenantDto`); sin `kind` ni `email`. |
| **Registrar cliente** | requerido: `name` 1–200; opcionales: `email` ≤200, `phones` ≤5 × ≤50, `address` ≤300, `availability` ≤500 (`CreateClientDto`). |
| **Nueva/editar relación** | contraparte **exactamente una**: `counterpartyCompanyId` (UUID) **o** `clientRelationshipId` (UUID) — exclusivos (§2.4); `label` ≤120; `emergencyPolicy` enum `prior_authorization`/`resolve_without_authorization`/`emergency_amount`; `emergencyExtraAmount` string de importe (§12, sin Float) **obligatoria** si la política es `emergency_amount` (el servidor responde 422 si falta, §8.6). `ended` boolean solo en edición (`CreateCommercialRelationDto`/`UpdateCommercialRelationDto`). |
| **Pedir trabajo (portal)** | requeridos: `title` 1–300, `description` 1–5000; `propertyId` (UUID) tomado del selector cuando `GET /limited/{token}/properties` trae filas (`CreateRequestDto`). Con lista vacía no hay selector: el portal muestra el aviso de F3-D2 y no ofrece enviar. |

## 7. Criterios de aceptación

- **AC-F3.1** Dado un espacio activo, cuando se abre
  `/app/catalogs/properties`, entonces la lista muestra las propiedades del
  espacio activo con su badge de ocupación; vacío y error tienen copy
  propio y reintento.
- **AC-F3.2** Cuando cualquier miembro activo (owner o member, en un
  espacio `property_management`, de contratista o propio) crea una
  propiedad con los tres campos requeridos, entonces 201 y la navegación
  lleva al detalle con la ficha completa.
- **AC-F3.3** Dado un espacio **no** `property_management` (p. ej. el de
  carla), entonces la ficha es de solo lectura con la nota de §4.4 y la UI
  no ofrece edición; invocado `PATCH` vía API, responde 403 (matriz
  #16/#18) y la pantalla no muestra datos.
- **AC-F3.4** Cuando un miembro agrega un inquilino con email, entonces
  201 con `accessIssued`, la UI confirma el envío del enlace y el correo
  (outbox de dev/CI, patrón F1) contiene el enlace `/limited/<token>`;
  editarlo solo cambia nombre/teléfonos/dirección/disponibilidad.
- **AC-F3.5** Cuando el espacio activo es `own_business` (Taller Carla),
  entonces la sección «Clientes» es visible y se puede registrar un
  cliente con email (token entregado); en un espacio `property_management`
  la sección no se renderiza y `POST /clients` responde 403.
- **AC-F3.6** Cuando el usuario es `owner` (ana en Gestión Demo), entonces
  ve «Nueva relación», «Editar» y «Cerrar relación»; siendo `member` (bob),
  ve la lista sin acciones y `POST/PATCH` vía API responden 403 (Etapa 4
  decisión 7); crear una relación Gestión Demo ↔ Taller Carla con
  contraparte única produce 201 y con ambas contrapartes, 422.
- **AC-F3.7** Dado el token de ana (vivienda), cuando abre
  `/limited/:token`, entonces «Mis órdenes» lista **exactamente**
  `{id, status, title, createdAt}` de las órdenes de su vivienda (§4.3),
  con las etiquetas de estado BE-2 R5, y no hay sección de Facturas si la
  lista trae vacío (D5).
- **AC-F3.8** Cuando una cuenta de vivienda envía un pedido válido, entonces
  201, la fila aparece como «Borrador» y la empresa la ve después como
  orden `requested` (F4 la convertirá, §5.1); el portal no ofrece acciones
  sobre la orden (no existen en la superficie limitada).
- **AC-F3.9** Dado el token de un cliente propio: con propiedades en su
  lista (F3-D2) el formulario de pedido las ofrece y el envío produce 201;
  sin propiedades aún, el portal muestra el aviso de F3-D2 y no hay
  selector — y si se invocara `POST …/requests` sin propiedad, el servidor
  responde 422 con su `detail` (nunca un pedido sin propiedad, §5.1).
- **AC-F3.10** Dado el token de un cliente con facturas enviadas (§11.3),
  entonces la sección «Facturas» lista las suyas (sin borradores), el
  detalle muestra totales/saldo y el PDF se descarga; una factura de otro
  tenant o un borrador responden 404 y jamás aparecen en la lista.
- **AC-F3.11** Cuando el token es inválido, revocado o expirado, entonces
  el portal muestra la pantalla de «enlace inválido o expirado» sin datos,
  sin login y sin redirigir a `/login`.
- **AC-F3.12** Cuando las pantallas se ven en 360 px, entonces listas,
  fichas y diálogos quedan apilados sin scroll horizontal; todos los
  controles son alcanzables por teclado con foco visible, los formularios
  tienen labels asociados y los diálogos usan focus trap/Escape (design
  system F0).
- **AC-F3.13** Cuando el contrato se regenera (F3-D1/F3-D2), entonces el
  cliente trae los tipos de las respuestas de catálogos y el nuevo
  `GET /limited/{token}/properties` — el typecheck compila sin tipos de
  API escritos a mano (stack §6).

## 8. Pruebas

- **Unit frontend (Vitest + Testing Library):**
  - Lista de propiedades: filas, badge de ocupación, vacío y error con
    reintento (AC-F3.1).
  - Alta de propiedad: validación espejo (3 requeridos, longitudes) y POST
    con solo los campos tocados (AC-F3.2).
  - Ficha: modo solo lectura con nota §4.4 para espacio no
    `property_management`; edición visible solo para `property_management`
    (AC-F3.3).
  - Inquilinos: diálogo con kind/nombre requeridos, email opcional con copy
    de acceso, `accessIssued` confirmado, 409 en banner, edición sin
    email/kind (AC-F3.4).
  - Clientes: sección visible solo con `own_business` en `me`; alta con
    validación espejo (AC-F3.5).
  - Relaciones: contraparte exclusiva (los dos controles nunca envían
    ambos), importe obligatorio en `emergency_amount`, acciones de
    escritura solo para `owner`, cierre con confirmación (AC-F3.6).
  - Portal: filas mínimas con etiquetas de estado, aviso con lista de
    propiedades vacía, refetch tras el pedido, sección Facturas oculta con
    lista vacía, pantalla de enlace inválido con 401 (AC-F3.7–AC-F3.11).
- **Unit backend:** serialización de los DTOs de respuesta nuevos (incluye
  `tenants` en el detalle y `accessIssued` en altas), alcance del nuevo
  `GET /limited/{token}/properties` (vivienda vs. cliente, y `[]` sin
  órdenes) y snapshot de OpenAPI actualizado (contrato).
- **e2e Playwright (API real, sin mocks del permiso):**
  1. **Propiedades e inquilino (Gestión Demo)**: ana crea una propiedad
     única por corrida vía UI → detalle → agrega un inquilino con email
     único → el outbox contiene el enlace `/limited/<token>` (patrón F1) →
     con ese token el portal lista las órdenes de su vivienda (§4.3) y
     envía un pedido que aparece como «Borrador».
  2. **Permisos de ficha**: carla (Taller Carla, `own_business`) crea una
     propiedad pero la ficha no ofrece edición; `PATCH` vía API → 403.
  3. **Cliente propio extremo a extremo**: carla registra un cliente con
     email (token) → portal del cliente sin propiedades muestra el aviso →
     carla crea una orden para ese cliente vía API (patrón de los e2e de
     Etapa 5) → al refrescar el portal la propiedad aparece en el
     formulario → el pedido produce 201 y la fila «Borrador».
  4. **Relaciones**: ana crea una relación por UI con una contraparte
     **única por corrida** (el par de la relación es único por
     contraparte y los proyectos de viewport corren en paralelo: un
     espacio nuevo por corrida evita el 409 entre ellos) → fila visible
     y cierre («Cerrada», sin reapertura §2.4); bob ve la lista
     sin acciones y su `POST` vía API → 403.
  5. **Facturas del portal (§11.3)**: siguiendo el patrón de los e2e de
     Etapa 5, se crea y emite una factura al cliente (única por corrida) →
     el portal muestra la sección con la factura, el detalle y la
     descarga del PDF; un borrador no aparece y una factura ajena da 404.
  6. **Token inválido**: `/limited/no-existe` muestra la pantalla de
     enlace inválido (401) sin login.
  - Local con Chrome (F0-D5): si el backend no está arriba, los e2e se
    saltan como el resto; el gate local siempre es lint + typecheck + unit.
- Contrato: `npm run openapi:update` (backend) + `npm run openapi:generate`
  (frontend) tras F3-D1/F3-D2; el typecheck falla si el cliente quedó viejo.

## 9. Accesibilidad y responsive

- Mobile-first (360 → 768 → 1280), patrón F0/F1/F2: listas apiladas en
  móvil, dos columnas de ficha+inquilinos desde tablet.
- Semántica de lista (`ul`/`li`) en propiedades, inquilinos, clientes,
  relaciones, órdenes y facturas del portal; jerarquía `h1`/`h2` correcta;
  badges de estado y ocupación con texto, no solo color (contraste AA,
  tokens F0).
- Formularios con `label` asociado, `fieldset`/`legend` para los grupos de
  propietario/comunidad y para la contraparte exclusiva de relaciones;
  errores junto al campo con `aria-describedby` y resumen en banner
  `aria-live` (F0-D4).
- Diálogos del design system (focus trap, Escape): agregar/editar
  inquilino, editar relación, cerrar relación.
- El portal es usable solo con teclado y su pantalla de enlace inválido
  explica la salida sin bloquear (cómo cerrar la pestaña / volver).

## 10. Definición de hecho

- Criterio de salida de `frontend_plan.md` F3: **el portal limitado ve
  exactamente lo que la spec backend permite (401/404 consistentes con la
  API); CRUD completo con estados de carga/vacío/error** — con la aclaración
  documentada de F3-D6: el contrato no expone operaciones de borrado ni
  edición de email/kind de inquilino ni edición de cliente, y la UI no las
  inventa (§1.1.8).
- F3-D1 y F3-D2 entregados con test y contrato regenerado.
- Gate `cd frontend && npm run check` verde en local (lint + typecheck +
  unit) y gate backend verde si se toca su código; CI verde (3 jobs).

## 11. Casos excepcionales

- **Email duplicado al agregar inquilino o cliente** (409): banner con el
  `detail` del servidor; el diálogo se mantiene abierto para corregir.
- **Ficha editada en empresa no `property_management`** (403): la UI no
  ofrece el control; si la llamada se invoca a mano, banner de estado sin
  datos (matriz #16/#18).
- **Cliente propio sin propiedades** (F3-D2): aviso accionable en «Pedir
  trabajo»; un envío invocado a mano recibe el 422 del servidor («si aún no
  existe, el profesional debe registrarla primero») y se muestra tal cual.
- **Token inválido, revocado o expirado** (401): pantalla de enlace
  inválido en **todas** las rutas del portal; nunca `/login` (el handler
  global de 401 de F0 solo redirige tras el guard de `/app`).
- **Factura borrador o de otra relación** (404 / ausente de la lista):
  §11.3; el portal no las lista ni las muestra y el detalle de una
  invocada a mano responde 404 sin datos (§16.8).
- **Relación con ambas contrapartes o ninguna** (422), **duplicada** (409)
  o **contraparte inexistente** (404): banner con `detail`; la UI ya
  previene el caso con controles exclusivos, pero el servidor manda.
- **`emergency_amount` sin importe** (422): el formulario exige el importe
  (espejo §8.6) y el banner respeta al servidor si se invoca a mano.
- **Más de 100 propiedades o clientes**: el backend corta en 100 (take de
  Etapa 2); la lista muestra «100+» (patrón F2), sin paginación en F3.
- **Cambio de espacio con catálogos abiertos**: invalidación F0 por prefijo
  `['company', …]`; las listas se recargan del espacio nuevo.
- **Sesión expirada en catálogos**: 401 global → `/login` con vuelta
  interna (F0-D2); el portal es ajeno a la sesión.
- **URL del portal compartida**: el token **es** la credencial (mismo
  modelo que la invitación de F1); no se persiste en storage y la UI no
  agrega capas de seguridad que el contrato no define.
- **Código de acceso a la comunidad en la ficha** (§4.2, §4.5): se muestra
  a los miembros de la empresa dueña porque el servidor así lo entrega; no
  se envía jamás al portal limitado.
- **Inquilino sin email**: sin `accessIssued`; no hay enlace de acceso y la
  UI no promete uno (§4.3: la cuenta limitada es opcional).
- **Doble submit** en cualquier alta/edición: botón deshabilitado mientras
  está pendiente; un segundo POST repetido sería 409 del servidor.
- **Red caída**: error local con reintento por sección (patrón F2); el
  portal no degrada a pantalla de login.
