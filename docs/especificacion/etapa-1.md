# Especificación técnica — Etapa 0 y Etapa 1

Documento de implementación de la **Etapa 0 (fundamentos)** y la **Etapa 1 (base del sistema)** del `docs/plan.md`, derivado de `proyect.md` (requisitos aprobados v1.0). Las referencias (§x) apuntan a `proyect.md`.

**Fuera de alcance de esta etapa:** propiedades, órdenes, asignaciones, notificaciones in-app, cuentas con acceso limitado (Etapa 2), costos, facturas, PDF/Excel, suscripciones. Ningún endpoint de esta etapa maneja dinero.

---

## 1. Etapa 0 — checklist de arranque

- [ ] Proyecto NestJS + TypeScript (Node LTS), ESLint + Prettier.
- [ ] Docker compose: PostgreSQL 16 + MinIO (MinIO queda preparado, sin usar hasta Etapa 3).
- [ ] Prisma: `schema.prisma` inicial, migración base, seed de desarrollo.
- [ ] ConfigModule con esquema de variables validado al arrancar (fallar si falta algo).
- [ ] pino + interceptor de logging con `requestId` por request.
- [ ] Exception filter global con formato RFC 7807 (ver §4).
- [ ] Jest + supertest + Testcontainers: los tests de integración levantan PostgreSQL real.
- [ ] Swagger en `/api/docs` (en producción: protegido con login).
- [ ] CI (GitHub Actions): lint + tests en cada PR.
- [ ] Estructura de módulos: `auth`, `users`, `companies`, `memberships`, `invitations`, `audit`.

**Criterio de salida:** `docker compose up` + `npm run start:dev` levantan la API; `/api/docs` muestra el endpoint health-check; CI verde con un test de integración real.

---

## 2. Modelo de datos

Convenciones: `id` UUID (generados en la app), timestamps `timestamptz` en UTC, `created_at`/`updated_at` en todas las tablas. **`company_id` presente en toda tabla con datos tenant-scoped** (regla transversal de `docs/stack.md`). Las tablas de identidad (`users`) no llevan `company_id`: una persona puede pertenecer a varias empresas (§2.4).

### 2.1 `users` — cuenta personal

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| email | text unique (lowercase) | normalizado a minúsculas al escribir |
| password_hash | text | Argon2id |
| name | text | |
| phone | text null | |
| locale | text | `'es'` \| `'en'`, default `'es'` |
| status | enum | `'active'` (v1; sin borrado físico) |
| created_at / updated_at | timestamptz | |

La cuenta personal **nunca se borra** al revocar accesos (§3.3): solo cambia el estado de sus membresías.

### 2.2 `companies` — espacios de trabajo

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text | |
| type | enum | `'property_management'` (administradora) \| `'contractor'` (contratista) \| `'profesional'` (negocio propio, §3.1) |
| created_by | uuid FK → users | el creador queda como `owner` |
| created_at / updated_at | timestamptz | |

Todo espacio es "una empresa" para efectos del modelo. El negocio propio de un profesional es un espacio de tipo `profesional` (§2.4).

### 2.3 `memberships` — usuario ↔ empresa ↔ rol

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | índice |
| user_id | uuid FK → users | índice |
| role | enum | `'owner'` \| `'member'` |
| status | enum | `'active'` \| `'revoked'` |
| invited_by | uuid null FK → users | |
| created_at | timestamptz | |
| revoked_at | timestamptz null | |

- **Unique (company_id, user_id)**: una persona es miembro una sola vez por empresa; al ser revocada y reinvitada, se reactiva la misma fila (se preserva `created_at` original y se registra cada revocación en el audit log).
- `role` en la v1 es deliberadamente mínimo (`owner`/`member`): `owner` administra el espacio (invitar, revocar, cambiar roles); `member` opera dentro de él. Los permisos sobre datos concretos (órdenes, trabajos) no salen del rol sino de la relación con el recurso, que llega en Etapa 2. Si se necesitan roles más finos, se extiende el enum sin romper el modelo.

### 2.4 `invitations`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | índice (company_id, status) |
| email | text | email invitado |
| role | enum | `'owner'` \| `'member'` |
| token_hash | text unique | se envía un token aleatorio por email; en DB solo su hash |
| status | enum | `'pending'` \| `'accepted'` \| `'revoked'` \| `'expired'` |
| invited_by | uuid FK → users | |
| expires_at | timestamptz | 7 días |
| accepted_at / accepted_by | | |
| created_at | timestamptz | |

### 2.5 `sessions`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | índice |
| token_hash | text unique | la cookie lleva el token; la DB solo el hash |
| created_at | timestamptz | |
| expires_at | timestamptz | 30 días, renovación deslizante con `last_seen_at` |
| last_seen_at | timestamptz | |
| revoked_at | timestamptz null | logout, reset de contraseña, revocación manual |
| ip / user_agent | text null | |

### 2.6 `audit_log` — append-only (§12)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid null FK → companies | eventos de cuenta personal (registro, login) van en `null` |
| actor_type | enum | `'user'` \| `'system'` |
| actor_user_id | uuid null | quién realizó la acción (§12: "quién y cuándo") |
| action | text | ver §7 |
| entity_type | text | `'user'`, `'company'`, `'membership'`, `'invitation'`, `'session'` |
| entity_id | uuid | |
| payload | jsonb | detalle del cambio (antes/después donde aplique) |
| created_at | timestamptz | default `now()`, índice (company_id, created_at DESC) |

**Inmutabilidad:** la aplicación solo tiene permiso de INSERT y SELECT sobre `audit_log` (el rol de BD no tiene UPDATE/DELETE en esa tabla). No existen endpoints de modificación ni borrado. Es la implementación de "mantener el historial de acciones relevantes" (§16.7) y "no borrar silenciosamente" (§1.1.8).

### 2.7 Índices globales

- `memberships(user_id)`, `memberships(company_id)`
- `invitations(token_hash)` unique, `invitations(company_id, status)`
- `sessions(user_id)`, `sessions(expires_at)` (para purga de expiradas)
- `audit_log(company_id, created_at DESC)`, `audit_log(entity_type, entity_id)`

---

## 3. Convenciones de la API

- **Prefijo:** `/api/v1`.
- **Sesión:** cookie `mh_session` — `HttpOnly`, `Secure`, `SameSite=Lax`. Nunca tokens en headers/localStorage.
- **Permisos:** se evalúan **en cada request** contra `memberships` (estado + rol). No se codifican en la cookie ni en un JWT. Revocar acceso (§3.3) surte efecto en el request siguiente.
- **Aislamiento tenant:** todo recurso con `company_id` se resuelve dentro del contexto de la empresa del request; el tenant guard garantiza que ninguna query cruce empresas (§3.4, §16.2).

### Códigos de estado

| Caso | Código |
|---|---|
| Sin sesión válida | 401 |
| Sesión válida, rol insuficiente **dentro de la propia empresa** | 403 |
| Recurso de **otra empresa** o membresía revocada (ya no es miembro) | 404 — no se filtra la existencia de datos ajenos |
| Validación de DTO | 422 |
| Conflicto (email duplicado, último owner, invitación existente) | 409 |
| Invitación expirada | 410 |
| Login con credenciales inválidas | 401 genérico (sin detalle de por qué) |
| Demasiados intentos de login | 429 |

### Formato de error (RFC 7807)

```json
{
  "type": "https://api.home-management.dev/errors/forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "El rol 'member' no puede invitar usuarios.",
  "instance": "/api/v1/companies/abc/invitations",
  "requestId": "01J..."
}
```

### Paginación

Endpoints de listas: `?limit=50&cursor=...` (cursor opaco basado en `created_at, id`), respuesta `{ data: [...], nextCursor: string | null }`. Aplica a invitaciones y audit log.

---

## 4. Endpoints

Todos los documentados con decoradores `@nestjs/swagger` y visibles en `/api/docs`.

### 4.1 Auth

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/auth/register` | Crea cuenta personal (no crea empresa; el espacio propio se crea después, §3.1) | público | 201 |
| POST | `/auth/login` | Inicia sesión, setea cookie | público | 200 |
| POST | `/auth/logout` | Revoca la sesión actual | sesión | 204 |
| GET | `/auth/me` | Usuario + membresías activas con rol y empresa | sesión | 200 |
| POST | `/auth/password/forgot` | Envía link de reset | público | 202 siempre (no revela existencia) |
| POST | `/auth/password/reset` | Cambia contraseña con token; **revoca todas las sesiones** del usuario | token | 204 |

### 4.2 Empresas

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/companies` | Crea un espacio; el creador queda `owner` | sesión | 201 |
| GET | `/companies` | Espacios del usuario (membresías activas) | sesión | 200 |
| GET | `/companies/:id` | Detalle del espacio | miembro activo | 200 / 404 |
| PATCH | `/companies/:id` | Editar nombre | `owner` | 200 / 403 / 404 |
| GET | `/companies/:id/members` | Miembros activos con rol | miembro activo | 200 / 404 |
| PATCH | `/companies/:id/members/:membershipId` | Cambiar rol | `owner` | 200 / 403 / 404 / 409 |
| DELETE | `/companies/:id/members/:membershipId` | **Revocar acceso** al espacio (§3.3) | `owner` | 204 / 403 / 404 / 409 |

Reglas especiales:
- No se puede revocar ni degradar al **último `owner`** de una empresa → 409.
- DELETE **no borra** la cuenta personal ni registros históricos (§3.3); solo cambia `memberships.status` a `revoked` y registra en audit log.

### 4.3 Invitaciones

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| POST | `/companies/:id/invitations` | Crea invitación y envía email con token | `owner` | 201 / 403 / 409 |
| GET | `/companies/:id/invitations` | Lista (paginada, filtrable por status) | `owner` | 200 / 404 |
| DELETE | `/companies/:id/invitations/:invId` | Revoca invitación pendiente | `owner` | 204 / 404 |
| GET | `/invitations/:token` | Previsualización pública: nombre de la empresa y email enmascarado | público | 200 / 404 / 410 |
| POST | `/invitations/:token/accept` | Acepta: con sesión activa, une esa cuenta; sin sesión, recibe `{name, password}`, crea la cuenta y la une | token | 204 / 404 / 409 / 410 |

Reglas (§3.2):
- La invitación concede **solo** el espacio y el rol indicado — nunca acceso a registros privados de otras relaciones.
- Si la cuenta ya es miembro → 409 (unique constraint).
- El payload del audit log guarda email invitado y cuenta que aceptó, por si difieren.

### 4.4 Audit log

| Método | Ruta | Descripción | Permiso | Éxito |
|---|---|---|---|---|
| GET | `/companies/:id/audit-log` | Historial paginado, filtros `action`, `entity_type`, `from`, `to` | miembro activo | 200 / 404 |

**No hay** endpoints de crear/modificar/borrar entradas. Solo lectura.

---

## 5. Reglas de permisos (resumen normativo)

1. Ninguna operación sensible se ejecuta sin verificar permiso en el servidor (§16.1). Ocultar en la interfaz no cuenta (§3.4).
2. Toda query de datos de empresa pasa por el tenant guard; el `company_id` no se acepta desde el cliente sino que deriva de la membresía del usuario (§16.2, §16.8).
3. El estado de la membresía se lee en cada request: revocación efecto inmediato (§3.3, §16.6).
4. Revocar acceso no elimina la cuenta personal, el negocio propio ni registros históricos (§3.3).
5. Una invitación solo concede su espacio y rol, sin atajos a información privada (§3.2).
6. Toda acción relevante de esta etapa queda en `audit_log` con actor y fecha (§12, §1.1.5).

---

## 6. Matriz de permisos como tests de integración (§16.1)

Tests con Testcontainers + PostgreSQL real. **Si un escenario falla, no se pasa de etapa.**

| # | Escenario | Esperado |
|---|---|---|
| 1 | Request autenticado sin sesión | 401 |
| 2 | Usuario de empresa A: `GET /companies/:idB` | 404 (no 403: no se revela existencia) |
| 3 | Usuario de empresa A: `PATCH`/`DELETE` sobre empresa B | 404 |
| 4 | Miembro con rol `member` intenta invitar | 403 |
| 5 | Miembro con rol `member` intenta revocar a alguien | 403 |
| 6 | Usuario revocado con sesión viva llama a su ex-empresa | 404 (la membresía revocada = no miembro, efecto inmediato) |
| 7 | Antes/después de una revocación, sin re-login | primer request 200, segundo 404 |
| 8 | `owner` intenta revocarse a sí mismo siendo el último | 409 |
| 9 | `owner` intenta degradarse a `member` siendo el último | 409 |
| 10 | Invitación con token inválido o revocado | 404 |
| 11 | Invitación expirada | 410 |
| 12 | Aceptar invitación cuando la cuenta ya es miembro | 409 |
| 13 | Aceptar invitación sin sesión (crea cuenta) y volver a aceptar | 204 la primera, 409 la segunda |
| 14 | Registro con email existente | 409 |
| 15 | Login con credenciales inválidas | 401 genérico, sin detalle |
| 16 | N intentos fallidos de login | 429 |
| 17 | Reset de contraseña válido | 204 + todas las sesiones del usuario → 401 después |
| 18 | Logout y luego reusar la cookie | 401 |
| 19 | Miembro activo lee `audit-log` de su empresa | 200 |
| 20 | Miembro activo lee `audit-log` de otra empresa | 404 |
| 21 | Cada acción relevante genera su entrada con `actor_user_id` y `created_at` correctos | aserción por acción (ver §7) |
| 22 | No existen rutas de escritura sobre `audit-log` (intentar POST/PUT/PATCH/DELETE) | 404/405 |
| 23 | La app no puede UPDATE/DELETE filas de `audit_log` (prueba de grants de BD) | error de permiso de BD |
| 24 | `GET /auth/me` de un usuario con 2 espacios | lista exactamente sus 2 membresías activas, ninguna ajena |

---

## 7. Eventos de audit log de la Etapa 1

Mínimo exigido por §12 ("cambios de permisos y revocaciones de acceso") y §1.1.5 ("quién y cuándo"):

| `action` | `entity_type` | Cuándo |
|---|---|---|
| `user.registered` | user | registro de cuenta |
| `auth.login` / `auth.logout` | session | acceso (logout es opcional pero recomendado por auditoría) |
| `auth.password_reset` | user | cambio de contraseña |
| `company.created` / `company.updated` | company | alta y edición de espacios |
| `member.invited` | invitation | creación de invitación |
| `invitation.accepted` | invitation | aceptación (payload: email invitado, cuenta resultante) |
| `invitation.revoked` | invitation | revocación de invitación |
| `member.role_changed` | membership | cambio de rol (payload: rol anterior/nuevo) |
| `member.access_revoked` | membership | revocación de acceso (§3.3) |

Eventos de etapas siguientes (órdenes, costos, facturas) se agregan cuando corresponda, sobre esta misma tabla.

---

## 8. Pruebas

- **Unitarias (Jest):** reglas de rol (último owner, transiciones de invitación), normalización de email, generación/hashing de tokens.
- **Integración (Testcontainers + Postgres):** la matriz completa de §6, contra la API real con HTTP.
- **Contrato:** el OpenAPI exportado del código se guarda en CI y se compara para detectar cambios no revisados.

## 9. Definición de hecho (Etapa 1)

Igual que el criterio de salida de la Etapa 1 en `docs/plan.md`:

1. Matriz de §6 completa y verde en CI.
2. Revocación de acceso efecto inmediato y no destructiva (§3.3).
3. Audit log append-only con los eventos de §7.
4. Invitaciones de punta a punta con email real (Resend o SES — proveedor a elegir al arrancar la etapa).
5. `/api/docs` completo y protegido en producción.

---

## 10. Criterios de aceptación (Given/When/Then)

Cada criterio se implementa como test automatizado (§8). Toman la regla de negocio de `proyect.md` por referencia (§x), no por copia.

### 10.1 Registro y sesión

- **AC-1.1** Dado un email no registrado, cuando se envía `POST /auth/register` con nombre y contraseña válidos, entonces 201, la contraseña se guarda como hash Argon2id y se registra `user.registered` en el audit log.
- **AC-1.2** Dado un email ya registrado (en cualquier capitalización), cuando se intenta registrarlo de nuevo, entonces 409 y no se crea un segundo usuario.
- **AC-1.3** Dadas credenciales válidas, cuando se hace login, entonces 200 con cookie `mh_session` (`HttpOnly`, `Secure`, `SameSite=Lax`) y en la BD solo el hash del token.
- **AC-1.4** Dadas credenciales inválidas, cuando se hace login, entonces 401 con mensaje genérico que no distinga "email inexistente" de "contraseña incorrecta".
- **AC-1.5** Dada una sesión válida, cuando se hace logout, entonces 204 y el siguiente request con esa cookie recibe 401.
- **AC-1.6** Dado un usuario con sesión activa, cuando completa el reset de contraseña, entonces 204 y todas sus sesiones quedan revocadas (el siguiente request de cualquier dispositivo recibe 401).
- **AC-1.7** Dado un email no registrado, cuando se solicita `/auth/password/forgot`, entonces 202 siempre, sin revelar si el email existe.

### 10.2 Espacios y membresías

- **AC-2.1** Dado un usuario autenticado, cuando crea un espacio, entonces 201, queda como `owner` con membresía `active` y `company.created` en el audit log.
- **AC-2.2** Dado un miembro `owner`, cuando cambia el rol de otro miembro, entonces 200 y `member.role_changed` con el rol anterior y el nuevo en el payload.
- **AC-2.3** Dado un miembro con rol `member`, cuando intenta cambiar roles, invitar o revocar, entonces 403.
- **AC-2.4** Dado el último `owner` de un espacio, cuando intenta revocarse o degradarse a sí mismo, entonces 409 con detalle que indique el camino soportado (ver §11).
- **AC-2.5** Dado un miembro activo, cuando el `owner` lo revoca, entonces: `memberships.status = revoked` con `revoked_at`, respuesta 204, `member.access_revoked` en el audit log, y la cuenta personal, el negocio propio del usuario y los registros históricos quedan intactos (§3.3).
- **AC-2.6** Dado un miembro revocado con la sesión todavía viva, cuando hace request a su ex-espacio, entonces 404 — efecto inmediato, sin necesidad de re-login.
- **AC-2.7** Dado un usuario cuyas membresías están todas revocadas, cuando hace login, entonces 200 y `/auth/me` lista 0 espacios; puede crear un espacio propio.

### 10.3 Invitaciones

- **AC-3.1** Dado un `owner`, cuando crea una invitación, entonces 201, se envía un email con el token, en la BD solo queda su hash, expira a los 7 días y se registra `member.invited`.
- **AC-3.2** Dado un token válido con sesión activa, cuando se acepta, entonces 204, membresía `active` con el rol de la invitación y `invitation.accepted` en el audit log.
- **AC-3.3** Dado un token válido sin sesión, cuando se acepta enviando nombre y contraseña, entonces se crea la cuenta, se une al espacio, y el payload del audit log guarda el email invitado y la cuenta que aceptó.
- **AC-3.4** Dada una invitación ya aceptada, cuando se vuelve a aceptar (misma o distinta cuenta), entonces 409.
- **AC-3.5** Dado un token inexistente o de invitación revocada, cuando se consulta o se acepta, entonces 404; si está expirada, entonces 410.
- **AC-3.6** La invitación concede solo el espacio y el rol indicados: como consecuencia de aceptarla, ningún endpoint devuelve datos de otra empresa ni registros privados de otras relaciones (§3.2).

### 10.4 Audit log

- **AC-4.1** Dado un miembro activo, cuando consulta el audit log de su empresa, entonces 200 con eventos ordenados por `created_at` descendente y paginación por cursor.
- **AC-4.2** Dado un miembro activo de una empresa, cuando consulta el log de otra empresa, entonces 404.
- **AC-4.3** El audit log no tiene endpoints de escritura o modificación, y el rol de la aplicación en la BD no tiene grants de UPDATE/DELETE sobre la tabla (§7).
- **AC-4.4** Cada acción listada en §7 genera exactamente una entrada con `actor_user_id` (o `actor_type = 'system'`) y `created_at` correctos.

---

## 11. Casos excepcionales (comportamiento esperado)

Más allá de la matriz de §6, los edge cases de la etapa y lo que se espera ante cada uno:

| Caso | Comportamiento esperado |
|---|---|
| La última `owner` quiere salir o degradarse | 409. Camino soportado: primero promover a `owner` a otro miembro, después revocar. El mensaje de error explica el camino. |
| Dos `owner` revocan al mismo miembro en paralelo | Transacción con lock por fila de membresía: una gana; la otra recibe 404 (ya no existe miembro que revocar). |
| Doble aceptación de la misma invitación en paralelo | Unique constraint `(company_id, user_id)`: una gana, la otra recibe 409. |
| Re-invitación de un miembro previamente revocado | Se reactiva la fila existente (conserva el `created_at` original); cada ciclo de revocación/reinvitación genera su propia entrada en el audit log. |
| Reset de contraseña con sesiones abiertas en otros dispositivos | Todas las sesiones del usuario se revocan en la misma transacción que cambia la contraseña. |
| Email con distinta capitalización o espacios | Normalizado a minúsculas y sin espacios: `Foo@X.com` equivale a `foo@x.com`. |
| Sesión sin actividad por 30 días | Expira → 401. Las filas de sesión expirada se purgan de forma perezosa en cada login. |
| Eventos personales (`company_id = null`: registro, login, reset) | No aparecen en `GET /companies/:id/audit-log` (ese log es de la empresa). Quedan en la BD para soporte interno; si algún día se exponen, será en un endpoint propio del usuario y solo para él. |
| Contraseñas o tokens en payloads | Nunca en audit log, logs de la aplicación ni respuestas de la API. |
| Revocación mientras hay un request en vuelo | El permiso se evalúa por request: el request en curso puede completar; todos los siguientes fallan. No se garantiza atomicidad *entre* requests (aceptado). |
| Rate limit de login alcanzado | 429 con `Retry-After`; no bloquea el resto de la API, solo el endpoint de login. |
