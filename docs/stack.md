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
| Infra de desarrollo | Docker compose (Postgres; MinIO en la Etapa 3), **Git local + gate de chequeo local** (`npm run check`: lint + build + tests + e2e) | Entornos reproducibles; el gate local bloquea el avance de etapa sin todo verde. Sin CI remota: decisión del dueño de no usar GitHub — el workflow de Actions queda en `.github/` por si se decide subirlo después. |

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
| Fotos, documentos y comprobantes | S3-compatible (MinIO en desarrollo) | 3 |
| Colas de trabajo (PDFs, emails pesados) | Redis + BullMQ | 5 (aprox.) |
| Generación de PDF de factura | pdfmake | 5 |
| Descargas contables Excel | exceljs | 5 |
| Interfaz web | Frontend TypeScript (a definir) | 6 (producto nuevo, fuera del backend) |

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
