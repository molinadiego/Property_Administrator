# Especificación técnica — BE-1 (filtros de órdenes)

Documento de implementación de **BE-1**, prerequisito de backend del frontend
(decisión D2, 19/10/2026, ver `frontend_plan.md`): filtros de consulta en
`GET /api/v1/companies/{id}/orders` para que la portada (etapa F2) pueda pedir
las «órdenes abiertas» y las «recibidas pendientes de aceptar» sin descargar el
listado completo para filtrarlo en el cliente.

Extiende la lista de órdenes de la Etapa 2 (`docs/especificacion/etapa-2.md`
§2.6); las convenciones de API, el patrón de errores y las reglas de tenancy se
referencian, no se copian. Las referencias (§x) apuntan a `proyect.md`.

Base normativa: `proyect.md` §2.12 (visibilidad de órdenes), §2.1–§2.3 (tipos
de usuario), §5.6 (aceptación/rechazo), §16.1, §16.8, §20.1, §20.3.

> **Aprobada el 19/10/2026** por el dueño (spec-driven, `AGENTS.md`).

---

## 1. Alcance

### 1.1 Entra / queda fuera

**Entra:**

- Query param `status` en `GET /companies/{id}/orders`: filtro por estado(s)
  de orden, valores separados por coma (p. ej. `status=open,assigned,in_progress`).
- Query param `assignment_status`: `pending` | `accepted` — restringe a las
  órdenes donde **la membresía del llamador** tiene una asignación con ese
  estado (p. ej. `assignment_status=pending` = «recibidas, sin aceptar aún»).
- Ambos combinados aplican en **conjunción (AND)**.
- Validación de parámetros: valor desconocido o vacío → **422** con `detail`
  accionable (mismo contrato que el resto de la API).

**Queda fuera (documentado, no se implementa):**

- Paginación nueva: se mantiene el `take: 100` actual con su `orderBy`
  `createdAt desc`; agregar cursor/página es otra necesidad, cuando aparezca.
- Filtros por propiedad, fecha, urgente o texto libre: no los pide la portada
  de F2; no se agregan por adelantado.
- Endpoint de conteos/agregados para el dashboard: la portada usa los
  listados filtrados (volumen chico en v1); si el volumen lo exige, se plantea
  después.
- Cambios de visibilidad o permisos: los filtros **solo estrechan** el conjunto
  que la lista ya devuelve (§2.12); no se toca el `where` de visibilidad.
- Interfaz web: fuera del alcance de este documento (se implementa en F2).

### 1.2 Decisiones de diseño

| # | Decisión |
|---|---|
| **B1** | `status` admite **lista separada por coma** de valores de `OrderStatus` (`requested`, `open`, `assigned`, `in_progress`, `completed`, `cancelled`). Un valor inválido o vacío → 422 (no filtrar «a medias» ni ignorar en silencio). |
| **B2** | `assignment_status` admite **solo** `pending` | `accepted`: son los dos estados que otorgan visibilidad (§2.12); `rejected`/`revoked` no exponen la orden y por lo tanto no son filtros legítimos → 422. |
| **B3** | Semántica de `assignment_status`: «la membresía del llamador tiene, en alguna job de la orden, una asignación con ese estado». En órdenes del propio espacio aplica igual (puede haber asignación interna); si el llamador no tiene asignación con ese estado, la orden **no** entra en el resultado aunque sea visible de otro modo. |
| **B4** | La portada F2 usará `status=open,assigned,in_progress` para «órdenes abiertas» y `assignment_status=pending` para «recibidas sin aceptar»; la elección de qué cuenta como «abierta» (y el caso `requested`) se cierra en la spec F2, no acá. |
| **B5** | Sin eventos de audit log nuevos: la operación es de solo lectura (§12 exige registro de acciones, no de consultas). |

## 2. Modelo de datos

Sin cambios: no hay entidades nuevas ni modificadas (los filtros se aplican
sobre las tablas existentes `orders`, `jobs`, `assignments`).

## 3. Convenciones de la API

Referenciar `docs/especificacion/etapa-1.md` §3 (errores RFC 7807, 422 en
validación, prefijo `/api/v1`, cookie de sesión). Nada nuevo que agregar.

## 4. Endpoints

| Método | Ruta | Descripción | Permiso | Éxito / Fracaso |
|---|---|---|---|---|
| GET | `/api/v1/companies/{id}/orders?status=&assignment_status=` | Lista de órdenes visibles con los filtros opcionales aplicados en AND | Membresía activa (CompanyAccessGuard) + visibilidad §2.12 | 200 / 401 sin sesión / 404 espacio ajeno o inexistente / 422 parámetro inválido |

- Parámetros **opcionales**; ausentes = comportamiento actual idéntico (sin
  regresión para los consumidores existentes).
- Orden, estructura de la respuesta y serialización por rol (dueño `all`,
  asignado `own_jobs`) **sin cambios**.

## 5. Reglas de permisos

- La verificación de acceso sigue siendo la del guard + la del `where` de
  visibilidad existente (§16.1, §16.2, §2.12): los filtros se aplican **después**
  y **solo estrechan**. Un filtro nunca puede exponer una orden que sin filtro
  no se vería.
- Sin cambios de rol ni de matriz de permisos existente (Etapa 2 §2.6).

## 6. Matriz de permisos como tests

Convención de códigos: 401 sin sesión, 403 rol insuficiente en la propia
empresa, **404 recurso de otra empresa** (no se filtra existencia ajena).

| # | Escenario | Comportamiento esperado |
|---|---|---|
| 1 | Sin sesión + cualquier filtro | 401 |
| 2 | Espacio de otra empresa + filtro válido | 404 (el guard ni llega a los filtros) |
| 3 | `status` con valor desconocido (`status=foo`) | 422 con `detail` que lista los valores válidos |
| 4 | `status` vacío (`status=`) | 422 |
| 5 | `assignment_status=rejected` (u otro fuera de `pending`/`accepted`) | 422 |
| 6 | Miembros con `status=open,assigned,in_progress` | 200 solo con órdenes de esos estados; `completed`/`cancelled` ausentes |
| 7 | `assignment_status=pending` | 200 solo con órdenes donde el llamador tiene asignación `pending`; las que solo tiene `accepted` (o ninguna) ausentes |
| 8 | `status=open` + `assignment_status=pending` | intersección AND: órdenes `open` **y** con mi asignación `pending` |
| 9 | Profesional con asignación en orden de **otra** empresa, filtro `assignment_status=pending` | 200 con esa orden (visibilidad §2.12 intacta); órdenes de otras empresas jamás aparecen |
| 10 | Espacio propio sin filtros vs. con filtros | mismos permisos que hoy; sin filtro, respuesta idéntica a la actual (sin regresión) |
| 11 | Orden visible solo por ser del propio espacio, sin asignación propia, con `assignment_status=pending` | **excluida** del resultado (B3) |
| 12 | Orden con asignación rechazada del llamador (empresa ajena) | invisible (§2.12, matriz Etapa 2 #10), con o sin filtro |

## 7. Eventos de audit log de la etapa

Ninguno nuevo (B5).

## 8. Pruebas

- **Unitarias (Jest):** parser/validación de `status` (lista, inválido, vacío)
  y de `assignment_status`; construcción del `where` de filtros encima del
  `where` de visibilidad (que los filtros no tocan la cláusula OR de §2.12).
- **Integración (Testcontainers + PostgreSQL real):** matriz de §6 en
  `backend/test/be1.e2e-spec.ts`, siguiendo el patrón de las suites de etapa.
- Contrato OpenAPI regenerado (`npm run openapi:update`) y snapshot verde.

## 9. Definición de hecho

- Los dos filtros documentados en OpenAPI con sus validaciones y 422.
- Matriz de §6 verde en el gate `npm run check` (local) y CI verde.
- Sin cambios en la respuesta sin filtros (suite de Etapa 2 intacta).

## 10. Criterios de aceptación

- **AC-BE1.1** Dada una sesión válida, cuando se consulta con
  `status=open,assigned,in_progress`, entonces 200 y ninguna orden fuera de
  esos estados (§20.1).
- **AC-BE1.2** Dada una sesión válida, cuando se consulta con
  `assignment_status=pending`, entonces 200 y solo órdenes donde el llamador
  tiene asignación `pending` (§5.6, §20.3).
- **AC-BE1.3** Cuando `status` y `assignment_status` vienen juntos, entonces el
  resultado es la intersección (AND) de ambos filtros.
- **AC-BE1.4** Cuando `status` o `assignment_status` tienen un valor
  inválido o vacío, entonces 422 con `detail` accionable (nunca 200 parcial
  ni filtro ignorado).
- **AC-BE1.5** Cuando un usuario consulta una empresa ajena con cualquier
  filtro, entonces 404 (§16.8) y la respuesta nunca revela existencia ajena.
- **AC-BE1.6** Cuando la consulta viene **sin** parámetros, entonces la
  respuesta es idéntica a la actual (sin regresión, §2.12).
- **AC-BE1.7** Cuando el llamador es un profesional con asignación activa en
  una orden de otra empresa, entonces el filtro la incluye si cumple, y jamás
  incluye órdenes ajenas sin esa asignación (§2.3, §16.8).

## 11. Casos excepcionales

- Orden con **varias jobs** y asignaciones mixtas del llamador (una `pending`,
  otra `accepted`): cumple `assignment_status` si **alguna** coincide (B3).
- Orden del propio espacio **sin** ninguna asignación del llamador: excluida
  con `assignment_status=...` (B3), incluida con solo `status=...`.
- `status` con espacios (`open, assigned`): se recortan los espacios antes de
  validar; sin espacios se valida tal cual.
- Más de 100 órdenes visibles: se mantiene el corte actual (`take: 100`) y el
  orden `createdAt desc` — documentado, sin paginación nueva (§1.1).
- Parámetros no declarados (p. ej. `foo=1`): 422 por `forbidNonWhitelisted`
  (comportamiento global existente, sin cambios).
