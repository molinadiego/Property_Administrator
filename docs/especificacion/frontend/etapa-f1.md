# Especificación técnica — Etapa F1 (frontend)

Etapa F1 del plan maestro (`frontend_plan.md`): **cuentas, invitaciones y
espacios**. Construye sobre lo entregado en F0 (`docs/especificacion/frontend/etapa-f0.md`):
sesión con `GET /auth/me`, guards (`RequireGuest`/`RequireSession`/
`RequireActiveCompany`), handler global de 401, selector de espacio persistente,
vista «sin espacios» y design system.

La spec **no redefine la API**: la consume tal como la documenta el contrato
`backend/openapi/openapi.json` y las specs backend de la Etapa 1
(`docs/especificacion/etapa-1.md` §4, matriz §6). Las reglas de negocio se
referencian por § a `proyect.md`, nunca se copian.

Base normativa: §2.1–§2.4 (tipos de participantes y espacios), §3.1
(registro), §3.2 (invitaciones conceden acceso y permisos del espacio),
§3.3 (revocación sin borrar cuenta ni historial), §3.4 (separación entre
empresas; el servidor verifica), §16.1.

> **Pendiente de aprobación por el dueño** (spec-driven, `AGENTS.md`).
> Redactada el 20/10/2026.

---

## 1. Alcance

### 1.1 Entra / queda fuera

**Entra:**

- **Registro** (`POST /auth/register`): pantalla pública `/register`.
- **Recuperación de contraseña**: `/forgot-password` (`POST /auth/password/
  forgot`, 202 siempre) y `/reset-password?token=…`
  (`POST /auth/password/reset`, el link que el backend genera como
  `{FRONTEND_URL}/reset-password?token=…`).
- **Invitaciones — lado público** (`frontend_plan.md` F1): ruta
  `/invitations/:token` que consume `GET /invitations/{token}` (preview:
  empresa, email enmascarado, rol, expiración) y `POST /invitations/{token}/
  accept`; acepta con cuenta existente (con sesión) o creando una nueva
  (sin sesión, `{name, password}` — el backend crea cuenta **y** sesión).
- **Invitaciones — lado owner** (F1-D1, aprobado 20/10/2026): en la
  pantalla Miembros, crear invitación (`POST /companies/{id}/invitations`),
  lista de invitaciones con estado (`GET …/invitations?status=`) y revocar
  pendientes (`DELETE …/invitations/{invId}`).
- **Creación de espacio** (`POST /companies`) desde la vista «sin espacios»
  y desde el selector; los 3 participantes de §2 (F1-D2).
- **Pantalla Miembros** dentro de Ajustes: lista de miembros activos
  (`GET /companies/{id}/members`), cambio de rol
  (`PATCH …/members/{membershipId}`, owner-only) y retiro de acceso
  (`DELETE …/members/{membershipId}`, owner-only; §3.3).
- **Contrato tipado (F1-D3, aprobado 20/10/2026)**: extender la Opción A en
  el backend — DTOs de respuesta documentados (estilo commit `d971aaf`) para
  lista de miembros, lista de invitaciones y previsualización de invitación,
  más `openapi.json` y cliente del frontend regenerados. Sin cambio de
  comportamiento del backend.

**Queda fuera:**

- Cambiar contraseña con sesión activa (el plan solo pide recuperación/reset).
- Baja de cuenta personal, transferencia de ownership, gestión de plan ni
  ajustes del espacio (F8). Roles: solo `owner`/`member` (contrato §3).
- Correos: el frontend no envía email; consume los links que el backend
  envía (F1-D4 define cómo se prueban).
- Auditoría desde UI (F8). Portal de acceso limitado (F3).

### 1.2 Decisiones de diseño

| # | Decisión |
|---|---|
| **F1-D1** | **Invitaciones completas en F1** (aprobada 20/10/2026): la pantalla Miembros ofrece al `owner` «Invitar miembro» (email + rol), la lista de invitaciones con su estado (`pending`/`accepted`/`revoked`/`expired`) y revocación de pendientes. Cierra el ciclo de invitaciones de la Etapa 1 del backend. |
| **F1-D2** | **Tipos de espacio**: el formulario ofrece los 3 participantes de §2 — Administradora → `property_management`, Contratista → `contractor`, Profesional independiente → `own_business`. El cuarto valor del enum (`profesional`, herencia de la Etapa 1) es legacy del backend: mismo concepto que `own_business` y mismo plan §15 — **no se ofrece en la UI**. |
| **F1-D3** | **Opción A extendida** (aprobada 20/10/2026): documentar en backend los DTOs de respuesta que F1 consume, para respetar «cliente API solo generado desde `openapi.json`». |
| **F1-D4** | **e2e con email (enmendada 20/10/2026, ver §12)**: el transporte `console` del backend, además del log enmascarado, **adjunta el email completo a un archivo de buzón** cuando `EMAIL_OUTBOX_FILE` está definida (solo dev/CI; producción sigue en Resend, sin cambio). Los tests Playwright de token (invitación y reset) leen los links de ese archivo (JSONL, entrada por email), con **emails únicos por corrida** → paralelo y reintentos seguros. De paso el enmascarado del transporte console se extiende a tokens en path (`/invitations/<token>`), para cumplir Etapa 1 §11 («tokens nunca en logs de la aplicación»). Localmente, si no hay archivo de buzón (backend real con Resend), **esos tests se omiten** (resto corre; patrón F0-D5). |
| **F1-D5** | **Sesiones según flujo**: el registro **no** crea sesión (backend 201 sin cookie) → éxito lleva a `/login`. Aceptar invitación sin sesión crea cuenta **y** sesión (cookie) → se entra directo. Con sesión activa, aceptar une la cuenta vigente y redirige a `/` (F0-D1 decide auto-selección o picker con la membresía nueva). |
| **F1-D6** | **Rutas**: guest-only `/register`, `/forgot-password`, `/reset-password`; pública (con o sin sesión) `/invitations/:token`; `/login?next=/ruta-interna` redirige tras login **solo a rutas internas** (para volver a la invitación). Miembros vive en Ajustes: `/app/settings/members` (F1-D7). |
| **F1-D7** | **Ubicación de Miembros**: la sección Ajustes del shell deja de ser placeholder para `/app/settings`, que redirige a su primer panel real, `members`; el resto de ajustes sigue «próximamente» (F8). No se agrega ítem de navegación nuevo (mobile bottom-nav ya tiene 5 entradas). |

## 2. Pantallas y flujo

| Ruta | Acceso | Contenido y estados |
|---|---|---|
| `/register` | guest | Formulario nombre / email / contraseña (8–200, F1-D5 espejo del DTO). Éxito (201) → mensaje «cuenta creada» + `/login`. 409 → `detail` bajo el email. |
| `/forgot-password` | guest | Email → 202 **siempre**: mensaje único «si existe una cuenta con ese email, recibirás un enlace». Nunca distingue existencia (Etapa 1 AC-1.7). |
| `/reset-password?token=…` | guest | Contraseña nueva → 204 → éxito + `/login` (las sesiones del usuario quedan revocadas, Etapa 1 §4). Token inválido/expirado (404/410) → pantalla de error accionable con salida a `/forgot-password`. Sin `token` en la URL → 404 de la app. |
| `/invitations/:token` | pública | Preview (empresa, email enmascarado, rol, expira). **Con sesión**: «Unirme a {empresa}» → accept → `/`. **Sin sesión**: «Ya tengo cuenta» → `/login?next=/invitations/:token`; «Crear cuenta y unirme» (nombre + contraseña) → accept (crea cuenta+sesión) → `/`. 404/410/409 → estado correspondiente sin filtrar datos. |
| `/app/settings` | sesión + espacio | Redirige a `/app/settings/members` (F1-D7). |
| `/app/settings/members` | sesión + espacio activo | Tabla de miembros (nombre, email, rol, fecha). Owner: «Invitar miembro», cambiar rol, «Retirar acceso» (diálogo de confirmación) e invitaciones pendientes con «Revocar». Member: solo lectura. Estados: carga (skeleton), vacío imposible (siempre hay ≥1 miembro: el llamador), 404 del espacio → picker (F0-D1), 401 global (F0-D2). |
| Crear espacio | dentro de la vista «sin espacios» y del selector | Modal/formulario: nombre + tipo (3 opciones F1-D2). 201 → invalidar `me` → F0-D1 auto-selecciona el espacio nuevo (único o el recién creado). |

Responsive: en 360 px la tabla de miembros y la lista de invitaciones se
apilan como tarjetas (mismo componente, layout por breakpoint); el diálogo de
retiro usa el modal del design system (F0).

## 3. Vista de datos por rol

- **Cualquier miembro activo** ve la lista de miembros del espacio (§3.2: la
  membresía da acceso al espacio y a sus permisos, a nada más).
- **`owner`** ve y usa invitar / cambiar rol / retirar / revocar invitación;
  el servidor exige `owner` en cada operación (matriz Etapa 1 #4, #5:
  `member` → 403). **La UI oculta las acciones para `member`, sin sustituir
  la verificación del servidor (§3.4, §16.1)** — se prueba contra la API real.
- **Último `owner`**: no puede degradarse ni retirarse a sí mismo (409,
  matriz Etapa 1 #8/#9); la UI deshabilita ambas acciones en ese caso y
  muestra el `detail` del 409 si el servidor igual responde así.
- **Miembro revocado en vivo**: su siguiente llamada al espacio responde 404
  (matriz #6) → el flujo F0 lo devuelve al picker y `me` deja de incluir la
  membresía; su **cuenta personal queda intacta** (§3.3) y puede seguir
  iniciando sesión.
- **Usuario sin espacios** (recién registrado, §3.1): la vista «sin
  espacios» de F0 ahora ofrece crear su espacio (§2). Cualquier tipo de
  participante puede crear su espacio (§3.1).

## 4. Consumo de la API

| Endpoint (contrato) | Pantalla | TanStack Query |
|---|---|---|
| `POST /auth/register` | `/register` | mutation; éxito → `/login` (sin cache nueva) |
| `POST /auth/password/forgot` | `/forgot-password` | mutation; éxito → mensaje (202 siempre) |
| `POST /auth/password/reset` | `/reset-password` | mutation; éxito → `/login` |
| `GET /invitations/{token}` | `/invitations/:token` | `['invitation', token]` (funciona con y sin sesión) |
| `POST /invitations/{token}/accept` | `/invitations/:token` | mutation → invalidar `['me']` → `/` (F0-D1) |
| `POST /companies` | crear espacio | mutation → invalidar `['me']` → auto-selección/picker |
| `GET /companies/{id}/members` | Miembros | `['company', companyId, 'members']` (convención F0 de invalidación al cambiar de espacio) |
| `PATCH /companies/{id}/members/{membershipId}` | cambio de rol | mutation → invalidar `members`; si la membresía es la del llamador, invalidar `['me']` (su rol cambió) |
| `DELETE /companies/{id}/members/{membershipId}` | retiro (diálogo) | mutation → invalidar `members`; si es self → también `['me']` y salida al picker |
| `POST /companies/{id}/invitations` | invitar | mutation → invalidar `['company', id, 'invitations']` (409: duplicada) |
| `GET /companies/{id}/invitations?status=pending` | lista invitaciones | `['company', id, 'invitations', 'pending']` |
| `DELETE /companies/{id}/invitations/{invId}` | revocar | mutation → invalidar `invitations` |

Los tipos de respuesta salen **solo** del cliente generado (F1-D3); en
`src/api/types.ts` solo aliases de `components['schemas'][…]` (patrón F0).

## 5. Interacciones y transiciones

- Sin máquina de estados §20 en esta etapa; las acciones son mutaciones
  puntuales. Botones con estado pendiente (doble submit bloqueado) y
  éxito confirmado en pantalla.
- **Retirar acceso** exige diálogo de confirmación (nombre del miembro
  visible); §3.3: no borra cuenta ni historial — el copy lo dice.
- **Cambiar rol**: select por miembro (owner↔member); en el último owner,
  deshabilitado (F1 §3).
- Errores del servidor: 409/403/404 muestran `detail` o mensaje de estado
  (F0-D4); 422 bajo el campo; 401 → login (global F0-D2). Ningún error
  revela datos de otros espacios (§3.4).
- Tras **retirarse a sí mismo** (permitido si no es el último owner) o ser
  retirado, el flujo F0 de memberships en `me` lleva al picker o a la vista
  «sin espacios», según corresponda.

## 6. Validación de formularios

Espejo client-side (zod) de los DTO del backend; **el servidor manda**: ante
discrepancia, el 422 con `detail` gana y se muestra bajo el campo (F0-D4).

| Form | Reglas espejo (DTO backend) |
|---|---|
| Registro | email válido; nombre 1–200; contraseña 8–200 |
| Olvidé mi contraseña | email válido |
| Nueva contraseña | contraseña 8–200; `token` presente en la URL |
| Crear espacio | nombre 1–200; tipo ∈ {`property_management`, `contractor`, `own_business`} (F1-D2) |
| Invitar | email válido; rol ∈ {`owner`, `member`} |
| Cambiar rol | rol ∈ {`owner`, `member`} |

## 7. Criterios de aceptación

- **AC-F1.1** Dados nombre/email/contraseña válidos, cuando el visitante se
  registra, entonces 201, se muestra éxito y se navega a `/login` (sin
  sesión creada, F1-D5); con email existente, 409 con `detail` junto al
  email (§3.1).
- **AC-F1.2** Cuando se envía `/forgot-password` con cualquier email, entonces
  siempre el mismo mensaje de éxito (202; nunca revela existencia,
  Etapa 1 AC-1.7).
- **AC-F1.3** Dado un token de reset válido, cuando se envía la contraseña
  nueva, entonces 204 y las sesiones del usuario quedan revocadas (Etapa 1
  §4); con token inválido o expirado, pantalla de error accionable
  (404/410) sin cambios de contraseña.
- **AC-F1.4** Dada una invitación pendiente, cuando su destinatario con
  sesión la acepta, entonces 204, su cuenta queda como miembro del espacio
  con el rol invitado (§3.2) y cae en `/` con ese espacio disponible
  (F0-D1).
- **AC-F1.5** Dada una invitación pendiente sin sesión, cuando el
  destinatario crea la cuenta desde la pantalla, entonces 204, queda
  autenticado (cookie) y miembro del espacio (F1-D5).
- **AC-F1.6** Cuando el token de invitación es inválido/revocado (404),
  expirado (410) o ya aceptado (409), entonces la pantalla muestra ese
  estado sin datos de la empresa más allá del preview público.
- **AC-F1.7** Dado un `owner`, cuando crea un espacio con nombre y uno de
  los 3 tipos de §2, entonces 201, queda como `owner` y el espacio queda
  activo en la UI (F1-D2); el tipo `profesional` no se ofrece en la UI.
- **AC-F1.8** Dado un miembro activo, cuando abre Miembros, entonces ve la
  lista completa (nombre, email, rol, fecha); un `member` no ve acciones de
  owner — y si las invoca contra la API, el servidor responde 403
  (matriz Etapa 1 #4/#5; §3.4, §16.1).
- **AC-F1.9** Dado un `owner`, cuando cambia el rol de un miembro, entonces
  200 y el nuevo rol se refleja en la lista; cuando el último `owner` se
  degrada a sí mismo, entonces la UI lo impide y el 409 del servidor se
  muestra como `detail` (matriz #9).
- **AC-F1.10** Dado un `owner`, cuando retira el acceso de un miembro en
  vivo, entonces 204, sale de la lista, su siguiente llamada al espacio
  responde 404 (matriz #6) y **su cuenta personal sigue existiendo** —
  puede iniciar sesión y verá la vista «sin espacios» (§3.3).
- **AC-F1.11** Dado un `owner`, cuando invita un email, entonces 201 y
  aparece como `pending`; invitar el mismo email otra vez → 409; revocar →
  204 y desaparece (F1-D1).
- **AC-F1.12** Cuando cualquier mutación responde 401 (sesión expirada), el
  usuario llega a `/login` y tras iniciar sesión vuelve a la ruta interna
  (F0-D2, F1-D6); ninguna pantalla muestra datos de otro espacio en error.

## 8. Pruebas

- **Unit/componente (Vitest + Testing Library):**
  - Formularios: validación zod (campos vacíos, email inválido, contraseña
    corta), 422 con `detail` bajo el campo, doble submit bloqueado.
  - `/forgot-password`: el mensaje de éxito es único con email existente o
    no (AC-F1.2, con la respuesta mockeada igual que la real: 202).
  - `/invitations/:token`: preview + acción según sesión (con/sin sesión,
    404/410/409).
  - Miembros: render por rol (owner ve acciones, member no), último owner
    con acciones deshabilitadas, diálogo de retiro.
  - Crear espacio: solo los 3 tipos de §2 en el formulario (F1-D2).
- **e2e Playwright (API real, sin mocks del permiso):**
  - Flujo cuenta: registro → login → crear espacio → entrar.
  - Flujo invitación completo (F1-D4): owner invita con email único → el
    link se lee del archivo de buzón del backend (`EMAIL_OUTBOX_FILE`) →
    segundo contexto acepta creando cuenta → ambos ven el espacio; miembros
    refleja a los dos.
  - Flujo reset (F1-D4): registro de un usuario único → forgot → link del
    buzón → nueva contraseña → login con la nueva; la vieja queda
    invalidada. (Usuario único por corrida: nunca se muta la contraseña de
    los usuarios de la semilla, que otros tests usan en paralelo.)
  - Flujo revocación: el miembro creado por el flujo de invitación (email
    único de la corrida) es retirado por el owner → ese contexto pierde el
    espacio (vista «sin espacios») mientras el owner lo ve fuera de la
    lista.
  - Local: si no hay `../backend-e2e.log`, los tests de token hacen `skip`
    documentado (F0-D5); el gate local siempre corre lint + typecheck +
    unit.
- Contrato: regenerar cliente (`npm run openapi:generate`) tras la Opción A
  (F1-D3); el typecheck falla si el cliente quedó viejo.

## 9. Accesibilidad y responsive

- Mobile-first: tablas → tarjetas apiladas en 360 px; el modal de retiro y
  el formulario de invitar usan el design system F0 (focus trap, Escape).
- Labels asociados en todos los inputs; errores de campo con `aria-describedby`
  y banners generales con `aria-live="polite"`.
- Estados de carga (skeleton), vacío (con acción sugerida), error (retry) y
  sin permiso (mensaje, sin acciones) en cada pantalla.
- Navegación completa por teclado; foco visible (tokens F0); contraste AA.

## 10. Definición de hecho

- Los flujos de cuenta e invitación funcionan de punta a punta con email de
  prueba (F1-D4: console transport en CI, Resend sandbox en manual) —
  criterio de salida de `frontend_plan.md` F1.
- La UI muestra/oculta acciones según rol sin sustituir la verificación del
  servidor: los e2e prueban contra la API real (§3.4, §16.1).
- Contrato regenerado (F1-D3) y gate `cd frontend && npm run check` verde
  en local; CI verde (3 jobs: backend, frontend-check, frontend-e2e).

## 11. Casos excepcionales

- **Token de invitación manipulado o de otra instancia**: 404 → pantalla de
  estado con salida a `/`; nunca un stack trace ni datos.
- **Invitación revocada después del preview**: el accept responde 404 → la
  pantalla vuelve a cargar el estado (F1 §5).
- **Doble submit** en cualquier mutación: botón deshabilitado mientras
  pendiente; si el servidor recibe dos, el segundo 409 no rompe la UI.
- **Retirarse a sí mismo** (no último owner): permitido con confirmación;
  el flujo F0 lleva al picker o a «sin espacios» según sus membresías.
- **Reset con sesión activa** (p. ej. el dueño probando el link): el reset
  revoca **todas** las sesiones (Etapa 1 §4); la app en curso recibe 401 →
  login (F0-D2), sin crashes.
- **Invitar a un email ya miembro o ya invitado**: 409 con `detail` del
  servidor, sin fugas de información (§3.4).
- **Usuario revocado con sesión viva**: toda llamada a ese espacio → 404
  (matriz #6); la UI nunca muestra datos cacheados del espacio tras la
  revocación (invalidación por prefijo `['company', id, …]` al salir).
- **`?next=` inválido en `/login`** (ruta externa o `//…`): se ignora y se
  cae al destino por defecto (F0-D1) — nunca redirigir fuera del origen.
- **Email en el e2e**: el archivo de buzón (`EMAIL_OUTBOX_FILE`) solo existe
  en el job `frontend-e2e` (dev/CI, datos ficticios); los tests lo leen como
  artefacto de la corrida, nunca como fuente de verdad en producción. El log
  de la aplicación nunca contiene tokens (Etapa 1 §11; el enmascarado del
  transporte console cubre `token=` y los tokens en path).

## 12. Nota de ejecución (enmienda F1-D4, 20/10/2026)

Al implementar el e2e de token se detectó que el plan original de F1-D4 (leer
los links del log `../backend-e2e.log`) no podía cumplirse: el transporte
`console` enmascara `token=…`, por lo que el link de reset resultaba ilegible;
el de invitación (`/invitations/<token>`) solo era legible por un hueco del
enmascarado que contradice Etapa 1 §11. El dueño aprobó el 20/10/2026 el
ajuste (opción «buzón de prueba en archivo»):

1. **Backend, sin cambio de comportamiento de producto**: `ConsoleEmailTransport`
   acepta la env var opcional `EMAIL_OUTBOX_FILE` y adjunta cada email completo
   (JSONL) a ese archivo cuando está definida; producción (Resend) no la usa.
2. **Backend, corrección de §11**: el enmascarado del log del transporte console
   se extiende a tokens en path (`/invitations/<token>`), además de `token=`.
3. **CI**: el job `frontend-e2e` define `EMAIL_OUTBOX_FILE` para el backend.
4. **e2e**: los tests usan emails únicos por corrida (paralelo y reintentos
   seguros) y hacen `skip` cuando el archivo no existe (local con Resend).
