# Especificación técnica — Etapa F4 (frontend)

Etapa F4 del plan maestro (`frontend_plan.md`): **órdenes y trabajos**.
Construye sobre F0 (sesión, guards, selector de espacio, design system,
handler global de 401), F1 (miembros, patrón de diálogos y formularios),
F2 (portada, filtros BE-1, tarjetas, notificaciones in-app) y F3 (catálogos,
portal limitado) y consume los contratos backend de la Etapa 2
(`docs/especificacion/etapa-2.md` §2.2–§2.6, §4.1–§4.5), Etapa 3
(`docs/especificacion/etapa-3.md` §4.1, máquina §20.2), Etapa 5
(conversión de pedidos, `POST …/orders/{orderId}/convert`), BE-1
(`docs/especificacion/be-1-filtros-ordenes.md`) y el mapeo de estados
BE-2 R5.

La spec **no redefine la API**: la consume tal como la documenta el
contrato `backend/openapi/openapi.json` y las specs backend citadas. Las
reglas de negocio se referencian por § a `proyect.md`, nunca se copian.

Base normativa: §2.1–§2.3 (permisos por tipo de participante), §4.5
(datos sensibles de acceso), §5.1 (orden vinculada a propiedad), §5.2
(destino de la orden), §5.5 (órdenes compuestas), §5.6 (aceptación y
rechazo; enmienda 17/10/2026), §5.7 (reasignaciones), §5.8 (información
de acceso de la orden), §6.1–§6.4 (seguimiento, incompleto, no
concretado, cierre), §14.2 (urgente), §16.1 (permisos verificados en
servidor), §20.1–§20.3 (máquinas de orden, trabajo y asignación).

> **Aprobada por el dueño el 20/10/2026** (spec-driven, `AGENTS.md`):
> el dueño aprobó la etapa F4 por adelantado («aprobado») antes de la
> publicación de esta spec; las decisiones F4-D1…F4-D7 se presentan
> junto con ella y sus huecos en §11 están reportados, no resueltos en
> silencio. Redactada el 20/10/2026.

---

## 1. Alcance

**Entra**

- `/app/orders`: lista de órdenes del espacio activo con los filtros de
  BE-1 (`status`, `assignment_status=pending`) y enlace al detalle.
- `/app/orders/new`: creación de orden vinculada a propiedad (§5.1) con
  título, descripción, urgencia (§14.2), datos de acceso de visita (§5.8)
  y cliente propio (solo espacios `own_business`).
- `/app/orders/:orderId`: detalle con trabajos y asignaciones (§5.5,
  §20.2, §20.3), datos de acceso cuando el servidor los envía (§4.5,
  §5.8), edición de instrucciones/acceso (PATCH) y **todas las
  transiciones válidas** de la máquina §20 en la UI: asignar, aceptar,
  rechazar, reasignar, revocar, iniciar, registrar avance, completar,
  incompleto, reanudar, no pudo concretarse, convertir pedido (§20.1),
  cancelar con motivo y cerrar (§6.4).
- Integración con F2: el tile «Crear orden» de la portada navega a
  `/app/orders/new` (F2-D7); las tarjetas de la portada y las
  notificaciones de tipo `order`/`assignment` navegan al detalle (F2-D6).
- Adición backend aprobada (F4-D1, patrón Opción A ya aprobado en
  F2-D5/F3-D1): response DTOs para las respuestas de órdenes que hoy no
  tienen schema en OpenAPI (detalle, create, convert, addJob, assign,
  reassign, progress). Solo documentación: sin cambio de comportamiento;
  obligatoria para que el cliente generado tipado exista sin escribir
  tipos a mano (`frontend/AGENTS.md`).

**Fuera de alcance**

- Archivos/fotos y evidencias (F5); historial y `/me/job-history` (F5).
- Costos, reportes de costo, autorizaciones, política económica de la
  orden y resumen económico (F6). El detalle de F4 **no muestra** montos
  ni límites.
- Facturas y pagos (F7); garantías (F8).
- Proceso de presupuesto (§5.4): no existe entidad «presupuesto» en el
  sistema; F4 no la inventa.
- Referencia a la orden sucesora (`parentOrderId`): ver F4-D7/§11 — no
  exprimible por API, fuera del alcance de F4.
- Paginación del listado: el servidor devuelve hasta 100 órdenes (BE-1
  §1.1); F4 no agrega paginación.

## 2. Pantallas y flujo

### 2.1 `/app/orders` — lista (reemplaza el placeholder F4)

Dentro del shell (`AppShell`, sidebar/bottom-nav ya enlazan la ruta).
Página con: título «Órdenes», botón «Nueva orden» (→ `/app/orders/new`),
filtros y lista.

- **Filtros (BE-1, server-side)**: chips de estado «Todas / Borrador /
  Enviada / En curso / Cerrada / Cancelada» (etiquetas BE-2 R5) que
  envían `status=<valor>`; un toggle «Mis pendientes de aceptar» que
  envía `assignment_status=pending`. Ambos se pueden combinar (AND, BE-1
  §5). El estado del filtro vive en la query string (`?status=…`,
  `?mine=pending`) para que sea navegable/compartible.
- **Filas** (`ul`/`li`, un `<Link>` por orden al detalle): título,
  badge de estado, badge «Urgente» (§14.2) si `urgent`, fecha de creación
  y **dirección de la propiedad resuelta del cache de
  `GET /companies/{id}/properties` del espacio activo** (join por
  `propertyId`); si la orden es ajena (solo visible por asignación) la
  dirección no se resuelve y la fila no la muestra (F4-D2).
- **Nota de límite**: con 100 filas se muestra «Se muestran las 100
  órdenes más recientes» (el servidor limita a 100, BE-1 §1.1).
- **Estados**: skeleton de filas (carga), EmptyBox (sin órdenes en el
  espacio), EmptyBox distinto cuando el filtro no da resultados (con
  acción «Limpiar filtros»), ErrorBanner + «Reintentar» (error).
- **Responsive**: en 360 la fila se apila (badge+urgente sobre título,
  propiedad debajo); a 768+ fila en dos columnas (info / fecha).

### 2.2 `/app/orders/new` — creación (§5.1)

Formulario en un Card (patrón F3): «Propiedad» (Select con las
propiedades del espacio activo, requerida), «Título» (1–300),
«Descripción» (1–5000, requerida), checkbox «Urgente» (§14.2),
fieldset «Datos de acceso de la visita (§5.8)»: lockbox (≤50), código de
comunidad (≤50), instrucciones de entrada (≤2000) — los tres opcionales
y marcados como sensibles —, y Select «Cliente propio (opcional)» solo
para espacios `own_business` (opciones = relaciones activas de
`GET /companies/{id}/clients`). Botón «Crear orden» → 201 → navega al
detalle. Errores: 422 (detail del RFC 7807 en banner), 404 (propiedad o
cliente inexistente en el espacio), 409 (`clientRelationshipId` fuera de
`own_business`).

Sin campos económicos (spendingLimit/margin*/commercialRelationId: F6).

### 2.3 `/app/orders/:orderId` — detalle

Una sola página con estas secciones (todas dentro de `role="region"`
scopadas):

1. **Cabecera**: `h1` con el título; badges de estado (BE-2 R5) y
   «Urgente»; badge de origen (`management`/`contractor`/`own_business`
   → textos «Administradora»/«Contratista»/«Negocio propio»); dirección
   de la propiedad (join del cache del espacio propio; si no resuelve,
   se omite); descripción; fechas de creación, cierre y cancelación con
   motivo cuando existan.
2. **Acciones globales** (según máquina §20.1 + pertenencia, F4-D5):
   - «Convertir y enviar» (solo si `status=requested` y mi empresa es la
     dueña; §20.1 Borrador→Enviada, convierte el pedido del portal F3).
   - «Editar instrucciones» (abre diálogo con el espejo de
     `UpdateOrderDto`: título, descripción, acceso×3, urgente — este
     último solo visible si mi empresa es la dueña).
   - «Cancelar orden» (dueña, `open` y sin ningún trabajo iniciado; con
     diálogo de confirmación + motivo requerido ≤2000, §20.1).
   - «Cerrar orden» (dueña, `open`/`in_progress` con ≥1 trabajo y todos
     en `done`/`not_realized`; diálogo de confirmación, §6.4).
3. **Acceso de la visita** (§4.5/§5.8): dl con lockbox / código de
   comunidad / instrucciones; **solo se renderiza si `access ≠ null`**
   (el servidor decide: dueña o asignado con asignación activa en el
   detalle). Nunca se pide por API si el server lo omitió.
4. **Trabajos** (§5.5): una tarjeta por job (`sortOrder`): título,
   descripción, badge de estado del trabajo (§20.2: «Pendiente»,
   «Aceptado», «En curso», «Incompleto», «Completado», «No pudo
   concretarse»), su asignación actual y el **historial de asignaciones**
   (§5.7: cada fila con estado Propuesta/Aceptada/Rechazada/Revocada,
   fecha y motivo de rechazo si existe; los nombres se resuelven del
   cache de miembros del espacio propio y de mis propias membresías;
   una membresía externa se muestra como «Asignado externo», ver §11).
   Acciones por trabajo:
   - Si **soy el asignado** con asignación `pending`: «Aceptar» y
     «Rechazar» (diálogo con motivo opcional ≤1000, §5.6).
   - Si **soy el asignado** con asignación `accepted`: «Iniciar»,
     «Registrar avance» (mensaje requerido ≤2000, §6.1), «Completar»
     (resultado opcional ≤2000, §6.1), «Informar incompleto» (motivo
     requerido ≤2000, §6.2).
     > **Nota (aprobada 20/10/2026, AC-F4.4/AC-F4.6)**: el mensaje de
     > avance y los motivos de incompleto/no-realizado se **registran**
     > en `job_events` (§6.1–§6.3); F4 los valida por el `201`/`204`
     > del endpoint y la ausencia de banner, y su lectura en pantalla
     > llega con el historial de **F5** (§7 «Fuera de alcance»).
     > `OrderViewDto` no expone `events`: el detalle no los pinta en F4.
   - Si **mi empresa es la dueña**: «Asignar» (diálogo con Select de
     membresías activas del espacio y de las mías — el contrato admite
     cualquier membresía activa —), «Reasignar» (mismo diálogo sobre la
     asignación activa; §5.7), «Revocar» (§20.3), «Reanudar» (sobre
     `incomplete` con asignación `accepted`, §20.2), «No pudo
     concretarse» (motivo requerido ≤2000, §6.3; diálogo).
   - «Agregar trabajo» (dueña): diálogo con título+descripción
     (AddJobDto) para la orden compuesta (§5.5).
5. **Estados de la página**: skeleton (carga), ErrorBanner+retry
   (error), pantalla de «Orden no encontrada o sin acceso» (404: orden
   ajena sin asignación activa, asignación perdida, o inexistente — sin
   datos ajenos).

**Responsive**: en 360 todo apilado (acciones como lista de botones
full-width dentro de cada tarjeta); ≥768 la cabecera pasa a dos
columnas y las acciones se alinean a la derecha.

### 2.4 Integración con F2

- Portada: las tarjetas de órdenes abiertas enlazan a
  `/app/orders/:orderId`; el tile «Crear orden» (visible para cualquier
  miembro activo) navega a `/app/orders/new`.
- Notificaciones (F2-D6): `entityType='order'` → `/app/orders/{entityId}`;
  `entityType='assignment'` → se resuelve la orden escaneando las
  órdenes cargadas del espacio (`jobs[].assignments[].id`) y se enlaza
  al detalle; si no está en el conjunto cargado, el ítem no es
  clickeable (el `link` del servidor sigue siendo `null`; no existe
  `GET /assignments/{id}` — §11).

## 3. Vista de datos por rol

La regla de visibilidad la aplica el servidor (§16.1); la UI solo
refleja lo que llega y **nunca** la sustituye.

| Quién | Qué recibe y ve | Acciones que la UI ofrece |
|---|---|---|
| Miembro activo de la empresa **dueña** de la orden (cualquier rol: owner o member — el contrato no distingue) | Toda la orden: todos los trabajos, todas las asignaciones, `access` real | Todas las de dueña (convertir, editar, asignar, reasignar, revocar, reanudar, no pudo concretarse, agregar trabajo, cancelar, cerrar) + las de asignado si además tiene asignación |
| Miembro de **otra empresa** con asignación `pending`/`accepted` en la orden (contratista gestor o profesional, §2.1–§2.3) | Solo **sus** trabajos y dentro de ellos sus asignaciones; `access` solo en el detalle (asignación activa); en la lista `access: null` | Solo las de asignado (aceptar/rechazar si `pending`; iniciar/avance/completar/incompleto si `accepted`) + editar instrucciones si gestiona la orden (PATCH permite a la empresa del asignado activo) |
| Miembro de otra empresa **sin** asignación activa | 404 (pantalla «no encontrada o sin acceso»); tras rechazar/revocar, la orden desaparece para él (§2.12) | Ninguna |
| Cuenta con acceso limitado (portal F3) | No navega `/app/*` (guard de sesión); sus pedidos aparecen como órdenes `requested` para la empresa dueña | Ninguna (usa el portal) |

Notas: `urgent` solo lo edita la empresa dueña (servidor 403 para la
empresa externa gestora, aunque el PATCH la permita para los demás
campos). Los nombres de asignados externos no existen en el contrato
(§11): la fila de asignación muestra «Asignado externo» sin exponer el
id.

## 4. Consumo de la API

Todas las rutas bajo `/api/v1`; el cliente se **genera** desde
`openapi.json` (F4-D1 tipa las respuestas hoy sin schema). Invalidación
por espacio activo con el patrón F2/F3 (`queryKeys` + `invalidate` tras
cada mutación que afecta a la orden).

| Endpoint | Pantalla/uso | Query key / invalidación |
|---|---|---|
| `GET /companies/{id}/orders?status&assignment_status` | Lista (filtros BE-1) | `['orders', activeId, {status, mine}]`; al mutar una orden: invalidar `['orders', activeId]` |
| `POST /companies/{id}/orders` | `/app/orders/new` | invalida `['orders', activeId]` |
| `GET /companies/{id}/orders/{orderId}` | Detalle | `['order', activeId, orderId]`; invalidada por cada transición |
| `PATCH /companies/{id}/orders/{orderId}` | Diálogo «Editar instrucciones» (incluye `urgent`) | invalida lista + detalle |
| `POST …/orders/{orderId}/convert` | «Convertir y enviar» (solo `requested`) | invalida lista + detalle |
| `POST …/orders/{orderId}/jobs` | «Agregar trabajo» | invalida detalle |
| `POST …/orders/{orderId}/assignments` | «Asignar»/«Reasignar» (reassign: `jobId` requerido por DTO pero lo toma de la asignación previa) | invalida detalle |
| `POST …/assignments/{assignId}/accept` / `…/reject` | Acciones del asignado | invalida detalle + lista (cambia `assignment_status`) |
| `POST …/assignments/{assignId}/reassign` / `…/revoke` | Acciones de dueña | invalida detalle |
| `POST …/jobs/{jobId}/start` / `progress` / `complete` / `incomplete` | Acciones del asignado | invalida detalle + lista (cambia el estado de la orden) |
| `POST …/jobs/{jobId}/resume` / `not-realized` | Acciones de dueña | invalida detalle + lista |
| `POST …/orders/{orderId}/close` / `cancel` | Acciones de dueña | invalida detalle + lista |
| `GET /companies/{id}/properties` | Select de propiedad (new), join de dirección en lista/detalle (cache F3) | `['properties', activeId]` (sin invalidar) |
| `GET /companies/{id}/clients` | Select de cliente propio (new), solo `own_business` | `['clients', activeId]` |
| `GET /companies/{id}/members` | Select de asignado (Asignar/Reasignar) y resolución de nombres en el historial | `['members', activeId]` (F1) |
| `GET /notifications` + `POST /notifications/{id}/read` | Navegación desde F2 (F4-D6) | ya gestionadas por F2 |

## 5. Interacciones y transiciones

La UI **solo ofrece** las transiciones válidas para el estado y la
relación con la orden (§20, F4-D5); la matriz se implementa como función
pura `allowedOrderActions(order, ctx)` testeable y el servidor vuelve a
validar todo (§16.1). Ante un 409/403/404 de la API (carrera con otro
usuario), la UI muestra el `detail` RFC 7807 en un banner `aria-live` y
**refresca** el detalle para que los botones se recalculen.

| Acción | Quién la ve (UI) | Estado requerido (máquina) | Endpoint y errores del servidor que se muestran |
|---|---|---|---|
| Aceptar / Rechazar (con motivo opcional ≤1000) | Asignado, asignación `pending` | job `pending`/`incomplete` | `accept`/`reject`; 409 si ya respondió (refetch); 403 si la membresía no está en este espacio |
| Iniciar | Asignado `accepted` | job `accepted` | `start`; 409 si la transición ya ocurrió |
| Registrar avance (mensaje ≤2000) | Asignado `accepted` | job no terminal | `progress`; 422 (vacío/largo), 409 (terminal) |
| Completar (resultado opcional ≤2000) | Asignado `accepted` | job `in_progress` | `complete`; 409 «Solo un trabajo en curso puede completarse.» |
| Informar incompleto (motivo ≤2000) | Asignado `accepted` | job `in_progress` | `incomplete`; 409 si no está en curso |
| Asignar (Select de membresías activas) | Dueña | job sin asignación activa (`pending`/`accepted`) | `assignments`; 409 «El trabajo ya tiene una asignación activa.» |
| Reasignar (Select; revoca la anterior §5.7) | Dueña | job con asignación activa y **no** `in_progress` | `reassign`; 409 «El trabajo está en curso: primero debe informarse incompleto.» |
| Revocar | Dueña | asignación `pending`/`accepted`, job no `in_progress` | `revoke`; 409 en caso contrario |
| Reanudar | Dueña | job `incomplete` con asignación `accepted` | `resume`; 409 «Solo un trabajo incompleto puede reanudarse.» |
| No pudo concretarse (motivo ≤2000) | Dueña | job no terminal | `not-realized`; 409 si terminal |
| Agregar trabajo (título+descripción) | Dueña | cualquier estado | `jobs`; 404 si no es dueña |
| Convertir y enviar | Dueña | orden `requested` | `convert`; 422 «Solo se convierten órdenes en estado requested.» |
| Cancelar (motivo ≤2000, diálogo) | Dueña | orden `open` y **ningún** job con `startedAt` | `cancel`; 409 «La orden ya tiene trabajo realizado…» / «…no está en un estado cancelable.»; revoca asignaciones pendientes/aceptadas |
| Cerrar (diálogo) | Dueña | orden `open`/`in_progress`, ≥1 job y todos `done`/`not_realized` | `close`; 409 «La orden no puede cerrarse: hay trabajos sin finalizar…» |
| Editar instrucciones (diálogo) | Dueña; empresa externa con asignación activa (sin `urgent`) | cualquier estado (el `urgent` no aplica si la orden es `completed`/`cancelled` → 409) | `PATCH`; 403 «Solo la empresa responsable…» |

## 6. Validación de formularios

Espejo client-side con zod de los DTO del backend (el servidor manda:
ante discrepancia se ve el 422 con `detail`):

- CreateOrderDto: `propertyId` uuid requerido; `title` 1–300; 
  `description` 1–5000; `clientRelationshipId` uuid opcional; acceso×3
  opcional (≤50/≤50/≤2000, vacío → no se envía); `urgent` boolean.
- UpdateOrderDto: mismos límites, todo opcional; `urgent` solo si la
  orden no es `completed`/`cancelled`.
- AddJobDto: `title` 1–300 y `description` 1–5000 requeridos.
- RejectAssignmentDto: `reason` opcional ≤1000 (vacío → se envía `{}`).
- JobProgressDto: `message` requerido ≤2000. CompleteJobDto: `result`
  opcional ≤2000. JobIncompleteDto/NotRealizedDto/CancelOrderDto:
  `reason` requerido ≤2000.
- CreateAssignmentDto: `jobId` y `assigneeMembershipId` uuid
  requeridos (el diálogo arma ambos; en `reassign` el `jobId` se
  rellena de la asignación previa, que es de donde el servidor lo toma).

## 7. Criterios de aceptación

- **AC-F4.1** (filtros BE-1): Given la lista con órdenes de varios
  estados, When elijo un chip de estado, Then la petición lleva
  `status=<valor>` y solo se ven órdenes de ese estado; When activo «Mis
  pendientes de aceptar», Then la petición lleva
  `assignment_status=pending` y solo se ven órdenes con mi asignación
  pendiente; combinados, ambos params viajan juntos (AND).
- **AC-F4.2** (dirección en fila): Given una orden de mi espacio, Then
  la fila muestra la dirección de su propiedad resuelta del cache; Given
  una orden ajena visible solo por asignación, Then la fila no muestra
  dirección (no hay endpoint con ese resumen).
- **AC-F4.3** (creación §5.1): Given el formulario con propiedad,
  título y descripción, When envío, Then 201 → el detalle muestra la
  orden `open` con el primer trabajo reflejando título/descripción;
  Given título vacío, Then el botón no envía y el error aparece junto al
  campo.
- **AC-F4.4** (transiciones del asignado §20.2): Given una orden con
  mi trabajo asignado y `pending`, When acepto, Then el trabajo queda
  `accepted` (no en curso); When inicio, Then el trabajo pasa a `En
  curso` y la orden a `En curso`; When registro avance, Then el
  servidor responde `201` con el evento registrado y la UI queda sin
  banner (lectura en pantalla: F5, §2.3.4); When completo, Then el
  trabajo queda `Completado`; When informo
  incompleto con motivo, Then el trabajo queda `Incompleto` con el
  motivo registrado.
- **AC-F4.5** (asignar/reasignar §5.6–§5.7): Given un trabajo `pending`
  sin asignación, When la dueña asigna a una membresía activa, Then hay
  una asignación `Propuesta` en el historial; When la persona la
  rechaza con motivo, Then el trabajo vuelve a `Pendiente` y el motivo
  queda en el historial; When la dueña reasigna a otra membresía, Then
  la anterior queda `Revocada` y la nueva `Propuesta` (ambas visibles).
- **AC-F4.6** (no pudo concretarse §6.3): Given un trabajo no terminal,
  When la dueña lo marca con motivo, Then el trabajo queda «No pudo
  concretarse» con el motivo registrado en `job_events` (lectura en
  pantalla: F5) y sus asignaciones activas quedan revocadas.
- **AC-F4.7** (cierre §6.4): Given una orden con todos los trabajos
  `Completados` o «No pudo concretarse», When la dueña cierra, Then la
  orden queda `Cerrada` con fecha; Given un trabajo aún pendiente, Then
  el botón de cierre no se ofrece y el `close` vía API responde 409.
- **AC-F4.8** (cancelación §20.1): Given una orden `open` sin trabajos
  iniciados, When la dueña cancela con motivo, Then la orden queda
  `Cancelada` con el motivo visible y sus asignaciones pendientes
  quedan revocadas; Given una orden con un trabajo iniciado, Then el
  botón no se ofrece y el `cancel` vía API responde 409.
- **AC-F4.9** (convertir pedido §20.1): Given un pedido del portal F3
  (`requested`), When la dueña pulsa «Convertir y enviar», Then la orden
  queda `Enviada` con el primer trabajo creado; Given una orden `open`,
  Then el botón no se ofrece y `convert` vía API responde 422.
- **AC-F4.10** (visibilidad §2.3/§4.5/§2.12): Given un profesional con
  asignación activa, Then en el detalle solo ve sus trabajos y el
  bloque de acceso; When rechaza o es revocado, Then la orden responde
  404 vía API y la UI muestra «no encontrada o sin acceso» sin datos;
  Given un miembro de la empresa dueña sin asignación, Then no le se
  ofrecen las acciones del asignado (y el `start` vía API responde 403
  «Este trabajo no es tuyo…»).
- **AC-F4.11** (navegación F2): Given la portada, When pulso «Crear
  orden», Then llego a `/app/orders/new`; Given una notificación de
  tipo `order`, When la pulso, Then abro ese detalle; Given una de tipo
  `assignment` cuya asignación está en las órdenes cargadas del
  espacio, Then abro la orden que la contiene.
- **AC-F4.12** (solo transiciones válidas): Given cualquier
  combinación de estado de orden/trabajo/asignación y relación (dueña /
  asignado pendiente / asignado aceptado), Then `allowedOrderActions`
  ofrece exactamente las acciones que el servidor acepta (matriz §20
  probada como función pura, incluidos los 409 de §5).

## 8. Pruebas

**Unitarias (Vitest + Testing Library), gate local:**

- `orders-page.test.tsx`: filtros (chips/toggle → params de la petición
  y filas), estados de carga/vacío/sin-resultados/error, join de
  dirección, fila ajena sin dirección, nota de límite 100.
- `order-new-page.test.tsx`: render por tipo de espacio (cliente solo en
  `own_business`), validación zod, envío del payload correcto, 422/409
  en banner, navegación al detalle.
- `order-detail-page.test.tsx`: cabecera/badges, bloque de acceso
  presente/ausente según `access`, historial de asignaciones con
  motivos, diálogos (rechazo, cancelar, incompleto, no realizado,
  asignar, agregar trabajo, editar), banners 403/409 con refetch,
  pantalla 404.
- `order-actions.test.ts` (función pura): matriz completa de
  `allowedOrderActions` — dueña vs asignado pendiente vs asignado
  aceptado vs externo rechazado; estados de orden/trabajo; casos 409 de
  §5 (AC-F4.12).

**e2e Playwright (`orders-flows.spec.ts`, 2 viewports × flujos, CI +
gate local):**

1. Ciclo completo (ana + bob en Gestión Demo): crear orden urgente →
   asignar a bob → bob acepta/inicia/avance/completa → ana cierra →
   «Cerrada».
2. Rechazo y reasignación: bob rechaza con motivo → job `Pendiente` →
   ana reasigna (historial con Rechazada + Revocada) → ana revoca.
3. Cancelación: orden abierta se cancela con motivo; API con trabajo
   iniciado → 409 (server manda).
4. Incompleto y no pudo concretarse: incomplete con motivo → dueña
   reanuda → completa; segundo trabajo «No pudo concretarse» → cierre
   de la orden compuesta.
5. Compuesta y pedido: carla (`own_business`) agrega trabajo y asigna;
   pedido del portal F3 (token) → «Convertir y enviar» → `Enviada` con
   primer trabajo.
6. Visibilidad y navegación: bob (externo asignado) ve acceso y sus
   trabajos; tras revoke → 404 en API y pantalla; notificación
   `assignment` navega a la orden; tile «Crear orden» de la portada.

## 9. Accesibilidad y responsive

- Mobile-first (360 → 768 → 1280): filas y tarjetas apiladas; acciones
  como botones apilados full-width en móvil; diálogos del design system
  (focus trap, Escape).
- Semántica de lista en los listados; `h1` único por página (título de
  la orden en el detalle); badges con **texto**, no solo color (contraste
  AA con tokens F0); `fieldset`/`legend` en el bloque de acceso del
  formulario y en los diálogos con motivo.
- Acciones destrucción (cancelar, revocar, no pudo concretarse,
  rechazar) en variante `destructive` con diálogo de confirmación
  (patrón F2/F3); errores junto al campo + banner `aria-live` (F0-D4);
  foco devuelto al disparador tras cerrar diálogos.

## 10. Definición de hecho

- Criterio de salida de `frontend_plan.md` F4: **una orden recorre su
  vida completa desde la UI hasta cierre; cada botón de transición está
  respaldado por un test; el detalle oculta lo que el rol no debe ver (y
  el servidor lo niega igual)**.
- Gate `cd frontend && npm run check` verde (lint 0 errores, typecheck,
  unit) y `cd backend && REQUIRE_DOCKER=true npm run check` verde tras
  F4-D1; CI verde; e2e locales con backend dev + `FRONTEND_URL` y buzón
  de prueba (F0-D5/F1-D4).
- openapi.json + `frontend/src/api/generated/schema.ts` regenerados tras
  F4-D1; ningún tipo de API escrito a mano.

## 11. Casos excepcionales

- **401 con sesión expirada**: handler global F0 → `/login?next=…`;
  las mutaciones en vuelo no navegan.
- **403 en una mutación** (p. ej. `urgent` desde empresa externa, o
  `start` de un trabajo ajeno): banner con el `detail` + refetch; los
  botones se recalculan. Nunca se muestran datos de la respuesta.
- **404 en el detalle**: orden ajena sin asignación activa, asignación
  rechazada/revocada (§2.12) o id inexistente → misma pantalla sin
  revelar cuál fue el caso (sin datos ajenos, §16).
- **409 por carrera** (otro usuario avanzó el estado): banner con el
  `detail` del servidor + refetch del detalle y de la lista; los botones
  se recalculan según el nuevo estado.
- **422**: `detail` del RFC 7807 junto al formulario (zod es espejo, no
  autoridad).
- **Doble submit**: el botón se deshabilita con `isPending`
  (patrón F3); el servidor además es idempotente en transiciones
  ilegales (409, no duplicados).
- **Permiso revocado en vivo**: un refetch posterior devuelve 404 →
  pantalla de no encontrada; ninguna acción queda «colgada».
- **Lista con 100 filas**: nota «Se muestran las 100 órdenes más
  recientes» (BE-1 §1.1); no hay paginación en el contrato.
- **Asignado externo**: el contrato no expone `assigneeName`; las
  membresías que no son del espacio propio ni mías se muestran como
  «Asignado externo» (sin exponer el id).
- **Notificaciones de `assignment` fuera del conjunto cargado**: sin
  endpoint de asignación ni `link` del servidor → el ítem no es
  clickeable (F4-D6); nunca se inventa una ruta a ciegas.
- **Referencia a la orden rechazada (enmienda §5.6)**: `parentOrderId`
  no es escribible por API (F4-D7/§11-reportado); F4 no ofrece «crear
  orden sucesora» y no presenta el campo como editable.
- **Marca de urgencia al crear**: `CreateOrderDto` no acepta `urgent`
  (solo lo hace `PATCH /orders/{orderId}`), así que el formulario crea la
  orden y, si «Urgente» está marcado, lanza un `PATCH {urgent:true}`
  best-effort; si ese segundo call falla la orden se abre en su detalle sin
  la marca y «Editar instrucciones» la activa (nunca se deja al usuario en
  un formulario duplicado).
