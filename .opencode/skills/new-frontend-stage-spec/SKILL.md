---
name: Nueva spec de etapa frontend
description: Ejecutar para generar la especificación técnica de una etapa del frontend (docs/especificacion/frontend/etapa-fN.md) siguiendo la plantilla y convenciones aprobadas
---

# Generar la spec de una etapa del frontend

## Antes de escribir

1. Leer en `frontend_plan.md` el alcance y el criterio de salida de la etapa (son la base de las secciones "Alcance" y "Definición de hecho").
2. Leer en `proyect.md` todas las secciones que la etapa implementa (las etapas del frontend mapean a las mismas secciones de negocio que las del backend).
3. Leer `docs/stack.md` §6 (stack del frontend) y `frontend/AGENTS.md` (reglas).
4. Revisar el **contrato real** de la API: `backend/openapi/openapi.json` (endpoints, DTOs, códigos) y las specs backend de las etapas que la funcionalidad consume. La spec frontend **no redefine** la API: la referencia.
5. Releer la spec frontend anterior como ejemplo (empezando por `docs/especificacion/frontend/etapa-f0.md` una vez exista) — seguir su estructura y nivel de detalle.
6. Si la etapa depende de una decisión de negocio abierta o de un cambio backend pendiente (p. ej. filtros BE-1), no inventarla: marcarla como supuesto pendiente o preguntar antes de escribir.

## Plantilla (11 secciones)

1. **Alcance** — qué entra y qué queda fuera, derivado de `frontend_plan.md`. Incluir explícitamente qué reglas de negocio (§) toca y qué endpoints consume.
2. **Pantallas y flujo** — rutas, layout (dónde vive la pantalla en el shell), navegación entre pantallas y estados de cada vista (carga, vacío, error, sin permiso). Incluir la variante responsive (qué cambia en móvil/tablet si aplica).
3. **Vista de datos por rol** — qué ve y qué no ve cada rol/tipo de espacio en cada pantalla, referenciando § de `proyect.md` (nunca copiando la regla). Recordar: ocultar en UI no sustituye al servidor (§3.4).
4. **Consumo de la API** — tabla: endpoint (método + ruta del OpenAPI), qué lo usa en la pantalla, qué se cachea/invalída en TanStack Query. Referenciar, no redefinir códigos/DTOs.
5. **Interacciones y transiciones** — acciones del usuario (envíos, transiciones de estado §20, subidas), qué botones se habilitan según estado+rol y qué error del servidor se muestra si igual intenta la operación.
6. **Validación de formularios** — espejo client-side con zod de los DTO del backend; quién manda ante discrepancia (el servidor, 422 con `detail`).
7. **Criterios de aceptación** — Given/When/Then, numerados (AC-FN.M), referenciando reglas por §, convertibles 1:1 en tests (Vitest + Testing Library; Playwright si cruza múltiples pantallas).
8. **Pruebas** — unitarias de componentes/lógica y e2e Playwright de los flujos críticos; indicar cuáles van al gate local y cuáles a CI.
9. **Accesibilidad y responsive** — breakpoints aplicables, teclado/foco, estados vacíos/carga/error.
10. **Definición de hecho** — copiar los criterios de salida de `frontend_plan.md` para esa etapa + gate verde + CI verde.
11. **Casos excepcionales** — edge cases con comportamiento esperado (401/403/404, sesión expirada durante una acción, red caída, doble submit, permiso revocado en vivo, listados vacíos, datos sensibles nunca en la UI de otro rol).

## Después de escribir

- La spec es **condición previa a implementar** (regla SDD en `AGENTS.md`): no empezar código hasta que el dueño apruebe la spec.
- Actualizar `README.md` (tabla de documentos) y `frontend_plan.md` (link a la nueva spec) si corresponde.
