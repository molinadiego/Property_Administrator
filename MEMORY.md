# Memoria del proyecto

Contexto que no vive en los otros documentos. `AGENTS.md` son reglas de trabajo, `README.md` es el mapa, `docs/*` son decisiones formales — acá queda el historial y las preferencias que se perderían al cerrar la sesión.

## 1. Estado del proyecto

- Requisitos funcionales **aprobados v1.0 (17/10/2026)** y cerrados: intocables sin aprobación expresa.
- Documentación completa: `README.md`, `AGENTS.md`, `docs/stack.md`, `docs/plan.md`, `docs/especificacion/etapa-1.md`, `docs/especificacion/etapa-2.md`, `docs/especificacion/etapa-3.md`.
- Skills creadas en `.opencode/skills/`: `consistency-check` y `new-stage-spec` (ambas registradas en sesiones OpenCode del repo).
- **Etapa 0: COMPLETADA (17/10/2026)** — scaffold en `backend/` con todo verde: lint ✓, 7 unit tests ✓, build ✓, e2e 3/3 con Testcontainers + PostgreSQL 16 real ✓, health `200 {"status":"ok","database":"up"}` contra la BD de desarrollo ✓. Gate de salida: `npm run check` (sin CI remota).
- **Etapa 1: IMPLEMENTADA Y VERDE (17/10/2026)** — auth, companies, memberships, invitations, audit log, roles y cookie de sesión. Gate local `npm run check` en verde y determinista: lint ✓, build ✓, unit 29 ✓, e2e 37 ✓ (matriz de permisos de la spec + contrato OpenAPI snapshot). Contrato del API versionado en `backend/openapi/openapi.json`; regenerar con `npm run openapi:update`.
- **Pendientes de la Etapa 1**: ninguno bloqueante. La email transaccional con Resend quedó **operativa en modo sandbox** (ver §8); verificar un dominio propio es opcional y solo hace falta para enviar a usuarios reales. El seed de desarrollo quedó implementado (ver §9).
- **Etapa 2: SPEC APROBADA E IMPLEMENTADA Y VERDE (17/10/2026)** — propiedades, tenants/clients con acceso limitado por token opaco, órdenes (compuestas, `requested`→`open`), jobs, assignments (accept/reject/reassign) y notificaciones in-app. Gate local `npm run check` en verde y determinista: lint ✓, build ✓, unit 29 ✓, e2e 64 ✓ (Etapa 1 + matriz de 24 escenarios de Etapa 2 + contrato OpenAPI). `CompanyType` ahora incluye `own_business`. Contrato regenerado con `npm run openapi:update`.
  - **Decisiones aprobadas por el dueño (17/10/2026)**: (1) token **opaco** de acceso limitado, entregado por correo, guardado solo como hash (patrón invitaciones de Etapa 1); (2) `'own_business'` en `CompanyType`; (3) relación profesional↔cliente con tabla explícita `client_relationships`; (4) notificaciones in-app con tipo enumerado + `read_at`.
  - **Ajustes de spec hechos durante la implementación** (para que la matriz aprobada pase, sin tocar `proyect.md`): se agregó `PATCH /companies/:id/orders/:orderId` (matriz #17 exigía editar instrucciones de la orden gestionada y la tabla §4.3 no lo listaba) + evento `order.updated` en audit; la celda #13 de la matriz se aclaró a 401 (con token opaco no hay sesión de empresa, el intento de crear orden directa falla en el guard de sesión, no con 403).
  - **Pendientes de Etapa 2**: ninguno (el seed de desarrollo quedó implementado, ver §9).
- **Resend: RESUELTO (17/10/2026)** — cuenta creada y envío real verificado de punta a punta en modo **sandbox** (`onboarding@resend.dev`, sin verificar dominio). API key y email de cuenta en `backend/.env` (gitignored). Detalle y gotchas en §8.
- **Etapa 3: SPEC APROBADA (17/10/2026, 7/7 preguntas resueltas) — IMPLEMENTACIÓN EN CURSO** — `docs/especificacion/etapa-3.md` (seguimiento de trabajos: avances/finalización, incompletos, reasignaciones/`not_realized`/cancelaciones, cierre §6.4; archivos fotos/documentos con `StorageService`; historiales §7.2-§7.4 y `history_shares` §7.5). Decisiones del dueño al aprobar (ver §3): alineación §5.6↔§20.1, «responsable» = miembro activo de la empresa dueña de la orden/job, cierre = cualquier miembro activo de la empresa originadora, cambio sobre la Etapa 2 (aceptar deja el job en `accepted`, inicio con `start` explícito), rechazo de órdenes y notificaciones in-app fuera de alcance, supuesto de retención §18.4 documentado.

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
- **Git local + respaldo en GitHub, sin CI remota** (decisión del dueño 17/10/2026; ampliada el mismo día): el gate de salida de etapa es **local** (`npm run check`). El dueño creó el repo `https://github.com/molinadiego/Property_Administrator` y pidió usarlo como **respaldo remoto** (`origin`, branch `main`). No activar CI remota sin pedido explícito; el workflow de GitHub Actions sigue en `.github/` por si se habilita después.
- **Email transaccional: Resend, no AWS SES** (decidido 17/10/2026, aprobado por el dueño): SES eliminó el free tier para cuentas nuevas (julio 2026), su sandbox exige pedir production access (revisión manual) y suma fricción operativa (IAM, región, SNS de bounces). El volumen de la Etapa 1 (invitaciones, recuperación de contraseña) entra holgado en el free de Resend (3.000/mes, 100/día). Si algún día escala a cientos de miles de emails/mes, se evalúa migrar la implementación detrás de la misma interfaz — no volver a plantear SES ahora por ser más barato a gran volumen.
- **Orden rechazada: nunca se reenvía, se crea una nueva** (decidido y enmendado el 17/10/2026, aprobado por el dueño): `proyect.md` §5.6 quedó alineada a §20.1 — si un contratista rechaza una orden, la administradora crea una nueva orden para otro contratista conservando la referencia a la rechazada; la rechazada no se reabre. También se retiró de §5.6 la opción «o cancelarla» (§20.1 no contempla `Cancelada` desde `Rechazada`). No volver a proponer reenviar la misma orden ni cancelar una ya rechazada.
- **Decisiones de la spec Etapa 3 (aprobación del dueño, 17/10/2026)**: (a) «responsable» de las decisiones sobre trabajos (`not_realized`/`resume`/`revoke`/`reassign`/`close`/`cancel`) = **miembro activo de la empresa dueña de la orden/job**; (b) cierre de orden = **cualquier miembro activo de la empresa originadora** (se descartó «solo `owner`»); (c) **cambio sobre la Etapa 2 aprobado**: aceptar la asignación deja el job en `accepted` y el inicio es `start` explícito (§20.2; actualizar el aserto del e2e de la Etapa 2); (d) **rechazo de órdenes a nivel de orden** y **notificaciones in-app** quedan **fuera de alcance** de la Etapa 3; (e) supuesto de retención §18.4 **aprobado**: borrado lógico y conserva indefinida en v1, retiro auditado. No volver a proponer estas alternativas salvo cambio de necesidad del dueño.
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
- **MinIO ya no distribuye imágenes** (oct 2025 pasó a source-only; sep 2026 borró `minio/minio` de Docker Hub; oct 2026 Quay exige login). El compose de desarrollo quedó **solo con Postgres**.
- **Almacenamiento de archivos: RESUELTO para la Etapa 3 (17/10/2026, elección del dueño)**: la app habla S3 vía `@aws-sdk/client-s3` detrás de una interfaz `StorageService`; en dev/test corre un **mock S3 en proceso (`s3rver`, devDependency)** — sin servicio Docker extra, ideal para la máquina vieja y para los e2e con Testcontainers — y en producción el endpoint S3 real va por variables de entorno (`STORAGE_*`). Cambiar de backend después es config, no código. Descartados: MinIO (sin imágenes), Garage (servicio extra) y R2/AWS gestionado (cuenta/costo desde dev). No volver a plantear salvo cambio de necesidad.

## 6. Gotchas del stack (aprendidos en la Etapa 0)

- **NestJS 12 es ESM puro** (`"type": "module"` en todos los paquetes `@nestjs/*`). Jest (30) solo consume ESM con `NODE_OPTIONS=--experimental-vm-modules` **y** Node ≥ 24.9: su loader ESM depende de `vm.SourceTextModule.prototype.moduleRequests` (Node 24.10+) y gatea por `hasAsyncGraph` (24.9+). Con Node más viejo revienta con mensajes confusos ("Must use import to load ES Module" o "moduleRequests unavailable").
- **El runner `backend/scripts/jest.mjs` aplica un guard de versión**: si el proceso corre en un Node < 24.9 se re-ejecuta solo bajo `~/.local/node24/bin/node` (override con `NODE_BINARY`). Esto es porque `/usr/local/bin/node` (22.17) **puede sombrear** al Node 24 si el `PATH` queda mal ordenado (p. ej. `Docker:$PATH:node24`); un `export PATH="$HOME/.local/node24/bin:..."` antes que el resto evita el problema a mano. No quitar el guard.
- **Prisma 7 cambió el modelo**: el `url` del datasource ya **no va en `schema.prisma`** → vive en `prisma7.config.ts` (solo lo usa el CLI). El generator es `prisma-client` y emite **TypeScript** a `src/generated/prisma` (gitignoreado): correr `npx prisma generate` antes de lint/build/tests/CI. El cliente se construye con el adapter `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` — `DATABASE_URL` ya no la lee él.
- **`@nestjs/pino` no existe en el registry**: el paquete mantenido es **`nestjs-pino`**.
- TS 6: `baseUrl` está deprecado (lo quitamos), `types` no se auto-incluye (hay que declarar `"types": ["node", "jest"]`) y `nest build` exige `rootDir` explícito en `tsconfig.build.json`.
- `testcontainers` v12 usa `withEnvironment()`, no `withEnv()`.
- El e2e tiene un guard de Docker: localmente la suite se **saltea sin Docker**; en CI la variable `REQUIRE_DOCKER=true` la **fuerza a fallar** si falta el daemon (nunca debe pasar en verde falso).

## 7. Gotchas aprendidos en la Etapa 2

- **Nunca anidar una petición `await` de supertest dentro de `.send(...)`** de otra petición (p. ej. `.send({ jobId: (await jobListOf(id))[0] })`). supertest comparte estado de servidor por agent; la llamada intermedia cierra/maneja el server y la petición externa revienta con un `TypeError: Cannot read properties of null (reading 'address')` en `formatServerUrl` (enmascara el fallo real). **Siempre** resolver la llamada previa en una variable aparte antes de construir la siguiente.
- **`npx prisma migrate dev` falla con "environment is non-interactive"** cuando no hay TTY; además, si se le da TTY vía `script`, pregunta y cancela con `N` por defecto. Truco que funciona: `echo y | script -q /dev/null npx prisma migrate dev --name <nombre>`. (Alternativa: `prisma migrate diff` a mano.) `prisma migrate deploy` (usado en los e2e) no tiene este problema.
- **Tipos de modelo de Prisma 7** (`Order`, `Job`, etc.) se importan desde `../../generated/prisma/client`, **no** desde el namespace `Prisma` (que solo expone `*Model`, `*GetPayload` no existe para todos). `Prisma.TransactionClient` y `Prisma.InputJsonValue` sí están en el namespace.
- **`payload` del audit log** es `Prisma.InputJsonValue`: un `Record<string, unknown>` no es asignable directamente → tipar los objetos before/after como `Record<string, string | null>` (o castear) para que compile.

## 8. Resend (configuración de email transaccional)

- **Cuenta creada (17/10/2026)** y envío verificado de punta a punta. La key `re_...` y la email de la cuenta viven **solo en `backend/.env`** (gitignored); nunca se commitean.
- **Modo sandbox actual** (`EMAIL_TRANSPORT=resend`, `EMAIL_FROM="Home Management <onboarding@resend.dev>"`): no exige verificar dominio ni DNS. La API key y el backend ya funcionan tal cual están.
- **Restricción del sandbox**: con `from: onboarding@resend.dev`, Resend **solo entrega** a (1) la email exacta de la cuenta Resend o (2) las direcciones de prueba `delivered@resend.dev` / `bounced@resend.dev` / `complained@resend.dev`. Cualquier otro destinatario → **403 "You can only send testing emails to your own email address"**. Es esperado, no es bug nuestro.
- **El destinatario debe ir sin nombre visible.** En modo sandbox, `Nombre <tu@correo>` falla aunque sea tu propia email; un string plano `tu@correo` pasa. Nuestro `email.service.ts` ya pasa `to: [message.to]` como string plano → compatible sin tocar código. (Con dominio verificado sí se puede nombre en `to`.)
- **`from` sí puede llevar nombre visible** siempre (`Home Management <onboarding@resend.dev>` funciona bien).
- **Para enviar a usuarios reales** (invitaciones a terceros, etc.): verificar un dominio propio en Resend (DNS SPF/DKIM/DMARC) y cambiar `EMAIL_FROM` a una email de ese dominio. Ese paso sigue pendiente y no bloquea nada de la Etapa 1/2.
- **Gotcha de scripts**: `node` no lee `.env` solo → usar `node --env-file=.env` (o `dotenv`) en cualquier script suelto que use la key.
- **Gotcha de la email de cuenta**: en modo sandbox la comparación del destinatario es **exacta**; un typo (p. ej. un carácter de más) da 403. El error 403 de Resend **imprime la email correcta** de la cuenta — sirve para depurar. Dicha email vive en `backend/.env`, no en estos docs.

## 9. Seed de desarrollo

- **Implementado (17/10/2026)**: `backend/prisma/seed.ts`, se corre con `npm run prisma:seed` (usa `tsx`, devDependency; ver `docs/stack.md` §1).
- Carga un dataset **100% ficticio** (dominio reservado `.test`) que cubre Etapas 1 y 2: 3 usuarios (`ana@demo.test` dueña, `bob@demo.test` miembro, `carla@demo.test` dueña de 2ª empresa; password `DevDemo123!`), 2 empresas (`property_management` + `own_business`), 4 memberships (multi-espacio), 3 propiedades (1 vacía), 3 tenants (2 con email → acceso limitado), vínculos property↔tenant y `client_relationship`, 3 órdenes (requested/open/assigned) con jobs y assignments (pending/accepted), 2 notificaciones y 1 `LimitedAccessToken` activo.
- **Idempotente y no destructivo**: UUIDs fijos + `skipDuplicates`; re-correr no duplica. El token de acceso limitado se upsertea en cada corrida y su valor **crudo se imprime** en consola (solo se guarda el hash SHA-256) para probar el acceso limitado de punta a punta.
- Usa `DATABASE_URL` (rol de migraciones/superuser), no `APP_DATABASE_URL`. Correr `npm run prisma:generate` antes si el cliente no está generado. **Solo desarrollo local; nunca en producción.**
