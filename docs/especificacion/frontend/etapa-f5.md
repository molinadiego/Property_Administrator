# Especificación técnica — Etapa F5 (frontend)

Etapa F5 del plan maestro (`frontend_plan.md`): **evidencias e historial**.
Construye sobre F0 (sesión, guards, selector de espacio, design system,
handler global de 401), F1 (miembros, diálogos y formularios), F2 (portada
y notificaciones), F3 (catálogos y portal limitado) y F4 (órdenes, detalle
con trabajos y transiciones) y consume los contratos backend de la Etapa 3
(`docs/especificacion/etapa-3.md` §4.4 archivos, §4.5 historial, §4.6
shares, §5 reglas de permisos, §11 allowlist) además del patrón de
almacenamiento de `docs/stack.md` §4 (S3 en proceso `s3rver` en dev/test;
la descarga se sirve **por la API** con verificación de permiso por
request, no con URLs prefirmadas).

La spec **no redefine la API**: la consume tal como la documenta el
contrato `backend/openapi/openapi.json` (tras F5-D1) y las specs backend
citadas. Las reglas de negocio se referencian por § a `proyect.md`, nunca
se copian.

Base normativa: §7 (7.1 archivos, 7.2 historial de la propiedad, 7.3–7.4
historial del contratista/administradora, 7.5 compartir antecedentes),
§1.1.8 (no borrar silenciosamente), §2.3 (profesional: solo sus
trabajos), §6.1–§6.3 (evidencias al terminar/incompleto/no concretado),
§16 (requisitos 1, 3, 5 y 6), §16.1 (permisos verificados en servidor),
§16.8 (sin fuga de existencia).

> **Decisiones F5-D1…F5-D3 aprobadas por el dueño el 21/10/2026**
> (vía pregunta, antes de redactar esta spec): **F5-D1** Opción A completa
> (DTOs de respuesta + `@ApiResponse({type})` en los endpoints de
> archivos/historial + regeneración de `openapi.json` y cliente; patrón
> ya aprobado en F2-D5/F3-D1/F4-D1), **F5-D2** la respuesta de historial
> de propiedad gana `scope` (`full`/`shared`/`own_jobs`) y `shares[]`
> (solo dueño), **F5-D3** `/me/job-history` incluye `property.id`.
> **Spec y decisiones F5-D4…F5-D8 aprobadas por el dueño (vía pregunta)
> antes de implementar**; redactada el 21/10/2026, implementada el
> 22/10/2026 (gates backend y frontend en verde, e2e locales 18/18; el
> cierre y los gotchas quedan en `MEMORY.md`).

---

## 1. Alcance

**Entra**

- **Archivos en el detalle de orden** (extensión de la pantalla F4):
  subida a la orden y a un trabajo concreto (§7.1) desde PC y móvil
  (el mismo `<input type="file">` nativo abre la cámara en móvil),
  lista de metadata visible, agrupación por destino y descarga de bytes
  (contrato: `POST …/orders/{orderId}/files`, `POST …/jobs/{jobId}/files`,
  `GET …/orders/{orderId}/files`, `GET …/files/{fileId}`).
- **`/app/history`** — «Historial» con dos vistas: «Del espacio»
  (`GET …/history/orders`, §7.3–§7.4) y «Mis trabajos»
  (`GET /me/job-history`, §7.2, sesión, cualquier empresa en la que se
  haya trabajado).
- **`/app/history/properties/:propId`** — historial de una propiedad
  (§7.2) con los tres modos del servidor (`full`/`shared`/`own_jobs`,
  F5-D2) y la gestión de **compartir/revocar** antecedentes (§7.5,
  `POST/DELETE …/history/shares`).
- **Navegación**: item «Historial» en el shell (sidebar + bottom-nav) y
  entradas desde Catálogos (detalle de propiedad) y el detalle de orden
  (F4-D5).
- **Cambios backend aprobados** (F5-D1…F5-D3): response DTOs + anotación
  Swagger de los endpoints de F5, `scope`/`shares[]` en el historial de
  propiedad y `property.id` en el historial propio. Solo documentación y
  campos de respuesta ya decididos; sin cambio de comportamiento de
  permisos.

**Fuera de alcance**

- **Borrado de archivos**: existe `DELETE …/files/{fileId}` (borrado
  lógico con audit, §1.1.8) pero el criterio de salida de F5 es «nada se
  borra»: la UI **no ofrece** borrado (F5-D8); el endpoint queda reportado
  en §11 sin uso en la UI.
- **Costos en los historiales** (§7.2–§7.4 piden «costos registrados»):
  los payloads de historial de la Etapa 3 no los incluyen y no se
  agregaron con los costos de la Etapa 4 backend — reportado en §11, fuera
  del alcance de F5.
- **Flujo dedicado de fotos antes/después**: §7.1 los declara opcionales
  en el alcance inicial; F5 sube fotografías como archivos con
  `kind=photo` (F5-D6) sin inventar entidad ni pantalla propia.
- **Notas de avance libres** (§6.1): los payloads de historial solo
  traen el resultado final y los motivos (decisión backend, etapa-3 §4.5);
  F4 ya lo dejó anotado (AC-F4.4/AC-F4.6).
- **Portal limitado** (F3): sin cambios; las cuentas con acceso limitado
  no navegan `/app/*`.
- **Paginación o límite de los historiales**: el contrato no documenta
  `take` en `history/orders` ni en `/me/job-history` (§11-reportado);
  F5 muestra lo que llega, ordenado por el servidor.

## 2. Pantallas y flujo

### 2.1 Rutas y navegación (F5-D4)

- `NAV_ITEMS` gana el item **«Historial»** (`/app/history`, icono
  `History` de lucide, `labelKey: 'history'`, `stage: 'F5'`), colocado
  entre Catálogos y Facturación. `sidebar` lo renderiza solo (mapea la
  lista); `bottom-nav` pasa de `grid-cols-5` a `grid-cols-6`. El e2e smoke
  verifica que a 360 px no haya scroll horizontal y que las seis
  etiquetas quepan (`leading-tight` ya envuelve «Facturación»).
- **Pestañas como enlaces, sin dependencia nueva**: el componente ui no
  incluye Tabs y el stack está cerrado; «Del espacio» y «Mis trabajos»
  son `<Link>` a `?tab=space` / `?tab=mine` con `aria-current="page"` y
  el mismo estilo de tabs del design system. El estado vive en la query
  string (navegable/compartible, patrón F4 §2.1).

### 2.2 `/app/history?tab=space` — Del espacio (§7.3, §7.4)

Lista «Órdenes gestionadas» (`GET …/history/orders`): las propias del
espacio y aquellas en las que el espacio tuvo asignación, incluidas
cerradas. Por fila:

- Título, badge de estado (BE-2 R5), fechas de creación/cierre.
- Dirección de la propiedad (viene en el payload).
- Trabajos anidados: título, badge de estado, fechas y, cuando existan,
  el resultado (`completed`) y el motivo (`incomplete`/`not_realized`).
  **Los enlaces a la orden y a la propiedad solo se pintan cuando la
  propiedad pertenece al espacio activo** (join con el cache F3 de
  `GET …/properties`, patrón F4-D2): orden propia → detalle de orden y
  `/app/history/properties/:propId` (scope `full` garantizado); fila
  gestionada ajena → datos en línea, **sin enlaces** (el contrato no
  trae `companyId` y el detalle de la orden ajena responde 404).
- Estados: skeleton de filas (carga), EmptyBox (espacio sin órdenes
  gestionadas), ErrorBanner + «Reintentar».

### 2.3 `/app/history?tab=mine` — Mis trabajos (§7.2)

Lista de `GET /me/job-history`: todos los trabajos de la persona, de
cualquier empresa en la que haya tenido membresía, cerrados incluidos
(incluso con membresía revocada — es la consulta personal que §7.2
garantiza). Por fila:

- Dirección de la propiedad (**con `id` tras F5-D3**) como enlace a
  `/app/history/properties/:propId`; título de la orden y del trabajo
  (texto, sin enlace al detalle: con membresía revocada el detalle
  responde 404); badge del estado del trabajo; estado de la última
  asignación (`assignmentStatus`); fechas de inicio/fin; resultado o
  motivo cuando existan.
- El enlace al historial de la propiedad depende del `scope` del
  servidor: si responde 404 (sin asignación activa, sin share) la
  pantalla de «sin acceso» (§2.4) informa sin datos — la lista propia
  sigue siendo siempre utilizable (§11).
- Estados: skeleton, EmptyBox (persona sin trabajos), ErrorBanner.

### 2.4 `/app/history/properties/:propId` — historial de propiedad (§7.2, §7.5)

- **Cabecera**: `h1` con la dirección (más ciudad/estado) y **badge del
  modo** derivado del `scope` de la respuesta (F5-D2):
  «Historial completo» (`full`), «Compartido contigo» (`shared`) o
  «Solo tus trabajos» (`own_jobs`).
- **Antecedentes compartidos** (solo `scope=full`, dueña): lista de los
  `shares[]` activos (F5-D2) — nombre resuelto del cache de miembros
  (espacio propio + mis membresías, patrón F4; si no se resuelve:
  «Membresía externa», sin inventar datos), nota truncada con texto
  completo en `title`, fecha de creación — y botón **«Revocar»**
  (variante `destructive` + diálogo de confirmación, §7.5) por fila.
  Botón **«Compartir historial»** abre el diálogo (§5).
- **Órdenes** (orden `createdAt` desc, del servidor): por orden, título
  (**enlace al detalle solo en `scope=full`** — dueña: siempre
  accesible; en `shared`/`own_jobs` el título es texto porque el
  detalle puede responder 404), badge de estado, fechas de creación y
  cierre, referencia a la orden origen (`parentOrderId`) como texto
  cuando exista, sus trabajos (título, estado, fechas, resultado y
  motivo) y sus **archivos visibles** (ícono por `kind`, nombre, tamaño,
  fecha, acción «Descargar»; archivos con `deletedAt` → badge
  «Retirado» sin acciones).
- **Estados**: skeleton; **404 → pantalla «Historial no disponible»**
  (propiedad inexistente o sin scope — §16.8: nunca se revela cuál);
  ErrorBanner + «Reintentar».
- **Responsive**: en 360 todo apilado (orden → trabajos → archivos en
  bloques anidados); ≥768 la cabecera pasa a dos columnas (dirección /
  badge + acciones).

### 2.5 `/app/orders/:orderId` — extensión con archivos (F4 §2.3, F5-D5)

Nueva sección **«Archivos»** después de «Trabajos» (numerada 5; los
estados de la página quedan como 6):

- **Archivos de la orden**: tarjeta con los archivos cuyo
  `targetType='order'` de `GET …/orders/{orderId}/files` (agrupación
  client-side por `targetType`/`targetId`) y el control de subida.
- **Evidencias de cada trabajo**: dentro de cada tarjeta de job, una
  subsección con los archivos `targetType='job'` de ese job y su propio
  control de subida (§7.1: durante el trabajo, al terminarlo o cuando no
  pudo completarse; el servidor no impone estado y la UI no inventa uno).
- El detalle solo es visible para la empresa dueña y para el asignado
  activo (F4 §3), que son exactamente quienes pueden subir (etapa-3 §4.4):
  el control de subida se ofrece en todo detalle accesible; ante un 403
  en vivo (asignación revocada) el banner + refetch lo retira.
- Control de subida: etiqueta-botón con `<input type="file" hidden>`
  `accept` = allowlist, estado «Subiendo…» (`isPending`), errores en
  banner (§5/§6).

### 2.6 Entradas de navegación

1. Item «Historial» del shell → `/app/history`.
2. Detalle de propiedad (F3), cabecera junto a las acciones existentes:
  botón **«Ver historial»** → `/app/history/properties/:propId` (dueña =
  `full`).
3. Detalle de orden (F4), la dirección de la propiedad pasa a ser
  enlace al historial de la propiedad: quien ve el detalle es dueño
  (`full`) o asignado activo (`own_jobs`/`shared`) — el servidor nunca
  responde 404 a esos visores.
4. Filas de «Mis trabajos» → historial de la propiedad (puede 404, §2.3).
5. Filas «Del espacio» propias → historial de la propiedad.

## 3. Vista de datos por rol

La regla de visibilidad la aplica el servidor (§16.1, etapa-3 §5); la UI
solo refleja lo que llega y **nunca** la sustituye.

| Quién | Archivos (orden/trabajo) | Historial de propiedad | Compartir/revocar (§7.5) |
|---|---|---|---|
| Miembro activo de la empresa **dueña** | Ve **todos** los archivos de la orden y de todos sus trabajos (los retirados con `deletedAt`); sube a la orden y a cualquier trabajo | `scope=full`: historial completo + gestión de shares | Sí (sección solo en `full`; el servidor responde 403/404 si la propiedad no es suya) |
| Miembro de **otra empresa** con asignación activa (contratista o profesional, §2.1–§2.3) | Ve los archivos de la orden y **solo de sus trabajos**; sube a la orden y a sus trabajos | `scope=own_jobs` (sin share) o `shared` (con share activo): solo sus trabajos y sus archivos visibles | No |
| Beneficiario de un **share activo** (§7.5) | No tiene lista propia: ve y **descarga** los archivos incluidos en el historial compartido; no sube | `scope=shared`: los mismos registros del dueño (sin `shares[]` ni gestión) | No |
| Miembro sin vínculo con la propiedad/orden | 404 en lista y descarga (sin fuga de existencia, §16.8) | 404 → pantalla «sin acceso» | 403/404 |
| Cuenta con acceso limitado (portal F3) | No navega `/app/*` (guard de sesión) | Idem | Ninguna |

Notas:

- `scope` y `shares[]` los decide el servidor (F5-D2); la UI etiqueta y
  habilita la gestión según ellos, sin inferir pertenencia.
- El **historial propio** (`/me/job-history`) es de sesión: cualquier
  persona autenticada con sus propios trabajos, sin importar espacio
  activo ni estado de la membresía (etapa-3 decisión 10).
- Los payloads de historial **no incluyen** las notas de avance libres
  del profesional (solo resultado y motivos); la UI no las muestra.

## 4. Consumo de la API

Todas las rutas bajo `/api/v1`; el cliente se **genera** desde
`openapi.json` (F5-D1 tipa estas respuestas hoy sin schema). Claves con
el prefijo F0 `['company', …]`; los nombres de hook siguen el patrón de
`src/orders/queries.ts` en el nuevo módulo `src/history/queries.ts`.
`/me/job-history` es de sesión: su clave no lleva `companyId`.

| Endpoint | Pantalla/uso | Query key / invalidación |
|---|---|---|
| `GET …/orders/{orderId}/files` | Detalle de orden: agrupa por destino (card «Archivos» + subsección por job) | `['company', id, 'orders', orderId, 'files']`; invalidar tras cada subida |
| `POST …/orders/{orderId}/files` | Subida a la orden (multipart `file` + `kind`) | invalida la clave de archivos de la orden |
| `POST …/jobs/{jobId}/files` | Evidencia por trabajo (multipart) | idem |
| `GET …/files/{fileId}` | Descarga de bytes: `fetch` con credenciales (same-origin, cookie) → blob → `a.download` (F5-D7); sin caché | sin query (respuesta binaria) |
| `GET …/history/properties/{propId}` | Historial de propiedad (trae `scope` y `shares[]` tras F5-D2) | `['company', id, 'history', 'properties', propId]`; invalidar tras share/revoke |
| `GET …/history/orders` | Tab «Del espacio» | `['company', id, 'history', 'orders']` |
| `GET /me/job-history` | Tab «Mis trabajos» | `['me', 'job-history']` (solo lectura) |
| `POST …/history/shares` | Diálogo «Compartir historial» | invalida el historial de la propiedad |
| `DELETE …/history/shares/{shareId}` | «Revocar» | invalida el historial de la propiedad |
| `GET …/properties` | Join de enlaces en «Del espacio» + entrada «Ver historial» (cache F3) | `['company', id, 'properties']` (sin invalidar) |
| `GET …/members` | Select del diálogo compartir y resolución de nombres de `shares[]` (cache F1) | `['company', id, 'members']` |

Notas de implementación:

- **Subida multipart**: el requestBody del contrato es
  `multipart/form-data: UploadFileDto` (solo `kind`); se construye un
  `FormData` con `file` + `kind` y se envía con el cliente generado
  mediante un cast documentado (`FormData as unknown as UploadFileDto`,
  type-only, en `src/history/queries.ts` con comentario que apunta a
  esta sección). No se escribe ningún tipo de API a mano
  (`frontend/AGENTS.md`).
- Hooks: `useOrderFiles`, `useUploadOrderFile`, `useUploadJobFile`,
  `usePropertyHistory`, `useManagedHistory`, `useMyJobHistory`,
  `useShareHistory`, `useRevokeShare` (patrón `callApi` F0 + `isPending`
  F3; invalidar en éxito **y** en error, como F4 §4).

## 5. Interacciones y transiciones

| Acción | Quién la ve (UI) | Endpoint y errores del servidor que se muestran |
|---|---|---|
| Subir archivo a la orden | Quien ve el detalle (dueña o asignado activo; el servidor lo revalida) | `POST …/orders/{orderId}/files`; 403 «Sin permiso sobre la orden…» (carrera), 404, 415 (tipo fuera de allowlist), 422 (tamaño/campos) → banner con `detail` RFC 7807 |
| Subir evidencia a un trabajo | Dueña (cualquier job visible) o asignado activo de ese job | `POST …/jobs/{jobId}/files`; 403/404/415/422 igual que arriba |
| Descargar archivo | Quien ve la lista/historial con ese archivo | `GET …/files/{fileId}` vía `fetch` → blob; 404 (sin permiso, archivo borrado o carrera) o 503 (storage) → banner `aria-live` sin datos; nunca se destila existencia |
| Compartir historial (§7.5) | Dueña (`scope=full`) | `POST …/history/shares` (diálogo con Select de membresías activas del espacio + las mías, patrón F4 §2.3; nota ≤2000); 403 (propiedad ajena en carrera), 404, 409 (share activo duplicado → banner + refetch), 422 (membresía inactiva → banner + refetch de miembros) |
| Revocar share (§7.5) | Dueña, por fila de `shares[]` | `DELETE …/history/shares/{shareId}`; 404 (ya revocado / de otra empresa) → banner + refetch; el beneficiario pierde el acceso en el siguiente request (§2.12) |
| Ver historial de propiedad | Cualquiera con enlace (§2.6) | `GET …/history/properties/{propId}`; 404 → pantalla «sin acceso» |
| Cambiar de pestaña | Todos | Navegación `?tab=` (sin petición extra si la query ya está cacheada) |

El diálogo «Compartir historial» **excluye del Select las membresías que
ya tienen share activo** (viene en `shares[]`); el 409 sigue mostrándose
en carrera con otro usuario. La nota se trunca en la fila y el texto
completo va en `title`.

## 6. Validación de formularios

Espejo client-side de las reglas del backend (etapa-3 §11); el servidor
manda: ante discrepancia se ve el 415/422 con `detail` del RFC 7807.

- **Subida de archivos** (función pura `src/history/upload-rules.ts`,
  test unitario): `sizeBytes` ∈ (0, 10 MB] (espejo de
  `MAX_FILE_SIZE_BYTES`) y tipo base (sin parámetros `; charset=…`) dentro
  de la allowlist (jpeg, png, webp, pdf, txt, csv y los tres Office
  openxml — 9 tipos). El `<input>` lleva `accept` con esos MIME types.
  El espejo evita la mayoría de 415/422; el 413 de multer (límite de
  express) no está documentado en el contrato (§11) y, si llegara, el
  handler global de errores lo muestra como banner genérico.
- **`kind`** (F5-D6): se infiere del MIME — `image/*` → `photo`, el
  resto → `document`; sin selector en la UI.
- **CreateShareDto**: `propertyId` y `sharedWithMembershipId` uuid (los
  toma la pantalla del payload y del Select), `note` opcional ≤2000
  (vacío → no se envía).

## 7. Criterios de aceptación

- **AC-F5.1** (subida a la orden): Given el detalle de una orden, When
  selecciono un JPG y un PDF válidos, Then cada subida responde 201 con
  `kind=photo`/`kind=document` inferido (F5-D6) y la fila aparece en
  «Archivos de la orden» con nombre, tamaño, fecha y acción «Descargar».
- **AC-F5.2** (evidencia por trabajo §7.1): Given un profesional con
  asignación activa, When sube evidencia a su trabajo, Then aparece en la
  subsección de ese job y la dueña la ve en su lista general; Given la
  dueña, When sube a cualquier job visible, Then se comporta igual.
- **AC-F5.3** (espejo y servidor): Given un archivo >10 MB o con tipo
  fuera de la allowlist, Then la UI muestra el error junto al control sin
  enviar la petición; When el servidor responde 415/422 (carrera), Then
  el `detail` RFC 7807 aparece en el banner y la lista no cambia.
- **AC-F5.4** (permisos de lista §16.5): Given la dueña, Then ve los
  archivos de la orden y de **todos** los jobs; Given un asignado activo,
  Then ve los de la orden y solo de **sus** jobs; When pide vía API un
  archivo de un job ajeno, Then el servidor responde 404 (e2e con
  `request`).
- **AC-F5.5** (descarga): When pulso «Descargar», Then el navegador
  descarga los bytes con el nombre del archivo (same-origin, cookie de
  sesión); Given un archivo con `deletedAt`, Then se muestra «Retirado»
  sin acciones de descarga; When el servidor responde 404/503, Then hay
  banner `aria-live` sin datos del archivo.
- **AC-F5.6** (nada se borra §1.1.8): Given cualquier pantalla de F5,
  Then no existe acción de borrado de archivos en el DOM (e2e con
  aserción negativa); el `DELETE` del contrato queda sin uso en la UI.
- **AC-F5.7** (historial dueño §7.2): Given la dueña en el historial de
  su propiedad, Then el badge dice «Historial completo», las órdenes
  aparecen con sus trabajos (resultado y motivo, sin notas de avance
  libres) y sus archivos descargables, y los títulos de orden enlazan al
  detalle.
- **AC-F5.8** (compartir §7.5): Given la dueña, When comparte la
  propiedad con una membresía activa (nota opcional), Then la fila
  aparece en «Antecedentes compartidos» y el Select excluye esa
  membresía; Given una membresía ya compartida, Then el intento en
  carrera muestra el 409 en banner y refresca.
- **AC-F5.9** (revocar §7.5): When la dueña revoca (confirmación
  destructiva), Then la fila desaparece con el 204; When el beneficiario
  vuelve a consultar, Then recibe 404 y la pantalla «sin acceso» sin
  datos.
- **AC-F5.10** (modo compartido): Given un beneficiario con share activo,
  Then el badge dice «Compartido contigo», ve el historial y descarga
  archivos; Given un usuario sin share ni asignación activa, Then la
  pantalla es «sin acceso».
- **AC-F5.11** (modo solo-trabajos §2.3/§7.2): Given un profesional con
  asignación activa y sin share, Then el badge dice «Solo tus trabajos»,
  el historial contiene solo sus jobs (los ajenos no aparecen) y sus
  archivos visibles; jobs de otros profesionales jamás se renderizan.
- **AC-F5.12** (Del espacio §7.3–§7.4): Given el tab «Del espacio», Then
  se ven las órdenes propias y las gestionadas (incluidas cerradas) con
  trabajos, resultados y motivos; solo las propias (join F3) tienen
  enlaces a detalle e historial.
- **AC-F5.13** (Mis trabajos §7.2): Given un profesional con membresía
  revocada en otra empresa, Then su historial propio sigue mostrando
  esos trabajos cerrados con fechas y motivos, y la dirección enlaza al
  historial de la propiedad (o a la pantalla de sin acceso si el
  servidor responde 404).
- **AC-F5.14** (scope del servidor, F5-D2): Given cualquier visor del
  historial, Then el badge refleja exactamente el `scope` de la
  respuesta; la gestión de shares solo se renderiza en `full`.
- **AC-F5.15** (navegación): Given el shell, Then «Historial» navega a
  `/app/history` (seis items en bottom-nav sin scroll horizontal a 360);
  Given el detalle de propiedad (F3), Then «Ver historial» abre su
  historial; Given el detalle de orden (F4), Then la dirección de la
  propiedad enlaza a su historial.

## 8. Pruebas

**Unitarias (Vitest + Testing Library), gate local:**

- `upload-rules.test.ts` (función pura): allowlist de 9 tipos (con
  parámetros `; charset=` ignorados), tamaño (0, 10 MB], inferencia de
  `kind` (image/* → photo, resto → document).
- `history-page.test.tsx`: pestañas por query string, filas «Del espacio»
  con/sin enlaces según join F3, filas «Mis trabajos» con enlace a
  propiedad, estados de carga/vacío/error.
- `property-history-page.test.tsx`: badges de los tres scope, sección de
  shares solo en `full` (Select filtrado, validación, 409/422 en banner,
  revoke con confirmación), archivos («Retirado», descarga con mock de
  fetch/blob, 404/503 en banner), pantalla de sin acceso.
- `order-detail-files.test.tsx` (o dentro de
  `order-detail-page.test.tsx`): agrupación por destino, subida a orden
  y a job (payload FormData correcto, `isPending`), errores locales y
  banners 403/415/422.
- `files-actions.test.ts` (función pura): agrupación de archivos por
  `targetType`/`targetId` y helper de descarga blob (`fetch` + objectURL
  con `download`), incluido el manejo de 404/503.

**e2e Playwright (`files-history-flows.spec.ts`, 2 viewports × flujos,
CI + gate local; storage `s3rver` en proceso, sin env extra):**

1. Subida en PC (ana): JPG + PDF a la orden → filas visibles →
   «Descargar» dispara el evento `download` con el nombre correcto.
2. Evidencia de trabajo (bob): acepta/inicia su trabajo (helpers F4),
   sube foto a su job → la dueña la ve; petición de carla (miembro
   ajena) al mismo `fileId` → 404 (server manda).
3. Validación local: archivo con tipo no permitido → error sin petición
   de red; `accept` del input presente (viewport móvil ≈ cámara).
4. Historial dueño: detalle de propiedad (F3) → «Ver historial» → badge
  «Historial completo» → compartir con bob (nota) → fila + Select
  filtrado → revocar → fila fuera.
5. Beneficiario y revocación: bob (con share) → badge «Compartido
  contigo» → descarga un archivo del historial; ana revoca → siguiente
  consulta de bob → pantalla «sin acceso».
6. Solo-trabajos: bob sin share con asignación activa → badge «Solo tus
  trabajos»; jobs ajenos ausentes.
7. Mis trabajos: bob → tab → filas con trabajos cerrados → enlace de
  propiedad → historial (scope del servidor).
8. Del espacio: ana → tab → órdenes propias enlazadas (detalle e
  historial); sin scroll horizontal a 360 con seis items de nav.
9. Sin borrado: en detalle e historial no existe acción de borrado
  (aserción negativa sobre el DOM).

## 9. Accesibilidad y responsive

- Mobile-first (360 → 768 → 1280): controles de subida como botón
  apilado full-width en móvil; listados de historial anidados y
  apilados; diálogos del design system (focus trap, Escape, foco
  devuelto al disparador).
- `<input type="file">` oculto con etiqueta-botón enfocable
  (`focus-visible` del design system) y `aria-describedby` hacia el
  error local; el estado «Subiendo…» va en el propio botón
  (`aria-busy`) y los errores del servidor en banner `aria-live`
  (F0-D4).
- Pestañas = enlaces con `aria-current="page"` (sin roving tabindex
  inventado); `h1` único por página (dirección en el historial de
  propiedad; «Historial» en la lista); badges siempre con **texto**, no
  solo color (contraste AA con tokens F0).
- Filas de archivo: nombre completo visible en ≥768 y truncado con
  `title` en 360; el accessible name de la acción de descarga incluye
  el nombre del archivo («Descargar {filename}»).
- bottom-nav con seis items a 360: sin scroll horizontal y sin que la
  etiqueta más larga («Facturación») desborde su celda (verificación en
  el e2e smoke, AC-F0.8).

## 10. Definición de hecho

- Criterio de salida de `frontend_plan.md` F5: **subida y visualización
  funcionales en móvil y PC; los permisos de archivo se respetan
  visiblemente y en servidor; nada se borra (§1.1.8)**.
- Gate `cd frontend && npm run check` verde (lint 0 errores, typecheck,
  unit) y `cd backend && REQUIRE_DOCKER=true npm run check` verde tras
  los cambios F5-D1…F5-D3; CI verde; e2e locales con backend dev +
  `FRONTEND_URL` y buzón de prueba (F0-D5/F1-D4).
- `openapi.json` + `frontend/src/api/generated/schema.ts` regenerados
  tras F5-D1…F5-D3 (los cambios de backend se implementan **primero** y
  con sus tests verdes); ningún tipo de API escrito a mano; el único
  `as` es el cast documentado de `FormData` de §4.
- `README.md` (tabla de documentos) y `frontend_plan.md` (link al
  entregable) actualizados.

## 11. Casos excepcionales

- **401 con sesión expirada**: handler global F0 → `/login?next=…`; una
  subida en vuelo no navega y el archivo se pierde (repetir tras
  relogin).
- **403/404 en una subida** (asignación revocada en vivo): banner con el
  `detail` + refetch de la lista de archivos; el control se retira si la
  nueva respuesta ya no lo permite.
- **415/422 en subida**: banner con el `detail` (el espejo local evita
  la mayoría de los casos; el servidor es la autoridad).
- **413 no documentado** (límite de multer >10 MB): el espejo local corta
  antes; si llegara, el handler global lo muestra como banner genérico
  (§11-reportado).
- **503 storage al subir/descargar** (etapa-3 §11): banner con reintento
  manual (el usuario repite la subida); no se cachean errores.
- **Descarga sin permiso o archivo retirado** (404): banner `aria-live`
  «No tienes acceso a descargar este archivo»; la lista no se modifica y
  jamás se muestra un dato del archivo inaccesible (§16.8).
- **Archivos retirados en la lista** (`deletedAt ≠ null`): badge
  «Retirado» y ninguna acción (§1.1.8 — la UI no borra ni oculta en
  silencio lo que el servidor devuelve).
- **Historial de propiedad 404** (sin share ni asignación activa,
  membresía revocada o propiedad inexistente): pantalla «Historial no
  disponible» sin distinguir casos; la fila de «Mis trabajos» que llevó
  ahí sigue existiendo (la consulta personal nunca depende del scope).
- **`scope=own_jobs` con trabajos históricos**: el payload incluye los
  archivos de trabajos cuya asignación ya terminó, pero la descarga
  exige asignación activa en ese trabajo (o share) → puede haber filas
  cuya descarga responda 404 (§11-reportado); la UI lo resuelve con el
  banner de descarga, sin ocultar el archivo.
- **`shares[]` solo para el dueño** (F5-D2): el beneficiario no ve la
  nota del share (el contrato no le expone campos propios) — el badge
  «Compartido contigo» es toda la información que recibe (§11-reportado).
- **Doble submit de subida**: botón deshabilitado con `isPending`; dos
  archivos idénticos son dos evidencias distintas (el contrato no es
  idempotente en uploads y eso es legítimo).
- **Costos en historial ausentes** (§7.2–§7.4 «costos registrados»): los
  payloads de la Etapa 3 no los incluyen; F5 no muestra montos en
  historial — §11-reportado a backend (candidato a F6).
- **`DELETE …/files/{fileId}` sin UI** (criterio «nada se borra»):
  endpoint disponible pero no ofrecido — §11-reportado.
- **Historiales sin límite documentado**: `history/orders` y
  `/me/job-history` no documentan paginación ni `take` (§11-reportado);
  F5 renderiza la lista completa que llega, en el orden del servidor.
- **Beneficiario sin membresía activa**: el share requiere membresía
  destino activa (422 en creación); si la membresía se desactiva
  después, el `activeMembershipIds` del servidor excluye el share y el
  beneficiario queda fuera de scope (404) — comportamiento del servidor,
  la UI solo lo refleja.
