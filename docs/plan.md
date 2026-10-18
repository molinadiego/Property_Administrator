# Plan de construcción por etapas

Las etapas de este plan son espejo 1:1 de las etapas del §17 de `proyect.md` (alcance aprobado), con una Etapa 0 técnica previa que no agrega funcionalidad de negocio. Si un alcance cambia, se cambia primero en `proyect.md` y después acá.

Cada etapa define: alcance, entregables y **criterio de salida** (qué tiene que estar probado para pasar a la siguiente). No se empieza una etapa antes de cerrar la anterior.

---

## Etapa 0 — Fundamentos técnicos

*Previa al §17; sin funcionalidad de negocio.*

**Alcance**
- Scaffolding NestJS + TypeScript, estructura de módulos.
- Prisma + PostgreSQL vía Docker compose, primera migración.
- Configuración validada (ConfigModule), logging con pino.
- Exception filter con formato de error RFC 7807.
- Setup de pruebas: Jest + supertest + Testcontainers (Postgres real).
- Tenant guard base (`company_id` en el contexto de request).
- Swagger (`/api/docs`).
- Gate de chequeo: `npm run check` (lint + build + tests + e2e), local y en CI. CI remota activada el 18/10/2026 a petición del dueño (ver decisión en `docs/stack.md`): el workflow de GitHub Actions (`.github/workflows/ci.yml`) corre el mismo gate en cada push a `main` y en cada pull request.

**Criterio de salida:** `docker compose up` levanta el entorno; un endpoint health-check documentado en Swagger responde; `npm run check` verde, con un test de integración contra Postgres real.

---

## Etapa 1 — Base del sistema *(= §17 Etapa 1)*

**Alcance**
- Cuentas y autenticación (registro, login, sesiones, recuperación de contraseña).
- Empresas y espacios de trabajo (crear y administrar el propio espacio).
- Invitaciones por correo electrónico (aceptar con cuenta existente o crear una nueva).
- Roles y permisos.
- Separación de información entre empresas.
- Historial de acciones (audit log): **desde el inicio**, porque agregar trazabilidad sobre un modelo ya construido es mucho más costoso (§17, Etapa 1).

**Entregable:** `docs/especificacion/etapa-1.md` (ya escrito) + su implementación.

> **Estado (17/10/2026): implementada y verde.** Auth, empresas, memberships, invitaciones, audit log y roles en `backend/`. Matriz de permisos como e2e (33 escenarios) ✓, contrato OpenAPI snapshot ✓. Email con Resend operativa en modo sandbox (ver `MEMORY.md` §8); verificar dominio propio es opcional. Seed de desarrollo implementado (`prisma/seed.ts`); sin pendientes de cierre para la Etapa 1.

**Criterio de salida**
- Toda operación verifica permisos en el servidor (§16.1) y toda query de datos de empresa pasa por el tenant guard (§16.2, §3.4).
- La matriz de permisos de la especificación está implementada como tests de integración y todos pasan.
- Revocar el acceso de una persona a un espacio surte efecto inmediato sin borrar su cuenta ni los registros (§3.3).
- Toda acción relevante queda en el audit log con quién y cuándo (§12).
- Invitaciones funcionando de punta a punta con email real (Resend).

---

## Etapa 2 — Propiedades y órdenes *(= §17 Etapa 2)*

**Alcance**
- Propiedades e inquilinos.
- Cuentas con acceso limitado para propietarios, inquilinos y clientes propios (§4.3, §5.1).
- Creación de órdenes (toda orden vinculada a una propiedad, §5.1).
- Alcance de los trabajos (§5.3).
- Asignación, aceptación y rechazo.
- Órdenes compuestas y división de trabajos.
- Notificaciones in-app básicas, para probar aceptación/rechazo sin depender del correo.

**Criterio de salida:** los flujos de creación → asignación → aceptación/rechazo funcionan extremo a extremo con notificación in-app; las cuentas con acceso limitado ven exactamente lo que dice §4.3 (y nada más); un usuario de una empresa no puede consultar órdenes privadas de otra (§16.8), verificado por tests.

**Entregable:** `docs/especificacion/etapa-2.md` (**aprobada el 17/10/2026**) + su implementación (**implementada el 17/10/2026**, gate `npm run check` en verde: unit 29 ✓, e2e 64 ✓).

---

## Etapa 3 — Seguimiento *(= §17 Etapa 3)*

**Alcance**
- Avances y finalización de trabajos.
- Trabajos incompletos.
- Reasignaciones, trabajos que no pudieron concretarse y cancelaciones.
- Fotografías, documentos e historial (almacenamiento S3-compatible, permisos de acceso §16.5).

**Criterio de salida:** una orden recorre su vida completa hasta cierre (§6.4, §20); las fotos/documentos respetan los permisos de quien los solicita; el historial conserva todo lo que §12 manda conservar (sin borrados silenciosos, §1.1.8).

**Entregable:** `docs/especificacion/etapa-3.md` (**aprobada el 17/10/2026**, 7/7 preguntas resueltas — incluye la enmienda de `proyect.md` §5.6 alineada a §20.1 y el cambio aprobado sobre la Etapa 2: aceptar deja el job en `accepted` y el inicio es `start` explícito).

> **Estado (17/10/2026): implementada y verde.** Seguimiento de jobs (máquina de estados §20.2, `start/progress/complete/incomplete/resume/not-realized`), decisiones del responsable (`revoke/reassign/close/cancel`), archivos (`StorageService`, mock `s3rver` en dev/test, allowlist 10 MB, borrado lógico auditado), historiales (`full/shared/own_jobs`, `/me/job-history`) y `history_shares`. Matriz de permisos de 49 escenarios como e2e ✓, 12 acciones de audit, `job_events` append-only a nivel de BD. `npm run check` verde; cambio aprobado incorporado en el e2e de la Etapa 2.

---

## Etapa 4 — Costos y autorizaciones *(= §17 Etapa 4)*

**Alcance**
- Materiales y mano de obra.
- Límites de gasto.
- Margen comercial opcional, sin aumento automático del límite de gasto (§8.5).
- Autorizaciones y emergencias (política por empresa con override por relación, §8.6).
- Correcciones de costos.
- Regla unificada de alcance ejecutable (§5.3, §8.8, §9): dentro del límite y consecuente con lo pedido, avanza; si no, solo la entidad originadora autoriza (§8.4).

**Criterio de salida:** los tests demuestran que ningún trabajo fuera de regla avanza sin autorización de la entidad originadora; todo cambio de costo queda en el historial (§12).

**Entregable:** `docs/especificacion/etapa-4.md` (**aprobada el 18/10/2026**, 9/9 decisiones resueltas — incluye la creación de la entidad `commercial_relations` para el override de emergencias de §8.6 y el procedimiento §18.1 de autorizaciones offline en un paso). **Implementada el 18/10/2026** (regla SDD en `AGENTS.md`): módulos `economic-settings`, `costs` y `authorizations`, matriz e2e de 52 escenarios + grants en `backend/test/etapa4.e2e-spec.ts`, `npm run check` verde (lint + build + 75 unit + 165 e2e).

---

## Etapa 5 — Facturación y pagos *(= §17 Etapa 5)*

**Alcance**
- Facturas: en la v1, una factura del contratista corresponde a una sola orden aceptada; el profesional factura su trabajo individual (§11.1, §11.4).
- Generación de PDF (jurisdicción EE.UU., solo PDF, §11.6).
- Pagos parciales y completos, saldos y correcciones.
- Visibilidad de facturas según §11.3 (cada entidad ve las suyas y las que emitió hacia ella).
- Descargas contables en PDF y Excel respetando permisos (§16.10).

**Criterio de salida:** el ciclo orden → factura → pago → saldo cierra con integridad financiera (dinero en `Decimal`, sin Float); las transiciones de estado de factura coinciden con §20.4; los tests de visibilidad de facturas (§11.3) pasan.

**Entregable:** `docs/especificacion/etapa-5.md` (**aprobada el 18/10/2026** — 6/6 decisiones resueltas en su §1.2, con la ampliación de alcance P3: facturación a cliente propio y cuentas limitadas de solo lectura). **Implementada el 18/10/2026** (regla SDD en `AGENTS.md`): módulo `billing` (facturas con serie correlativa sin huecos, pagos con detección de duplicados y conciliación, PDF con `pdfmake`, exports contables con `exceljs`, facturación a cliente propio y rutas limitadas de solo lectura; aviso D9 al corregir costos), matriz e2e de 54 escenarios en `backend/test/etapa5.e2e-spec.ts`, `npm run check` verde (lint + build + 102 unit + 219 e2e).

---

## Etapa 6 — Funciones complementarias *(= §17 Etapa 6)*

**Alcance**
- Garantías y reparaciones repetidas (§13).
- Notificaciones avanzadas (§14 y §18.4 — preferencias por usuario y tipo; solicitudes urgentes con plazo configurable, recordatorio y escalación).
- Suscripciones (§15 y §18.3 — resueltas el 18/10/2026: planes por categoría, sin límites de uso ni funciones diferenciadas, precios en $0 editables, cobranza fuera del sistema).
- Integraciones y automatizaciones.
- Interfaz web: producto nuevo, fuera del alcance del backend de las etapas 1-5 (§1).

**Criterio de salida:** a definir al llegar; las decisiones de negocio que lo bloqueaban (§18.3 suscripciones y §18.4 detalles de diseño) quedaron resueltas el 18/10/2026 con la enmienda a `proyect.md`.

---

## Dependencias y decisiones pendientes

- **Etapa 1 — proveedor de email decidido: Resend** (17/10/2026). Cuenta creada y funcionando en modo sandbox (`onboarding@resend.dev`); la API key vive solo en variable de entorno (`backend/.env`, gitignored). Verificar un dominio por DNS es opcional y solo hace falta para enviar a usuarios reales fuera del sandbox (ver `MEMORY.md` §8).
- **Etapa 5** puede avanzar sin resolver todo el §18.2: la jurisdicción (EE.UU., solo PDF) ya está decidida; los requisitos fiscales por estado y el tratamiento de impuestos quedan abiertos y se tocan cuando se cierren.
- **Etapa 6**: las decisiones que lo bloqueaban (§18.3 suscripciones, §18.4 detalles de diseño) quedaron resueltas el 18/10/2026 con la enmienda a `proyect.md`; el alcance ya puede especificarse. Sigue abierto únicamente §18.2 (impuestos), que no bloquea la Etapa 6.
- El **§18.1** (procedimiento de autorización por teléfono) se resuelve en la Etapa 4, al diseñar el registro de autorizaciones.
