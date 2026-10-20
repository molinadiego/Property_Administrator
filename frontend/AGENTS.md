# Reglas del agente — frontend

Este archivo complementa al `AGENTS.md` de la raíz del repo; sus reglas siguen vigentes. Acá se agregan las específicas del producto `frontend/`. Jerarquía de documentos para el frontend: `proyect.md` > `docs/stack.md` (§6) > `frontend_plan.md` > `docs/especificacion/frontend/`. Ante un conflicto entre documentos: reportarlo, no resolverlo en silencio.

## Cómo trabajar

- Spec-driven: aprobar la spec de la etapa (`docs/especificacion/frontend/etapa-fN.md`) antes de implementar. Si la feature toca reglas de negocio, permisos o estados, la spec es completa (alcance, criterios de aceptación, casos excepcionales); los criterios se convierten en tests.
- Las reglas de negocio se referencian por § a `proyect.md`, nunca se copian ni se inventan. Si algo queda abierto, preguntar.
- Respetar el alcance de la etapa actual (`frontend_plan.md`); no agregar funcionalidades no pedidas.
- Revisar las secciones relevantes de los documentos antes de implementar.
- Ejecutar el gate y explicar los resultados; no dar un trabajo por terminado con CI roja.

## Permisos y datos

- **El servidor manda**: la UI puede ocultar acciones o datos según el rol, pero eso nunca sustituye la verificación en el servidor (§16.1, §3.4). Toda funcionalidad nueva se prueba contra la API real, no con mocks del permiso.
- El cliente API **se genera** desde `backend/openapi/openapi.json`; nunca se escriben tipos de la API a mano. Si cambia el contrato, regenerar (`npm run openapi:generate` en `frontend/`) y correr el gate.
- Manejar los errores de la API en su formato RFC 7807 (422 con `detail` accionable visible al usuario; 401 → login; 403/404 → mensaje de estado, sin datos ajenos).
- **Dinero sin Float** (§12): los importes vienen como string/decimal del backend; formatear sin operaciones en punto flotante.
- Secretos solo en variables de entorno (`VITE_*`, visibles al browser: solo configuración no sensible, nunca credenciales de servicio). Datos de prueba, solo ficticios.

## Código

- Código, identificadores, commits y **keys de i18n** en inglés; **textos visibles** en español (locale `es`).
- Estilo según `docs/stack.md` §6: React 19 + Vite, Tailwind v4 + shadcn/ui, TanStack Query, React Router v7, react-hook-form + zod. Dependencias nuevas solo con justificación.
- Componentes con TypeScript estricto; sin `any` en props ni en respuestas de API.
- No hacer borrados destructivos sin confirmación explícita en la UI ni perder historial (§1.1.8).

## UI y accesibilidad

- **Responsive mobile-first**: la app se diseña primero para 360 px y sube a tablet (768) y PC (1280+); nada de «arreglar el desktop y ver si el móvil aguanta».
- Accesible por teclado, foco visible, labels asociados, contraste AA; los estados (carga, vacío, error, sin permiso) son parte del diseño, no un afterthought.
- Un solo design system (tokens y componentes de `src/components/ui`); no estilos ad-hoc fuera de los tokens.
- Estados de máquina (§20): la UI **solo ofrece las transiciones válidas** para el estado y rol; el servidor valida igual.

## Gate

- `cd frontend && npm run check` (lint + typecheck + unit tests) verde antes de dar por terminado algo.
- Los e2e de Playwright corren en CI (ubuntu); en local solo si el navegador lo permite (Monterey, ver `docs/stack.md` §6).
- CI roja = trabajo no terminado.
