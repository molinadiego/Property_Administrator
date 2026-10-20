# Plan de construcción del frontend

Plan maestro del producto nuevo **interfaz web** (`proyect.md` §1): fuera del alcance del backend de las etapas 1–7 (`docs/plan.md`) y con etapas propias. Mismo formato que el plan del backend: cada etapa define alcance, entregable y **criterio de salida**; no se empieza una etapa antes de cerrar la anterior.

Cada etapa exige su spec aprobada en `docs/especificacion/frontend/` antes de implementar (regla SDD en `AGENTS.md`); los criterios de aceptación se convierten en tests. Las reglas de negocio se referencian por § a `proyect.md`, nunca se copian.

Jerarquía de documentos para el frontend: `proyect.md` > `docs/stack.md` (§6 Frontend) > `frontend_plan.md` > `docs/especificacion/frontend/`.

---

## Decisiones cerradas (19/10/2026, aprobadas por el dueño)

| # | Decisión | Elección |
|---|---|---|
| **D1** | Stack | React 19 + TypeScript + Vite (SPA), Tailwind CSS v4 + shadcn/ui, TanStack Query, React Router v7, react-hook-form + zod, cliente API generado desde `backend/openapi/openapi.json` (ver `docs/stack.md` §6). |
| **D2** | Dashboard con filtros | **Filtros en backend** en `GET /companies/:id/orders` (etapa previa **BE-1**); no se filtra el listado completo en el cliente. |
| **D3** | Identidad visual | **Definida desde cero**: design tokens (CSS variables), paleta neutra + color de acento, tipografía Inter self-hosted, modo claro/oscuro. |
| **D4** | Despliegue | **Mismo dominio vía reverse proxy** (Caddy/Nginx sirve el build estático y proxya `/api` al backend): la cookie `mh_session` (SameSite=Lax) funciona sin CORS y sin cambios de backend. En dev, proxy de Vite a la API. |
| **D5** | Idioma | **Solo español**, con i18next desde F0 (keys en inglés, valores en `es`): agregar otro idioma no toca código. |

**Dependencia previa (BE-1):** spec e implementación en backend de filtros en `GET /companies/:id/orders` (estado de orden y «recibidas pendientes de aceptación por mí»), con tests de permisos (§16.1). Bloquea **solo a F2**; F0 y F1 pueden avanzar en paralelo. **Spec BE-1 aprobada e implementada el 19/10/2026:** `docs/especificacion/be-1-filtros-ordenes.md`.

---

## Etapa F0 — Fundamentos y design system

**Alcance**

- Scaffolding en `frontend/`: Vite + React 19 + TypeScript, ESLint + Prettier + `tsc --noEmit`, gate `npm run check` (lint + typecheck + tests) y **job de frontend en CI** (`.github/workflows/ci.yml`).
- Design system: tokens (color, tipografía Inter, espaciado, radios, sombras), modo claro/oscuro, componentes base (botones, inputs, tablas, diálogos, badges, tarjetas) sobre shadcn/ui + Tailwind v4.
- Layout responsive mobile-first: shell con **sidebar en desktop** y **navegación inferior en móvil**; breakpoints 360 / 768 / 1280.
- Cliente API generado desde `backend/openapi/openapi.json` (script de regeneración) + capa de fetch con manejo de errores RFC 7807 y 401 → login.
- Sesión mínima: login/logout con `GET /auth/me`, guard de rutas y selector de espacio activo.
- i18n (i18next, locale `es`) y formato de dinero sin Float (centavos, §12).
- Proxy de dev de Vite → API (`/api` → `localhost:3000`).
- Validar en esta etapa la combinación Playwright + navegador en Monterey 12.7.6 (ver `docs/stack.md` §6: Chrome/WebKit dejaron o dejan de soportar Monterey; si el navegador local no arranca, los e2e completos corren en CI — ubuntu — y el gate local se queda con unit/componente, documentando el motivo).

**Entregable:** `docs/especificacion/frontend/etapa-f0.md` (**aprobada el 19/10/2026**) + su implementación.

**Criterio de salida:** login real contra la API con la app navegable en PC/tablet/celular; design system con modo oscuro; cliente API regenerable por script; gate local verde y CI verde.

---

## Etapa F1 — Cuentas, invitaciones y espacios

**Alcance**

- Registro, recuperación y reset de contraseña (flujos de correo de la Etapa 1 del backend).
- Invitaciones: aceptar con cuenta existente o creando una nueva (rutas con token).
- Selector de espacio activo, creación de espacio (administradora / contratista / profesional, §2) y vista «sin espacios».
- Miembros: lista, cambio de rol y retiro de acceso desde la UI (§3.3), acorde al rol del usuario.

**Criterio de salida:** los flujos de cuenta y invitación funcionan de punta a punta con email real de prueba; la UI muestra/oculta acciones según el rol sin que eso sustituya la verificación del servidor (§3.4, §16.1).

**Entregable:** `docs/especificacion/frontend/etapa-f1.md`.

---

## Etapa F2 — Portada / Dashboard ⭐

**Alcance**

- Portada que **informa el tipo de espacio** (Administradora de propiedades / Contratista / Profesional independiente, §2.1–§2.3).
- Tarjeta de **órdenes abiertas** y tarjeta de **órdenes recibidas pendientes de aceptar**, con **aceptar / rechazar** directo desde la portada (§5.6, §20.1/§20.3), alimentadas por los filtros de BE-1.
- Notificaciones in-app: lista, badge de no leídas y marcar como leída (§14).
- Accesos rápidos según rol (crear orden, ver facturas, etc.).

**Criterio de salida:** la portada muestra los dos listados correctos por tipo de espacio; aceptar/rechazar funciona extremo a extremo con la notificación correspondiente; sin BE-1 aprobado e implementado, esta etapa no arranca.

**Entregable:** `docs/especificacion/frontend/etapa-f2.md`.

---

## Etapa F3 — Catálogos y acceso limitado

**Alcance**

- Propiedades, inquilinos y clientes con CRUD y validación espejo de los DTO.
- Relaciones comerciales y vínculos propiedad↔inquilino.
- **Portal de acceso limitado** (rutas `/limited/:token`, sin sesión): exactamente lo que define §4.3 y la visibilidad de facturas de §11.3, y nada más.

**Criterio de salida:** el portal limitado ve exactamente lo que la spec backend permite (404/403 consistentes con la API); CRUD completo con estados de carga/vacío/error.

**Entregable:** `docs/especificacion/frontend/etapa-f3.md`.

---

## Etapa F4 — Órdenes y trabajos

**Alcance**

- Lista y detalle de órdenes (filtros de BE-1), creación de orden vinculada a propiedad (§5.1) y edición de instrucciones/acceso.
- **Máquina de estados §20 en la UI**: la interfaz solo ofrece las transiciones válidas (aceptar, rechazar, reasignar, start/progress/complete/incomplete/not-realized, cierre y cancelación con motivo); el servidor sigue siendo quien valida.
- Órdenes compuestas: agregar trabajos, dividir y asignar (§5.5–§5.7).
- Estados de trabajo por rol (el profesional ve solo sus trabajos, §2.3).

**Criterio de salida:** una orden recorre su vida completa desde la UI hasta cierre; cada botón de transición está respaldado por un test; el detalle oculta lo que el rol no debe ver (y el servidor lo niega igual).

**Entregable:** `docs/especificacion/frontend/etapa-f4.md`.

---

## Etapa F5 — Evidencias e historial

**Alcance**

- Subida de fotos/documentos desde PC y móvil (cámara), con permisos §16.5 y tipos/allowlist del backend.
- Vistas de historial (`full` / `shared` / `own_jobs`) y `/me/job-history`.
- Compartir y revocar historial (§7.5).

**Criterio de salida:** subida y visualización funcionales en móvil y PC; los permisos de archivo se respetan visiblemente y en servidor; nada se borra (§1.1.8).

**Entregable:** `docs/especificacion/frontend/etapa-f5.md`.

---

## Etapa F6 — Costos y autorizaciones

**Alcance**

- Registro de materiales, mano de obra, adelantos y gastos por asignación (§8, §10), con correcciones versionadas.
- Límites de gasto, margen y resumen económico de la orden (§8.5).
- Solicitudes de autorización y constancias (incluido el procedimiento §18.1), política de emergencia (§8.6).

**Criterio de salida:** el flujo «fuera de regla → solo la entidad originadora autoriza» (§8.4, §8.8) es visible y probado en UI; todo cambio queda en historial.

**Entregable:** `docs/especificacion/frontend/etapa-f6.md`.

---

## Etapa F7 — Facturación e impuestos

**Alcance**

- Facturas: borrador (renglones, `taxable` por línea, tasa override) → emitir (congelado §11.6) → pagos → saldo → anular (§20.4).
- Descarga de PDF y export contable Excel desde el navegador (§16.10).
- Visibilidad por §11.3 y facturación a cliente propio.
- Perfil fiscal por empresa (solo rol de máxima jerarquía, con auditoría, §11.6).

**Criterio de salida:** el ciclo orden → factura → pago → saldo cierra en la UI con impuestos correctos (Nevada, §18.2); las descargas respetan permisos; el rol no autorizado no ve el formulario fiscal.

**Entregable:** `docs/especificacion/frontend/etapa-f7.md`.

---

## Etapa F8 — Funciones complementarias

**Alcance**

- Reclamos de garantía (§13), marcar urgencia y ventana de respuesta (§14.2, §18.4).
- Preferencias de notificación (§14, §18.4) y vista de plan/suscripción (§15).
- Audit log (solo lectura) y ajustes del espacio (datos generales, perfil fiscal si no está en F7, política de emergencia, urgencias).

**Criterio de salida:** cobertura de §13–§16 con las vistas de solo-lectura que corresponda; gate y CI verdes.

**Entregable:** `docs/especificacion/frontend/etapa-f8.md`.

---

## Criterios transversales (toda etapa)

- **Responsive real**: 360 px (móvil) / 768 px (tablet) / ≥1280 px (PC), mobile-first.
- **Accesible**: navegación por teclado, foco visible, labels y contraste.
- **Permisos**: la UI solo oculta lo que el servidor ya niega; toda funcionalidad nueva verifica permisos en servidor y se prueba contra la API real (§16.1).
- **Dinero sin Float** (§12): centavos enteros y formateo consistente.
- **Contrato**: cliente API solo generado desde `openapi.json`; si el contrato cambia, regenerar y correr el gate.
- **Gate**: `cd frontend && npm run check` verde en local y CI verde; no se avanza de etapa con CI roja.
- **i18n**: todo texto visible en `locales/es`; código e identificadores en inglés.

---

## Dependencias y decisiones pendientes

- **BE-1 (filtros de órdenes en backend)**: spec pendiente de aprobación; bloquea F2.
- **Playwright en Monterey**: validar en F0 la combinación que funcione localmente (pin de versión o `channel: 'chrome'`); e2e completos en CI (ubuntu). Documentar el resultado en la spec F0.
- **Despliegue (D4)**: la config exacta del reverse proxy se documenta cuando se implemente el despliegue; fuera del alcance de F0–F8 salvo pedido explícito.
- **Skills de terceros y MCP de browser (Playwright MCP)**: evaluar en F0 con justificación; instalar solo las que se usen.
