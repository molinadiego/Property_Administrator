# Memoria del proyecto

Contexto que no vive en los otros documentos. `AGENTS.md` son reglas de trabajo, `README.md` es el mapa, `docs/*` son decisiones formales — acá queda el historial y las preferencias que se perderían al cerrar la sesión.

## 1. Estado del proyecto

- Requisitos funcionales **aprobados v1.0 (17/10/2026)** y cerrados: intocables sin aprobación expresa.
- Documentación completa: `README.md`, `AGENTS.md`, `docs/stack.md`, `docs/plan.md`, `docs/especificacion/etapa-1.md`.
- Skills creadas en `.opencode/skills/`: `consistency-check` y `new-stage-spec` (ambas registradas en sesiones OpenCode del repo).
- **Etapa 0: COMPLETADA (17/10/2026)** — scaffold en `backend/` con todo verde: lint ✓, 7 unit tests ✓, build ✓, e2e 3/3 con Testcontainers + PostgreSQL 16 real ✓, health `200 {"status":"ok","database":"up"}` contra la BD de desarrollo ✓. Gate de salida: `npm run check` (sin CI remota).
- **Siguiente paso: Etapa 1** (spec ya redactada en `docs/especificacion/etapa-1.md`; la primera migración real de Prisma viene con la tabla `users`). Proveedor de email **decidido: Resend** — pendiente operativo: crear la cuenta y verificar el dominio por DNS.

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
- **Sin GitHub ni CI remota** (decisión del dueño, 17/10/2026): el repo es **git local** y la condición de salida de etapa es el gate local `npm run check`. El workflow de GitHub Actions se dejó en `.github/workflows/ci.yml` por si cambia de opinión, pero **no volver a proponer** subirlo a ningún servicio remoto sin que él lo pida. Recomendarle backup del directorio de vez en cuando.
- **Email transaccional: Resend, no AWS SES** (decidido 17/10/2026, aprobado por el dueño): SES eliminó el free tier para cuentas nuevas (julio 2026), su sandbox exige pedir production access (revisión manual) y suma fricción operativa (IAM, región, SNS de bounces). El volumen de la Etapa 1 (invitaciones, recuperación de contraseña) entra holgado en el free de Resend (3.000/mes, 100/día). Si algún día escala a cientos de miles de emails/mes, se evalúa migrar la implementación detrás de la misma interfaz — no volver a plantear SES ahora por ser más barato a gran volumen.
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
- **Docker Desktop 4.38.0** (enero 2025): **la última que corre en Monterey**. Descarga directa `desktop.docker.com/mac/main/amd64/181591/Docker.dmg` (sha256 de Intel: `0b5f7c2c...bea362`, verificado contra el cask oficial de Homebrew). Ojo: **las release notes mienten sobre el mínimo real** — decían "Monterey 12+" pero el binario 4.48.0 exigía `LSMinimumSystemVersion=13.0` (Ventura); validar siempre con `plutil -p Docker.app/Contents/Info.plist` y con `depends_on macos` del cask histórico de Homebrew (commits de `Casks/d/docker.rb` / `Casks/d/docker-desktop.rb`). No actualizar sin cambiar de máquina/OS. El modelo actual (MacBookPro13,1 / 2016) no soporta más allá de Monterey.
- `docker` CLI vive en `/Applications/Docker.app/Contents/Resources/bin/` (sin brew). Si no está en PATH: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`. En shells viejos también hace falta `export PATH="$HOME/.local/node24/bin:$PATH"` para Node 24.
- **MinIO ya no distribuye imágenes** (oct 2025 pasó a source-only; sep 2026 borró `minio/minio` de Docker Hub; oct 2026 Quay exige login). El compose de desarrollo quedó **solo con Postgres** y la decisión de almacenamiento de archivos (S3-compatible, Garage, u otro) se toma al llegar la **Etapa 3**.

## 6. Gotchas del stack (aprendidos en la Etapa 0)

- **NestJS 12 es ESM puro** (`"type": "module"` en todos los paquetes `@nestjs/*`). Jest (30) solo consume ESM con `NODE_OPTIONS=--experimental-vm-modules` **y** Node ≥ 24.9 (detecta `vm.SourceTextModule.prototype.hasAsyncGraph`). Los scripts `test` y `test:e2e` ya lo llevan configurado; no quitarlos.
- **Prisma 7 cambió el modelo**: el `url` del datasource ya **no va en `schema.prisma`** → vive en `prisma7.config.ts` (solo lo usa el CLI). El generator es `prisma-client` y emite **TypeScript** a `src/generated/prisma` (gitignoreado): correr `npx prisma generate` antes de lint/build/tests/CI. El cliente se construye con el adapter `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` — `DATABASE_URL` ya no la lee él.
- **`@nestjs/pino` no existe en el registry**: el paquete mantenido es **`nestjs-pino`**.
- TS 6: `baseUrl` está deprecado (lo quitamos), `types` no se auto-incluye (hay que declarar `"types": ["node", "jest"]`) y `nest build` exige `rootDir` explícito en `tsconfig.build.json`.
- `testcontainers` v12 usa `withEnvironment()`, no `withEnv()`.
- El e2e tiene un guard de Docker: localmente la suite se **saltea sin Docker**; en CI la variable `REQUIRE_DOCKER=true` la **fuerza a fallar** si falta el daemon (nunca debe pasar en verde falso).
