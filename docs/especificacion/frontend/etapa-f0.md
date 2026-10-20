# Especificación técnica — Etapa F0 (frontend)

Documento de implementación de la **Etapa F0 — Fundamentos y design system** de
`frontend_plan.md`. Sigue la plantilla de la skill `new-frontend-stage-spec`.
Stack en `docs/stack.md` §6; reglas de trabajo en `frontend/AGENTS.md`; las
reglas de negocio se referencian por § a `proyect.md` y no se copian. La API se
consume tal cual la define `backend/openapi/openapi.json` (contrato de las
specs backend, que no se redefinen acá).

> **Aprobada el 19/10/2026** por el dueño (spec-driven, `AGENTS.md`).

---

## 1. Alcance

### 1.1 Entra / queda fuera

**Entra:**

- Scaffolding en `frontend/`: Vite + React 19 + TypeScript estricto, ESLint +
  Prettier + `tsc --noEmit`, gate `npm run check` (lint + typecheck + unit
  tests) y **job de frontend en CI** (`.github/workflows/ci.yml`).
- **Cliente API generado** desde `backend/openapi/openapi.json`
  (openapi-typescript + openapi-fetch) con script `npm run openapi:generate`.
- Capa de fetch: manejo de errores RFC 7807, 401 → redirección a login,
  422 → `detail` accionable, 404/403 → mensaje de estado.
- Sesión: login (`POST /auth/login`), logout (`POST /auth/logout`), arranque
  con `GET /auth/me`, guard de rutas.
- **Selector de espacio activo**: con base en `memberships` de `/auth/me`
  (companyId, companyName, companyType, role); persistencia del espacio activo;
  cambio de espacio.
- **Design system**: tokens (color, tipografía Inter self-hosted, espaciado,
  radios, sombras), modo claro/oscuro con persistencia, componentes base
  (button, input, select, badge, card, dialog, table) sobre Tailwind v4 +
  shadcn/ui.
- **Shell responsive** mobile-first: sidebar en desktop, navegación inferior en
  móvil; breakpoints 360 / 768 / 1280.
- i18n con i18next: keys en inglés, recursos en `es`; todo texto visible pasa
  por i18n.
- Formato de dinero sin Float (helper de centavos, §12).
- Proxy de dev Vite → API (`/api` → `localhost:3000`).
- Validación de Playwright + navegador en la máquina del dueño (Monterey;
  ver `docs/stack.md` §6) y smoke e2e mínimo en CI.

**Queda fuera (documentado, no se implementa en F0):**

- Registro, recuperación de contraseña e invitaciones (F1).
- Dashboard/portada y notificaciones (F2). El shell F0 deja las **rutas y
  huecos de navegación** previstos, sin contenido.
- Cualquier pantalla de catálogos, órdenes, facturación (F3–F8).
- Backend: sin cambios de API (F0 solo consume endpoints existentes).
- Despliegue/reverse proxy en producción: decisión D4, se configura al
  desplegar (fuera de F0–F8 salvo pedido).
- PWA/offline: no pedido, no se implementa.

### 1.2 Decisiones de diseño

| # | Decisión |
|---|---|
| **F0-D1** | **Espacio activo**: si `me` trae 1 membresía → selección automática; >1 → selector visible en el shell (persistido en `localStorage`, validado contra `me` en cada arranque); 0 → pantalla «sin espacios» con salida (crear espacio es F1). |
| **F0-D2** | **Guard de rutas**: sin sesión → `/login`; con sesión en `/login` → redirección al espacio activo. 401 en cualquier request ⇒ estado de sesión expirada → `/login` (la cookie HttpOnly la maneja el servidor; el cliente solo reacciona al 401). |
| **F0-D3** | **Tema**: `light`/`dark`/`system` (default `system`), persistido en `localStorage`, aplicado vía `class` en `<html>`; nunca parpadeo incorrecto al cargar (script inline pre-hydration). |
| **F0-D4** | **Errores de API**: helper único que mapea RFC 7807 → `{ title, detail, status }`; 422 muestra `detail` bajo el campo afectado o como banner general; 401 dispara F0-D2; 403/404 muestran pantalla/mensaje de estado, jamás datos ajenos. |
| **F0-D5** | **Monterey/Playwright**: en F0 se valida localmente qué funciona (`npx playwright install chromium` con versión soportada o `channel: 'chrome'` con Chrome 150); si el navegador local no arranca, el gate local queda con lint+typecheck+unit y los e2e corren en CI (ubuntu), documentando el resultado en esta spec (sección 11 al aprobar). |
| **F0-D6** | **Layout mínimo real**: el shell F0 navega a rutas placeholder registradas en el router («próximamente» por etapa), para que F2+ solo agregue contenido; no se inventan funcionalidades no pedidas. |

## 2. Pantallas y flujo

| Ruta | Pantalla | Flujo |
|---|---|---|
| `/login` | Formulario email + password | → `POST /auth/login` → `GET /auth/me` → selector o espacio activo |
| `/` | Selector de espacio (1+ membresías) o «sin espacios» | elegir espacio → entra al shell; 0 membresías → estado con salida (creación en F1) |
| `/app/*` | Shell (sidebar desktop / bottom-nav móvil) | rutas de contenido según etapa; en F0, placeholders |
| cualquier | — | sin sesión → redirige `/login` |

- **Flujo arranque**: app carga → `GET /auth/me` (estado `loading` con
  skeleton) → 200: selector/shell; 401: `/login`.
- **Logout**: `POST /auth/logout` → limpiar estado → `/login`.

## 3. Vista de datos por rol

F0 no expone datos de negocio; solo identidad y espacios:

- `/auth/me` muestra al usuario su email/nombre y **sus propias** membresías
  (§2.4, §3.4): nada de datos de otras empresas.
- El selector de espacio lista únicamente membresías activas del llamador;
  `companyType` (property_management / contractor / own_business) y `role`
  (§2.1–§2.3, §3) se usan para etiquetas del shell.
- Ocultar en UI no sustituye al servidor (§3.4): F0 no añade permisos, solo
  refleja lo que la API ya concede.

## 4. Consumo de la API

| Endpoint (OpenAPI) | Uso en F0 | Caché (TanStack Query) |
|---|---|---|
| `POST /api/v1/auth/login` | Formulario de login (200/401/422/429 rate-limit) | mutation → invalida `me` |
| `POST /api/v1/auth/logout` | Salida (204) | invalida `me` |
| `GET /api/v1/auth/me` | Arranque de sesión, selector de espacio (200/401) | query `['me']`, `staleTime` corto |
| `GET /api/v1/health` | (no usado por la UI; solo smoke opcional de entorno) | — |

- Tipos: **solo** generados (`npm run openapi:generate` → `src/api/generated/`).
- Base URL relativa `/api/v1` (mismo origen vía proxy en dev; reverse proxy en
  prod — D4).

## 5. Interacciones y transiciones

- **Login**: submit deshabilitado mientras hay request en curso (anti doble
  submit); éxito → navega; 401 → mensaje «credenciales inválidas»; 422 →
  detalle; 429 → mensaje de rate limit (§ login rate limit del backend).
- **Cambio de espacio**: reemplaza el activo y navega a la raíz del shell;
  invalida las queries del espacio anterior (prefix invalidation).
- **Tema**: toggle en el shell; persiste y se aplica al instante.
- Sin máquina de estados de negocio en F0 (§20 llega con F4).

## 6. Validación de formularios

- Login con **zod espejo** de `LoginDto` (email con formato, password requerida
  ≤ 200); la validación corre on-submit + on-blur, no bloquea teclear.
- Ante discrepancia cliente/servidor **manda el servidor**: el 422 con `detail`
  se muestra aunque el zod local haya pasado.
- Errores accesibles: `aria-invalid` + `aria-describedby` al campo.

## 7. Criterios de aceptación

- **AC-F0.1** Given sin sesión, When visito cualquier `/app/*`, Then redirige a
  `/login` y tras loguear vuelve a la ruta pedida.
- **AC-F0.2** Given credenciales válidas, When submit, Then 200, `me` se
  consulta, y con 1 membresía entro directo al shell con ese espacio activo
  (F0-D1).
- **AC-F0.3** Given credenciales inválidas, When submit, Then mensaje de
  «credenciales inválidas» (401) sin enviar a otra pantalla.
- **AC-F0.4** Given sesión expirada (401 en `me` o en cualquier request), Then
  redirige a `/login` (F0-D2) sin crashes por datos undefined.
- **AC-F0.5** Given varias membresías, When elijo un espacio, Then queda
  persistido (sobrevive recarga) y las queries del espacio anterior se
  invalidan.
- **AC-F0.6** Given 0 membresías, Then pantalla «sin espacios» con salida,
  sin rutas `/app` accesibles (F0-D1).
- **AC-F0.7** When cambio de tema, Then aplica al instante y persiste tras
  recarga, sin flash de tema incorrecto (F0-D3).
- **AC-F0.8** When miro la app a 360 px, Then la navegación es la bottom-nav y
  no hay scroll horizontal; a 1280 px, sidebar (F0, criterios transversales).
- **AC-F0.9** When regenero el cliente API (`npm run openapi:generate`) con el
  contrato actual, Then `tsc` compila sin errores (sin deriva de tipos).
- **AC-F0.10** Given un error RFC 7807 (422), Then el `detail` se muestra
  accionable; 403/404 muestran estado sin datos de otros espacios (F0-D4).
- **AC-F0.11** When corro `npm run check` en `frontend/`, Then lint + typecheck
  + unit verdes; y el job de frontend en CI corre verde (definición de hecho).

## 8. Pruebas

- **Unitarias (Vitest + Testing Library):** formulario de login (válida,
  inválida 401, 422, doble submit), guard de rutas (sin/con sesión, vuelta a
  la ruta pedida), selector de espacio (1/N/0 membresías, persistencia),
  toggle de tema, helper de errores RFC 7807 (401/422/403/404), formateo de
  dinero sin Float.
- **E2E (Playwright):** smoke `login → shell → logout` con la API real
  (proxy a backend local con BD de dev) **en CI**; en local según validación
  F0-D5. Se agrega a CI en F0 (sin backend en el job unit: se ejecuta contra
  un entorno levantado o, si se decide en la implementación, contra el backend
  ya sembrado; documentar lo que quede).
- **Accesibilidad:** al menos un test de teclado/foco en login y en el
  selector; contraste verificado en los tokens (AA).

## 9. Accesibilidad y responsive

- Login y shell: navegación completa por teclado, foco visible, labels
  asociados (`<label for>`), `aria-live` para errores de formulario.
- Breakpoints: mobile-first 360 (base) / 768 (tablet: shell colapsa a
  sidebar) / 1280 (sidebar completa). Bottom-nav con `aria-current`.
- Estados de carga (skeleton), vacío («sin espacios») y error (retry) desde
  F0.
- Contraste AA en tokens light y dark; `prefers-reduced-motion` respetado.

## 10. Definición de hecho

De `frontend_plan.md` F0: login real contra la API navegable en
PC/tablet/celular; design system con modo oscuro; cliente API regenerable por
script; gate local verde y CI verde — más los AC de §7 y la validación F0-D5
documentada.

## 11. Casos excepcionales

- `me` falla por red (no 401): pantalla de error con reintento, no mandar a
  login (solo el 401 es sesión inválida).
- Espacio activo en `localStorage` que ya no está en `me` (revocado, §3.3):
  se limpia y vuelve al selector.
- Rate limit de login (429): mensaje con espera, formulario habilitado de
  nuevo al vencer.
- `localStorage` no disponible (modo privado): la app funciona sin
  persistencia de espacio/tema en esa sesión.
- Doble logout o logout con la sesión ya caída: siempre termina en `/login`,
  sin error visible.
- Keys de i18n faltantes: fallback al string de default en dev (warn), nunca
  render de la key cruda en producción.
- Cliente API desactualizado respecto del backend: `npm run check` local y CI
  lo detectan vía `tsc` (AC-F0.9) antes de desplegar.
