# Especificación técnica — Etapa F2 (frontend)

Etapa F2 del plan maestro (`frontend_plan.md`): **portada / dashboard**.
Construye sobre F0 (sesión, guards, selector de espacio, design system,
handler global de 401) y F1 (cuentas, invitaciones, Miembros) y consume los
filtros de BE-1 (`docs/especificacion/be-1-filtros-ordenes.md`, aprobada e
implementada el 19/10/2026 — prerequisito de esta etapa, ya cumplido).

La spec **no redefine la API**: la consume tal como la documenta el contrato
`backend/openapi/openapi.json` y las specs backend de la Etapa 2
(`docs/especificacion/etapa-2.md` §2.6) y BE-1. Las reglas de negocio se
referencian por § a `proyect.md`, nunca se copian.

Base normativa: §2.1–§2.3 (tipos de participantes), §2.4 (espacios
separados), §2.12 (visibilidad de órdenes), §5.6 (aceptación y rechazo),
§14.1–§14.2 (notificaciones in-app y urgencias), §16.1, §16.8, §20.1 (orden),
§20.2 (trabajo), §20.3 (asignación).

> **Aprobada por el dueño el 20/10/2026** (spec-driven, `AGENTS.md`).
> Redactada el 20/10/2026.

---

## 1. Alcance

### 1.1 Entra / queda fuera

**Entra:**

- **Portada** en `/app` (reemplaza el placeholder `ComingSoonStage` de F0):
  identificación del espacio activo con su **tipo de participante**
  (Administradora / Contratista / Profesional independiente, §2.1–§2.3).
- **Tarjeta «Órdenes abiertas»** con los filtros de BE-1:
  `GET /companies/{id}/orders?status=open,in_progress` (decisión F2-D1 cierra
  B4 de BE-1).
- **Tarjeta «Pendientes de aceptar»** con
  `GET /companies/{id}/orders?assignment_status=pending` y acciones
  **Aceptar / Rechazar** directas desde la portada sobre las asignaciones
  propias (§5.6, §20.2, §20.3).
- **Notificaciones in-app** (§14): lista de las del **espacio activo** con
  badge de no leídas y «marcar como leída»
  (`GET /notifications`, `POST /notifications/{notifId}/read`).
- **Accesos rápidos** por rol/tipo hacia las secciones del shell (F2-D7).
- **Cambios backend aprobados por el dueño el 20/10/2026** (aditivos, sin
  cambio de comportamiento; Opción A de F1-D3 aplicada a lo que F2 consume):
  1. `MembershipViewDto.id` en `GET /auth/me`: la UI debe saber **qué
     asignación es suya** (en órdenes del propio espacio la lista trae
     asignaciones de todos los miembros y no hay forma fiable de
     distinguirlas — caso B3 de BE-1).
  2. `companyId` en cada ítem de `GET /notifications`: la lista trae todas
     las notificaciones del usuario **sin** el espacio al que pertenecen; la
     portada es por espacio activo y §2.4 exige separar los datos por
     relación.
  3. Documentación de respuesta (Opción A) para las listas que F2 consume
     (`GET /orders` y `GET /notifications` no tienen schema en OpenAPI hoy),
     regeneración de `openapi.json` y del cliente frontend, con tests.
- Tests: unit de la portada (Vitest + Testing Library), unit de los DTOs
  backend, e2e Playwright de los flujos con API real.

**Queda fuera:**

- **Creación de orden** y el resto de la máquina de estados §20 (F4). El
  acceso rápido «Crear orden» del plan se materializa cuando F4 entregue el
  formulario: en F2 los accesos apuntan a las secciones existentes; este
  documento lo deja explícito para no simularlo.
- **Detalle de orden** (F4): las filas de las tarjetas son informativas en
  F2; navegar a la orden llega con F4.
- **Navegación desde notificaciones**: en el contrato actual `link` es
  `null` en toda notificación creada (F2-D6); los ítems son informativos con
  «marcar como leída».
- **Badge global en el header del shell**: el plan pone lista/badge en la
  portada; un indicador permanente en la barra no está pedido.
- **Conteo server-side de no leídas**: BE-1 §1.1 ya rechazó los endpoints de
  conteo/agregado para la v1; F2-D4 resuelve el badge en cliente.
- Preferencias de notificación (`GET/PUT /me/notification-preferences`,
  §18.4): el plan no las incluye en F2.
- Filtros avanzados de órdenes (F4), paginación de órdenes (BE-1 §1.1 la
  pospuso), audit log desde UI (F8).

### 1.2 Decisiones de diseño

| # | Decisión |
|---|---|
| **F2-D1** | **«Órdenes abiertas» = `status=open,in_progress`** (cierra B4 de BE-1): `open`/`in_progress` son las órdenes en curso de trabajo (mapeo BE-2 R5: `open`=Enviada, `in_progress`=En curso); `requested` queda **fuera** (es un pedido de una cuenta limitada aún sin convertir a orden real, gestiona F4 con `…/convert`) y `completed`/`cancelled` son terminales (§20.1). Etiquetas visibles según el mapeo oficial BE-2 R5. |
| **F2-D2** | **«Pendientes de aceptar» = `assignment_status=pending`** (BE-1 B4), **una fila por asignación pendiente propia** (no por orden): el título de la orden y del trabajo acompañan, y las acciones son por asignación (§20.3: cada asignación es un registro propio). «Propia» = `assigneeMembershipId` ∈ los ids de mis membresías (`me.id`, cambio backend aprobado). Sin filtro de estado de orden combinado: una orden `in_progress` también puede tener trabajos nuevos pendientes. |
| **F2-D3** | **Aceptar con confirmación; rechazar con motivo opcional**: aceptar abre diálogo de confirmación (aceptada no vuelve a propuesta, §20.3) y envía `{}`; rechazar abre diálogo con textarea opcional ≤1000 (espejo del DTO `RejectAssignmentDto`) y envía `{reason?}`. Ambos con botón deshabilitado mientras pendiente (doble submit). |
| **F2-D4** | **Badge de no leídas en cliente**: cuenta `readAt === null` sobre las notificaciones **cargadas** (`GET /notifications?limit=50`, «Cargar más» por cursor agregan). Sin endpoint de conteo (BE-1 §1.1); el badge es exacto hasta el conjunto cargado y el tope queda documentado en UI (§11). |
| **F2-D5** | **Opción A aplicada a las respuestas de F2**: documentar en backend los DTOs de respuesta de `GET /orders` (lista con jobs/assignments, tal cual la serialización actual) y `GET /notifications` (ítem con `companyId`), más `MembershipViewDto.id`; regenerar contrato y cliente (patrón F1-D3; aprobado por el dueño 20/10/2026). Sin cambio de comportamiento. |
| **F2-D6** | **Notificaciones informativas en F2**: `link` es `null` en las notificaciones creadas por el backend; el ítem no navega. Clic en «Marcar como leída» (botón por ítem) → 204 → refetch. La navegación a la entidad se habilitará cuando exista la pantalla (F4/F5), usando `entityType`/`entityId` que la respuesta ya trae. |
| **F2-D7** | **Accesos rápidos**: tiles hacia rutas **existentes** del shell, con la única variante por rol: `owner` ve además «Miembros» (`/app/settings/members`, pantalla real de F1); el resto (Órdenes, Catálogos, Facturación) es común a todos los roles, igual que el sidebar de F0. «Crear orden» llega con F4 (ver §1.1). |

## 2. Pantallas y flujo

| Ruta | Acceso | Contenido y estados |
|---|---|---|
| `/app` | sesión + espacio activo | Portada F2 (ver abajo). Sin espacio activo el guard F0 ya lleva a `/`; 404 del espacio → picker (F0-D1); 401 global (F0-D2). |

Estructura de la portada, de arriba a abajo:

1. **Encabezado**: nombre del espacio activo + **etiqueta del tipo**
   (§2.1–§2.3; sale de `me.memberships[active].companyType`, con
   `profesional` legacy mostrando «Profesional independiente» — F1-D2).
2. **Tarjeta «Órdenes abiertas»**: filas con título, badge de estado
   («Enviada»/«En curso», mapeo BE-2 R5), marca «Urgente» (§14.2,
   `urgent: true`) y fecha de creación. Conteo en el encabezado (si el
   backend devuelve el tope de 100, se muestra «100+», corte documentado en
   BE-1 §1.1).
3. **Tarjeta «Pendientes de aceptar»**: una fila por asignación pendiente
   propia (F2-D2) con título de orden, título de trabajo y botones
   «Aceptar»/«Rechazar» (F2-D3). Conteo de filas propias.
4. **Tarjeta «Notificaciones»**: badge de no leídas (F2-D4), lista de las
   notificaciones **del espacio activo** (F2-D5), por ítem: título, cuerpo,
   fecha y botón «Marcar como leída» (F2-D6); «Cargar más» si hay
   `nextCursor`.
5. **Accesos rápidos** (F2-D7).

Estados por tarjeta (independientes): carga (skeleton), vacío con copy
propio («No hay órdenes abiertas», «No tienes asignaciones pendientes de
respuesta», «No tienes notificaciones»), error con botón de reintento que
recarga solo esa tarjeta.

Responsive (mobile-first): 360 px → tarjetas apiladas en una columna,
accesos rápidos en grilla de 2; ≥768 px → «Órdenes abiertas» y «Pendientes»
en dos columnas, notificaciones y accesos debajo; ≥1280 px → hasta tres
columnas aprovechando el ancho del shell. Mismo componente, grilla por
breakpoint (patrón F0/F1).

## 3. Vista de datos por rol

- **Todo lo que se lista lo decide el servidor** (§2.12, §3.4, §16.1): las
  dos tarjetas son llamadas al listado de órdenes con filtros que **solo
  estrechan** (BE-1 §5); la serialización por rol (`all`/`own_jobs`) la
  aplica el backend, la UI no filtra a mano.
- **Acciones solo sobre lo propio** (F2-D2): los botones Aceptar/Rechazar
  aparecen únicamente en asignaciones cuyo `assigneeMembershipId` pertenece
  a las membresías del usuario (`me.id`). Si aun así se invocara contra una
  asignación ajena, el servidor responde **404 sin revelar existencia**
  (§16.8) y **403** si pertenece a otro espacio — la UI no sustituye esa
  verificación (Etapa 2, `findAssignable`).
- **Diferencia por tipo de espacio** (§2.1–§2.3): la portada informa el
  tipo y el contenido varía solo por lo que el servidor devuelve — la
  administradora ve sus órdenes; el contratista/profesional ve además las
  que le llegan (las suyas aparecen en ambas tarjetas cuando corresponde).
- **`owner` vs `member`**: mismas tarjetas (la visibilidad no depende del
  rol de máximo jerarquía); la única diferencia de portada es el acceso
  rápido «Miembros» (F2-D7). Las acciones de aceptar/rechazar corresponden a
  **cualquier miembro asignado**, no solo al owner (§5.6: el destinatario
  responde).
- **Notificaciones** (§2.4): solo las del espacio activo (`companyId`
  coincide); las de otros espacios del usuario jamás se renderizan en esta
  portada aunque estén en la respuesta.
- **Órdenes de otros espacios** (§2.4): el listado del servidor incluye
  además las órdenes de otros espacios asignadas al usuario (visibilidad
  §2.12, que consume F4 con su lista general); la portada renderiza **solo
  las órdenes cuyo `companyId` es el espacio activo**, en ambas tarjetas
  (flujo 4 de §8: la fila creada por carla en Taller Carla no aparece en la
  portada de Gestión Demo de ana). Filtro en cliente, igual que el de
  notificaciones: el servidor decide la visibilidad, el contexto del espacio
  decide qué dibuja esta pantalla.

## 4. Consumo de la API

| Endpoint (contrato) | Pantalla | TanStack Query |
|---|---|---|
| `GET /companies/{id}/orders?status=open,in_progress` | tarjeta abiertas | `['company', id, 'orders', 'dashboard', 'open']` |
| `GET /companies/{id}/orders?assignment_status=pending` | tarjeta pendientes | `['company', id, 'orders', 'dashboard', 'pending']` |
| `POST /companies/{id}/assignments/{assignId}/accept` | Aceptar (diálogo) | mutation → invalidar `['company', id, 'orders']` (ambas tarjetas) |
| `POST /companies/{id}/assignments/{assignId}/reject` | Rechazar (diálogo) | mutation → invalidar `['company', id, 'orders']` |
| `GET /notifications?limit=50&cursor=` | tarjeta notificaciones + badge | `['notifications']` (raíz propia: el filtro por espacio es en cliente; no se limpia al cambiar de espacio, se re-filtra) |
| `POST /notifications/{notifId}/read` | marcar leída | mutation → invalidar `['notifications']` |
| `GET /auth/me` | ids de membresía, tipo del espacio | ya cacheado en F0 (`['me']`) |

Los tipos salen **solo** del cliente generado (F2-D5; aliases en
`src/api/types.ts`, patrón F0). Los query keys de órdenes usan la raíz
`['company', …]` de F0 para que el cambio de espacio invalide ambas
tarjetas.

## 5. Interacciones y transiciones

- **Aceptar** (§5.6, §20.2, §20.3): diálogo «¿Aceptar este trabajo?» con
  título de orden/trabajo → confirmación → `POST …/accept` (204) → la fila
  sale de «Pendientes»; la orden sigue en «Órdenes abiertas» (el estado de
  orden no cambia al aceptar: el trabajo pasa a «Aceptado» y el inicio es
  `start` explícito en F4, decisión de la Etapa 3). El asignador recibe la
  notificación in-app `assignment_accepted` (§14.1) — el backend la crea.
- **Rechazar** (§5.6, §20.2): diálogo con motivo opcional (≤1000) y copy
  «El trabajo queda libre para una nueva asignación» → `POST …/reject`
  (204) → la fila sale; el job vuelve a `pending` en el servidor. El
  asignador recibe `assignment_rejected` y, si hubo motivo, lo lleva en el
  cuerpo.
- **Marcar como leída**: botón por ítem → 204 → refetch; si ya estaba
  leída, 204 idempotente.
- **Errores**: 409 («ya fue respondida» — doble acción/pestaña) y 404 (la
  asignación ya no existe) muestran el `detail` en un banner con
  `aria-live` **y refrescan** ambas tarjetas; 403 (otro espacio) se muestra
  igual, sin datos; 401 → login (F0-D2); 422 no es alcanzable con parámetros
  fijos — si llegara, se muestra el `detail`.
- Los botones de acción llevan el contexto en su nombre accesible
  («Aceptar: {título de orden}») para desambiguar en lista.
- Ninguna acción escribe en la UI sin pasar por el servidor; la UI solo
  ofrece las transiciones válidas (§20: responder a una asignación
  `pending`).

## 6. Validación de formularios

No hay formularios con campos de entrada obligatorios. El único input es el
motivo del rechazo:

| Form | Reglas espejo (DTO backend) |
|---|---|
| Motivo de rechazo | opcional; si viene, 1–1000 caracteres (`RejectAssignmentDto`); vacío → se envía sin `reason` |

El servidor manda: ante discrepancia, 422 con `detail` bajo el campo
(F0-D4).

## 7. Criterios de aceptación

- **AC-F2.1** Dado un espacio activo, cuando se abre `/app`, entonces el
  encabezado muestra el nombre del espacio y su tipo de participante en el
  texto de §2.1–§2.3 (el tipo sale de `me`; `profesional` legacy se muestra
  como «Profesional independiente»).
- **AC-F2.2** Cuando se carga la portada, entonces «Órdenes abiertas» viene
  de `status=open,in_progress` y sus filas solo tienen esos estados con las
  etiquetas del mapeo BE-2 R5 (§20.1); `requested`, `completed` y
  `cancelled` jamás aparecen; sin resultados → estado vacío propio.
- **AC-F2.3** Cuando se carga la portada, entonces «Pendientes de aceptar»
  viene de `assignment_status=pending` y muestra **una fila por asignación
  pendiente propia** (`me.id`); filas de asignaciones de otros miembros del
  mismo espacio no llevan acciones — y si se invocan contra la API, el
  servidor responde 404 (§16.8; matriz Etapa 2), sin filtrar existencia.
- **AC-F2.4** Dada una fila propia, cuando el usuario confirma «Aceptar»,
  entonces 204, la fila sale de «Pendientes», la orden permanece en
  «Órdenes abiertas» (§20.2/§20.3) y **el asignador recibe la notificación
  in-app** `assignment_accepted` del espacio correspondiente (§14.1).
- **AC-F2.5** Dada una fila propia, cuando el usuario confirma «Rechazar»
  (con o sin motivo), entonces 204, la fila sale, el job queda `pending`
  para reasignación (§5.6, §20.2) y el asignador recibe
  `assignment_rejected`, con el motivo en el cuerpo si se envió.
- **AC-F2.6** Cuando accept/reject responde 409 (ya respondida) o 404 (ya no
  existe), entonces el `detail` se muestra en la portada y ambas tarjetas
  se refrescan; con 401 el usuario llega a `/login` (F0-D2).
- **AC-F2.7** Cuando hay notificaciones de varios espacios del usuario,
  entonces la portada muestra **solo las del espacio activo** (`companyId`,
  §2.4) — las de otro espacio jamás se renderizan aquí — con badge de no
  leídas del conjunto cargado (F2-D4) y estado vacío propio.
- **AC-F2.8** Cuando el usuario marca una notificación como leída, entonces
  204, el badge baja y el ítem queda como leído; repetir sobre una ya
  leída es 204 idempotente.
- **AC-F2.9** Cuando el usuario es `owner`, entonces ve el acceso rápido
  «Miembros»; siendo `member`, no lo ve — y el destino existe hoy
  (F2-D7); ningún acceso apunta a una ruta inexistente.
- **AC-F2.10** Cuando una tarjeta falla (red/5xx), entonces su error y su
  reintento son independientes de las demás tarjetas; al cambiar de
  espacio, las tarjetas de órdenes se recargan por la invalidación F0 de
  `['company', …]` y las notificaciones se re-filtran por el espacio nuevo.
- **AC-F2.11** Cuando la portada se ve en 360 px, entonces las tarjetas
  están apiladas y todas las acciones son alcanzables por teclado con foco
  visible; los diálogos de aceptar/rechazar usan el design system (focus
  trap, Escape).
- **AC-F2.12** Cuando el contrato se regenera (F2-D5), entonces el cliente
  trae `MembershipViewDto.id`, el ítem de notificación con `companyId` y
  las listas tipadas — el typecheck compila sin tipos de API escritos a
  mano (stack §6).

## 8. Pruebas

- **Unit frontend (Vitest + Testing Library):**
  - Portada: etiqueta del tipo por `companyType` (4 valores → 3 textos,
    AC-F2.1); filas de abiertas con estados/etiquetas y marca «Urgente»;
    estado vacío y error con reintento por tarjeta (AC-F2.2, AC-F2.10).
  - Pendientes: con un pedido que trae asignaciones de dos miembros, solo
    la propia tiene botones (AC-F2.3); Aceptar → diálogo → POST correcto →
    la respuesta refresca la lista; Rechazar → motivo opcional en el body
    (AC-F2.4/AC-F2.5); 409/404 muestran `detail` (AC-F2.6).
  - Notificaciones: filtro por `companyId` del espacio activo (AC-F2.7),
    badge = no leídas cargadas, «Marcar como leída» → refetch y badge
    descendente (AC-F2.8), «Cargar más» con cursor.
  - Accesos rápidos por rol (AC-F2.9).
- **Unit backend:** `GET /auth/me` incluye `id` de membresía; la lista de
  notificaciones serializa `companyId`; OpenAPI snapshot actualizado
  (contrato).
- **e2e Playwright (API real, sin mocks del permiso):**
  1. **Portada por espacio**: ana → Gestión Demo → etiqueta
     «Administradora de propiedades», «Órdenes abiertas» con la orden
     `open` de la semilla (solo lectura: ningún e2e muta la semilla),
     «Pendientes» vacío para ana.
  2. **Aceptar extremo a extremo**: ana crea orden + trabajo + asignación a
     bob vía API (título único por corrida; el membershipId de bob sale de
     `GET …/members`) → bob (auto-selección F0-D1) ve la fila con
     Aceptar/Rechazar → acepta → fila desaparece, la orden sigue en
     abiertas → ana ve en su portada la notificación `assignment_accepted`
     y la marca como leída (badge baja).
  3. **Rechazar con motivo**: otra orden única → bob rechaza con motivo →
     fila desaparece → ana recibe `assignment_rejected` con el motivo en el
     cuerpo.
  4. **Separación de espacios (§2.4)**: carla crea una orden en Taller
     Carla y asigna a ana (única por corrida) → en la portada de Gestión
     Demo de ana **no** aparece; al cambiar a Taller Carla, aparece.
  - Local con Chrome (F0-D5): si el backend no está arriba, los e2e se
    saltan como el resto; el gate local siempre es lint + typecheck + unit.
- Contrato: `npm run openapi:update` (backend) + `npm run openapi:generate`
  (frontend) tras F2-D5; el typecheck falla si el cliente quedó viejo.

## 9. Accesibilidad y responsive

- Mobile-first: grilla de tarjetas por breakpoint (§2); nada de «arreglar el
  desktop».
- Semántica de lista (`ul`/`li`) en las tres tarjetas; encabezados con
  `h1`/`h2` en orden correcto; badge de notificaciones con nombre accesible
  («N notificaciones sin leer»), no solo color.
- Botones de acción con nombre accesible que incluye la orden (§5);
  diálogos con focus trap y Escape (design system F0); foco visible.
- Estados de carga (skeleton), vacío (copy propio), error (reintento) y
  sin permiso: parte del diseño (§11).
- Contraste AA en badges de estado y marca «Urgente» (tokens F0).

## 10. Definición de hecho

- Criterio de salida de `frontend_plan.md` F2: **la portada muestra los dos
  listados correctos por tipo de espacio; aceptar/rechazar funciona extremo
  a extremo con la notificación correspondiente; sin BE-1 aprobado e
  implementado, esta etapa no arranca** — BE-1 aprobada e implementada el
  19/10/2026, condición cumplida.
- Cambios backend de §1.1 entregados con test y contrato regenerado
  (F2-D5).
- Gate `cd frontend && npm run check` verde en local (lint + typecheck +
  unit) y gate backend verde si se toca su código; CI verde (3 jobs).

## 11. Casos excepcionales

- **Asignación ya respondida en otra pestaña** (409): banner con `detail` +
  refetch de ambas tarjetas; la fila sale al refrescar.
- **Asignación revocada/reasignada mientras estaba listada** (404): igual
  que 409 — la portada nunca conserva una fila accionable que el servidor ya
  no acepta.
- **Asignación de otro espacio invocada a mano** (403): mensaje de estado
  sin datos (Etapa 2, `findAssignable`); la UI no la lista nunca.
- **Cambio de espacio con la portada abierta**: invalidación F0 por prefijo
  `['company', …]` recarga las tarjetas; notificaciones se re-filtran en
  cliente por `companyId` (la cache es de la cuenta, el render es del
  espacio).
- **Más de 100 órdenes abiertas**: el backend corta en 100 (BE-1 §1.1) y
  la tarjeta muestra «100+» — sin paginación en F2 (BE-1 la pospuso).
- **Más de 50 notificaciones sin leer**: el badge cuenta las cargadas
  (F2-D4); «Cargar más» amplía el conjunto y el badge con él. El tope es
  documentado, no un error.
- **Notificaciones de otros espacios en la respuesta**: filtradas por
  `companyId` antes de renderizar; jamás aparecen ni cuentan para el badge
  (§2.4).
- **`link: null` en toda notificación**: el ítem no navega (F2-D6); marcar
  como leída funciona igual.
- **Doble submit** en aceptar/rechazar: botón deshabilitado mientras
  pendiente; si el servidor recibe dos, el segundo 409 no rompe la UI.
- **Sesión expirada durante una acción**: 401 global → `/login` con vuelta
  interna (F0-D2).
- **Red caída al cargar una tarjeta**: su error es local con reintento; las
  demás tarjetas siguen operativas.
- **Espacio revocado con portada abierta**: siguientes llamadas → 404 →
  picker (F0-D1); la cache `['company', id, …]` queda invalidada al salir
  (F0), sin datos del espacio revocado en pantalla.
- **`profesional` legacy** en `companyType`: se muestra «Profesional
  independiente» (F1-D2), nunca el valor crudo del enum.
