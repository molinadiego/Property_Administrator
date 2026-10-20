# Stack técnico y arquitectura

Decisión cerrada para la primera versión del backend. Corresponde a la Etapa 0 del `docs/plan.md`. Cada elección indica el porqué; al final están las opciones descartadas para que no se reabra el debate sin un motivo nuevo.

## 1. Stack principal

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | Node.js 24 LTS + TypeScript | Tipos que codifican reglas de negocio antes de ejecutar. Mismo lenguaje que el frontend futuro. Coherente con la experiencia existente en Node. Node 24 es el mínimo para consumir ESM (NestJS 12) desde Jest. |
| Framework | NestJS | Módulos con estructura desde el inicio (users, companies, properties, orders, invoices, payments, audit). Un sistema de este tamaño necesita convenciones impuestas desde el día 1. |
| Base de datos | PostgreSQL | Transacciones financieras, máquinas de estados (`proyect.md` §20) e integridad referencial. |
| ORM | Prisma | Esquema tipado y migraciones. Advertencia: Prisma no reemplaza reglas de negocio ni permisos; esos viven en la capa de servicio. |
| Documentación de API | OpenAPI + Swagger UI (`@nestjs/swagger`, code-first) | Se genera del código. Se sirve también en producción, protegido con login, porque consultar "qué puede hacer cada endpoint" es clave en un sistema con tantos roles. |
| Validación | DTOs + class-validator | Validación en el borde de la API; los DTOs alimentan además el esquema OpenAPI. |
| Errores | Formato único RFC 7807 (`problem+json`) vía exception filter | El formato de error es parte del contrato de la API tanto como los códigos 200. Un solo filtro, consistente en todos los endpoints. |
| Autenticación | Sesiones server-side en Postgres + hash Argon2 | `proyect.md` §16.6 exige revocar el acceso operativo cuando termina una asignación o relación, y §3.3 revocar el acceso al espacio. Un JWT autocontenido no se revoca sin una tabla de sesiones: terminaríamos implementando sesiones igual, pero más complicadas. Cookies `HttpOnly` + `Secure` + `SameSite`. |
| Pruebas | Jest + supertest + Testcontainers (Postgres real). El runner `backend/scripts/jest.mjs` fija `--experimental-vm-modules` y **garantiza Node ≥ 24.9** (si el proceso arranca en un Node más viejo se re-ejecuta bajo `~/.local/node24`), porque el loader ESM de Jest 30 necesita `vm.SourceTextModule.moduleRequests` (Node 24.10+) y el Node 22 del sistema puede sombrear al 24 si el `PATH` queda mal ordenado. | La matriz de permisos (§16.1) se prueba contra la base real. SQLite miente sobre enums, `Decimal` y `JSONB`. |
| Logging / configuración | pino + ConfigModule con esquema validado | Fallar temprano si falta una variable de entorno. Logs estructurados desde el día 1. |
| Infra de desarrollo | Docker compose (Postgres; MinIO en la Etapa 3), **Git local + gate `npm run check` (lint + build + tests + e2e) en local y en CI** (GitHub Actions en cada push a `main` y cada pull request, desde 18/10/2026 a petición explícita del dueño) + respaldo remoto en GitHub (`molinadiego/Property_Administrator`, desde 17/10/2026, a petición del dueño) | Entornos reproducibles; el gate bloquea el avance de etapa sin todo verde. La CI remota corre **el mismo** `npm run check` (`.github/workflows/ci.yml`), por lo que una corrida roja en Actions es CI roja: no dar trabajo por terminado con el pipeline en rojo. Hasta el 18/10/2026 el remoto era solo respaldo (decisión del dueño 17/10/2026: no activar CI sin pedido explícito; el pedido llegó el 18/10/2026). |
| Seed de desarrollo | `tsx` (devDependency) + `backend/prisma/seed.ts` (`npm run prisma:seed`) | Carga datos 100% ficticios (dominio reservado `.test`) para desarrollar y probar los flujos de email con caso real. `tsx` ejecuta el script TS contra el cliente Prisma generado **sin build previo**; es solo de desarrollo, no entra al build de producción ni al runtime (agregado 17/10/2026). Idempotente y no destructivo: UUIDs fijos + `skipDuplicates`; el token de acceso limitado se upsertea y su valor crudo se imprime (solo se guarda el hash). |
| Almacenamiento de archivos (Etapa 3) | Interfaz `StorageService` + driver S3 con `@aws-sdk/client-s3` (runtime); **`s3rver`** (devDependency) como mock S3 **en proceso** en dev/test cuando no hay `STORAGE_ENDPOINT`; endpoint S3 real por env en producción (decidido 17/10/2026, ver `MEMORY.md` §5) | Fotos, documentos e historial lo exigen (§7.1, criterio de salida de la Etapa 3). Hablar el protocolo S3 desde el día 1 mantiene el código intacto al cambiar de backend (hoy mock en proceso, mañana Garage/R2/S3: solo config). `s3rver` evita un servicio Docker más en una máquina limitada y permite probar el driver real (HTTP + firma) en los e2e. La descarga se sirve **por la API** (verificación de permiso en cada request, §16.1), no con URLs prefirmadas. |

## 2. Decisiones transversales del modelo

Estas se toman ahora, no "cuando llegue la etapa", porque afectan el esquema de la base desde la primera migración.

- **Dinero:** `Decimal` de Prisma (o enteros en centavos). **Nunca `Float`.** Ningún importe de costos, facturas o pagos se almacena en punto flotante.
- **Multi-tenant:** `company_id` presente en cada tabla tenant-scoped + **guard obligatorio en la capa de servicio**: toda query que toque datos de una empresa pasa por un contexto de empresa. Los permisos se verifican en el servidor para cada operación (`proyect.md` §16.1); ocultar botones en la interfaz no alcanza (§3.4).
- **RLS (Row-Level Security):** no en la v1. Prisma no lo soporta limpio (requiere `SET LOCAL app.current_tenant` por transacción) y la verificación en la capa de servicio ya es la capa principal exigida por el documento. Queda como defensa en profundidad opcional a futuro.
- **Permisos derivados de la membresía, no del token:** el efectivo de una membresía (rol, estado) se evalúa en cada request contra la base. Así la revocación de acceso (§3.3) y el retiro de acceso (§3.3/§16.6) surten efecto inmediato, sin esperar a que venza ninguna credencial.
- **Swagger en producción:** sí, servido y protegido con login (ver fila "Documentación de API").
- **Idioma/moneda de la v1:** español e inglés como contenido, montos en USD (jurisdicción EE.UU., ver `proyect.md` §11.6 y §18.2).

## 3. Complementos: se incorporan cuando llega su etapa

No se instala todo el primer día. Cada pieza entra cuando hay una necesidad concreta (ver `docs/plan.md`).

| Necesidad | Tecnología | Etapa |
|---|---|---|
| Email transaccional (invitaciones) | Resend | 1 |
| Fotos, documentos y comprobantes | S3-compatible: `StorageService` + `@aws-sdk/client-s3` (mock `s3rver` en proceso en dev/test, endpoint real por env en prod — decidido 17/10/2026, ver §1 y `MEMORY.md` §5) | 3 |
| Colas de trabajo (PDFs, emails pesados) | Redis + BullMQ | 5 (aprox.) |
| Generación de PDF de factura | pdfmake | 5 |
| Descargas contables Excel | exceljs | 5 |
| Barrido de urgencias (recordatorio a mitad de ventana y escalación al vencer, spec etapa-6.md §4.2/D7) | `@nestjs/schedule` — cron de 15 min; bajo `NODE_ENV=test` el cron queda deshabilitado y las suites e2e invocan el barrido directamente | 6 |
| Interfaz web | React 19 + Vite + Tailwind v4 + shadcn/ui (ver §6) | Frontend F0 (producto nuevo, `frontend_plan.md`) |

## 4. Arquitectura

Monolito modular + API REST. No microservicios hasta que haya una razón real de escala.

```
Clientes / futura interfaz web
          │
          ▼
   API REST (NestJS)
   ├── Autenticación y autorización   (identidad, sesiones, roles, permisos)
   ├── Empresas y espacios            (membresías, invitaciones)
   ├── Propiedades e inquilinos
   ├── Órdenes y trabajos
   ├── Asignaciones
   ├── Facturas y pagos
   └── Audit log (escritura y lectura)
          │
          ▼
      PostgreSQL   (transacciones, integridad, company_id en cada tabla)
```

Cada módulo tiene controlador (HTTP + DTOs), servicio (reglas de negocio y permisos) y repositorio/Prisma. Los permisos se comprueban siempre en el servicio, nunca solo en el controlador ni en la interfaz.

## 5. Decisiones descartadas (y por qué)

| Descartada | Motivo |
|---|---|
| Express en lugar de NestJS | Obligaría a definir todas las convenciones de arquitectura a mano. Para un sistema con módulos de empresas, órdenes, facturas y audit log, las convenciones de NestJS valen más que la simplicidad inicial. |
| MongoDB | Las dos máquinas de estados (§20) y las transacciones financieras son caso de uso relacional clásico. |
| JWT como sesión principal | No permite revocación inmediata de acceso (§16.6, §3.3) sin montar una tabla de sesiones igual. JWT queda solo para consumidores de API externos, si algún día existen. |
| Vitest | NestJS está construido y documentado sobre Jest; elegir Vitest agrega fricción de configuración sin ganancia. |
| SQLite en los tests | Miente sobre enums, `Decimal` y `JSONB`. Tests con Testcontainers + PostgreSQL real. |
| Vendors CJS de `@nestjs/*` (para evitar el loader ESM de Jest) | Se descartó como solución al "flake" de Jest: el fallo real era un `PATH` que sombreaba el Node 24 con el Node 22 del sistema (ver §5 y `MEMORY.md` §6). Un guard de versión en `scripts/jest.mjs` es mínimo y sin duplicar código de terceros. |
| RLS en la v1 | Costo de integración con Prisma alto; la capa principal (verificación en el servidor) es la exigida por §16.1. Se evalúa después como defensa extra. |
| Auth0 / Clerk (auth gestionado) | Ahorra login básico, pero el modelo de membresías multi-empresa con roles y cuentas limitadas hay que escribirlo igual en la app. Se puede reconsiderar si el tiempo aprieta. |
| AWS SES para el email (decidido 17/10/2026) | Sin free tier para cuentas nuevas desde julio 2026 (solo créditos AWS temporales), sandbox que exige pedir production access (revisión manual) y más fricción operativa (IAM, región, SNS de bounces). El volumen de la Etapa 1 entra holgado en el free de Resend; si algún día escala a cientos de miles de emails/mes, se evalúa migrar la implementación. |
| Microservicios | El §17 avanza por etapas; un monolito modular bien estructurado gana hasta que exista una razón real de escala. |
| MinIO (almacenamiento original de la Etapa 3) | Dejó de distribuir imágenes: oct 2025 pasó a source-only, sep 2026 borró `minio/minio` de Docker Hub y oct 2026 Quay exige login (ver `MEMORY.md` §5). Sin imagen fiable que levantar. |
| Garage / S3 gestionado (Cloudflare R2, AWS S3) para dev y test (decidido 17/10/2026) | Garage agregaba un servicio Docker más y setup de buckets/claves en una máquina limitada; R2/AWS exigían cuenta, credenciales y costo desde el desarrollo. El mock en proceso `s3rver` cubre dev/test y el driver S3 es el mismo; si algún día hace falta un S3 "de verdad" en self-hosting o prod, se apunta `STORAGE_ENDPOINT` a Garage/R2/S3 sin tocar código. |

## 6. Stack del frontend (producto nuevo, aprobado 19/10/2026)

El frontend es un producto nuevo fuera del alcance del backend (`proyect.md` §1). Su plan de etapas es `frontend_plan.md`; sus reglas de trabajo, `frontend/AGENTS.md`; sus specs, `docs/especificacion/frontend/`.

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript + Node 24 | Mismo lenguaje que el backend; un solo toolchain. |
| Framework | React 19 + Vite (SPA) | El backend ya es la fuente de verdad; SSR/Next.js suma un servidor y problemas de caché de sesión sin beneficio (sin SEO público tras login). Vite: build rápido y DX. |
| Estilo | Tailwind CSS v4 + shadcn/ui (Radix) | Componentes accesibles (WCAG) copiados al repo: control total del diseño profesional sin dependencia de un UI kit pesado. |
| Datos | TanStack Query | Caché, reintentos e invalidación de queries; evita estado global inventado. |
| Router | React Router v7 (modo librería) | Rutas anidadas por espacio de trabajo, sin servidor propio. |
| Formularios | react-hook-form + zod | Validación espejo de los DTO; manda el servidor (422 con formato RFC 7807). |
| Contrato de API | openapi-typescript + openapi-fetch, **generado** de `backend/openapi/openapi.json` | Sin deriva de tipos; se regenera cuando cambia el contrato (`npm run openapi:generate`). |
| i18n | i18next, locale `es` desde F0 | UI solo en español hoy, textos externalizados: agregar otro idioma no toca código. |
| Identidad visual | Design tokens (CSS variables) propios: paleta neutra + acento, Inter self-hosted, modo claro/oscuro | Sin marca existente (decisión del dueño 19/10/2026): identidad definida desde cero y consistente entre pantallas. |
| Pruebas | Vitest + Testing Library (gate local) + Playwright (e2e en CI) | Espejo del estándar del backend. **Monterey (gotcha):** Chrome 150 es el último que soporta macOS 12 (Chrome 151+ exige macOS 13) y WebKit dejó de actualizarse para Monterey desde Playwright 1.45 → los e2e completos corren en CI (ubuntu); en local se valida la combinación en F0 (pin de versión o `channel: 'chrome'`). |
| Lint/formato | ESLint + Prettier + `tsc --noEmit`, gate `npm run check` en `frontend/` | Mismo criterio de gate que el backend. |
| Despliegue | Mismo dominio vía reverse proxy (Caddy/Nginx): sirve los estáticos y proxya `/api` al backend | Cookie `mh_session` (SameSite=Lax) funciona sin CORS y sin cambios de backend. En dev, proxy de Vite a la API. |

Decisiones transversales del frontend:

- **La UI nunca sustituye al servidor**: ocultar botones según rol no es control de acceso (§3.4, §16.1); toda operación nueva verifica permisos en servidor y se prueba contra la API real.
- **Cliente API solo generado** desde el contrato OpenAPI; los tipos no se escriben a mano.
- **Dinero sin Float** (§12): importes como string/decimal del backend, formateo sin punto flotante.
- **Responsive mobile-first**: 360 / 768 / 1280+, diseñado desde el móvil.

### 6.1 Decisiones descartadas del frontend (y por qué)

| Descartada | Motivo |
|---|---|
| Next.js (SSR) | La app es tras login y el estado vive en el backend; SSR agrega un segundo servidor y complejidad de caché de sesión sin beneficio (sin SEO público). Se reevalúa si aparecen páginas públicas con SEO. |
| Angular / Vue / Svelte | Rompen "un solo lenguaje con el backend" y el ecosistema shadcn/ui + Radix sobre el que se apoya el diseño. |
| MUI / Bootstrap / UI kits pesados | Menos control del diseño propio; shadcn/ui copia los componentes al repo (accesibles y modificables). |
| Redux / estado global de servidor | TanStack Query cubre caché y reintentos; el estado de UI local no justifica Redux. |
| Despliegue en subdominio separado (CORS) | Exigiría habilitar CORS con credenciales en el backend y ajustar cookies: cambios de backend innecesarios. Mismo dominio con reverse proxy los evita. |
| Filtrado del dashboard en el cliente | Decisión D2 (19/10/2026): los filtros van en backend (BE-1); filtrar en cliente descarga todo el listado y no escala. |
