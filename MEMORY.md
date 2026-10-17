# Memoria del proyecto

Contexto que no vive en los otros documentos. `AGENTS.md` son reglas de trabajo, `README.md` es el mapa, `docs/*` son decisiones formales — acá queda el historial y las preferencias que se perderían al cerrar la sesión.

## 1. Estado del proyecto

- Requisitos funcionales **aprobados v1.0 (17/10/2026)** y cerrados: intocables sin aprobación expresa.
- Documentación completa: `README.md`, `AGENTS.md`, `docs/stack.md`, `docs/plan.md`, `docs/especificacion/etapa-1.md`.
- Skills creadas en `.opencode/skills/`: `consistency-check` y `new-stage-spec` (ambas registradas en sesiones OpenCode del repo).
- **Etapa 0: scaffold completo en `backend/`** — NestJS 12 + TS 6 + Prisma 7; lint, unit tests (7), build y arranque verificados localmente. Falta cerrar: e2e con Docker, migración inicial y CI en GitHub (esperando push).
- **Siguiente paso tras Etapa 0: Etapa 1** (spec ya redactada en `docs/especificacion/etapa-1.md`).

## 2. Preferencias de trabajo del dueño

- Todo en **español**; código, identificadores y commits en inglés.
- Ciclo habitual: **revisar en modo plan → aprobar → aplicar en modo edición**. No editar sin que el modo cambie.
- Decisiones de negocio: **preguntar antes de aplicar**; aprobaciones por tandas de cambios.
- Cuando el dueño marca correcciones en un documento: aplicarlas y hacer **pasada de consistencia cruzada** — las reglas están cruzadas entre secciones (§5.3 ↔ §1.1.7 ↔ §8.8 ↔ §9, entre otras).
- No proponer funcionalidades nuevas sin que las pida.

## 3. Decisiones ya tomadas que no volver a proponer

- **§5.8 cerrado como está**: se propuso "lockbox solo en casas vacías" y renombrar "código de acceso a la comunidad" a "gate code" → **rechazado**. No retomar el tema.
- **Sin glosario (§0) ni matriz de permisos como tabla en `proyect.md` (§3.6)**: rechazados expresamente por el dueño. Las definiciones van inline.
- **Facturación**: el modelo admite 1 factura : N órdenes, pero **los flujos de la v1 facturan por orden** — el contratista emite una factura por orden aceptada y el profesional factura su trabajo individual.
- **§18 — respuestas ya dadas e incorporadas al documento** (no volver a preguntar):
  - Toda orden está vinculada a una propiedad (ficha mínima si no existe).
  - Política de emergencia por empresa, con override por relación comercial.
  - Acceso permanente de solo lectura a los propios registros contables.
  - Jurisdicción EE.UU., facturas en PDF, sin facturación electrónica.
  - Quien tiene negocio propio y participa en espacios ajenos paga solo su plan.
- **Spec-driven development adoptado por etapa/feature**: la spec se aprueba antes de implementar y sus criterios de aceptación se convierten en tests (regla en `AGENTS.md`). Se decidió **mantener `docs/especificacion/`** y no renombrar el directorio a `specs/` — no crear un árbol paralelo de especificaciones ni duplicar reglas de negocio que viven en `proyect.md`.
- **§18 — sigue abierto** (preguntar, nunca inventar): precios/planes, límites de uso, funciones por categoría, requisitos fiscales por estado, tratamiento de impuestos, procedimiento de autorización telefónica, y todo el §18.4 (se resuelve al diseñar).

## 4. Gotchas del repo

- `proyect.md` usa **referencias cruzadas (§x)**: todo cambio de sección debe mantenerlas válidas.
- Formato de `proyect.md`: **sin tabs, sin "●"**, listas con `-` simple.
- Los documentos se **referencian, no se copian**: si un requisito cambia, primero `proyect.md`, después la especificación.
- La matriz de permisos de `docs/especificacion/etapa-1.md` es condición de salida de la Etapa 1: sin sus tests verdes, no se avanza de etapa.
- `stack.md` y `plan.md` son espejo de decisiones aprobadas (stack y §17): cambiarlos implica antes cambiar `proyect.md` si la causa es de negocio.

## 5. Máquina y herramientas del dueño (peculiaridades)

- Máquina **Intel (x86_64) con macOS 12.7.6 (Monterey)**: Homebrew ya **no publica fórmulas precompiladas** para Monterey → cualquier `brew install` compila desde fuente (tardaba 30-60 min en cancelarse). Evitar brew para herramientas grandes.
- **Node 24 LTS instalado manualmente**: binario oficial de nodejs.org extraído en `~/.local/node24`, agregado al inicio del PATH en `~/.zshrc`. El Node del sistema (`/usr/local/bin/node`, 22.17) queda por detrás. Usar `export PATH="$HOME/.local/node24/bin:$PATH"` en shells viejos.
- **Docker Desktop 4.48.0** instalada desde el DMG oficial (`desktop.docker.com/mac/main/amd64/207573/Docker.dmg`, sha256 verificado). Es la **última versión que soporta Monterey**: 4.49+ exige macOS 14 y 4.63+ exige macOS 15+. No actualizar sin cambiar de máquina/OS.
- `docker` CLI vive en `/Applications/Docker.app/Contents/Resources/bin/` (sin brew). Si no está en PATH: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`.

## 6. Gotchas del stack (aprendidos en la Etapa 0)

- **NestJS 12 es ESM puro** (`"type": "module"` en todos los paquetes `@nestjs/*`). Jest (30) solo consume ESM con `NODE_OPTIONS=--experimental-vm-modules` **y** Node ≥ 24.9 (detecta `vm.SourceTextModule.prototype.hasAsyncGraph`). Los scripts `test` y `test:e2e` ya lo llevan configurado; no quitarlos.
- **Prisma 7 cambió el modelo**: el `url` del datasource ya **no va en `schema.prisma`** → vive en `prisma7.config.ts` (solo lo usa el CLI). El generator es `prisma-client` y emite **TypeScript** a `src/generated/prisma` (gitignoreado): correr `npx prisma generate` antes de lint/build/tests/CI. El cliente se construye con el adapter `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` — `DATABASE_URL` ya no la lee él.
- **`@nestjs/pino` no existe en el registry**: el paquete mantenido es **`nestjs-pino`**.
- TS 6: `baseUrl` está deprecado (lo quitamos), `types` no se auto-incluye (hay que declarar `"types": ["node", "jest"]`) y `nest build` exige `rootDir` explícito en `tsconfig.build.json`.
- `testcontainers` v12 usa `withEnvironment()`, no `withEnv()`.
- El e2e tiene un guard de Docker: localmente la suite se **saltea sin Docker**; en CI la variable `REQUIRE_DOCKER=true` la **fuerza a fallar** si falta el daemon (nunca debe pasar en verde falso).
