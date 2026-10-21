# Home Management — Plataforma de administración de propiedades y trabajos de reparación

Backend para administrar propiedades, órdenes de reparación, asignaciones de trabajo, costos, facturas, pagos e historial. Prioridad inicial: construir el backend sin interfaz (ver `proyect.md`, sección 1).

## Documentación

| Documento | Qué contiene | Cuándo leerlo |
|---|---|---|
| `proyect.md` | Requisitos funcionales **aprobados (v1.0)**. Fuente de verdad del negocio. | Antes de tomar cualquier decisión de diseño o código. |
| `AGENTS.md` | Reglas de trabajo: autorización, jerarquía de documentos, código, alcance. | Siempre — son las instrucciones de esta sesión. |
| `MEMORY.md` | Estado del proyecto, preferencias del dueño y decisiones ya tomadas que no volver a proponer. | Al retomar el trabajo después de una pausa o en una sesión nueva. |
| `docs/stack.md` | Stack técnico, arquitectura, decisiones transversales y decisiones descartadas. | Al configurar el entorno o evaluar una tecnología nueva. |
| `docs/plan.md` | Etapas de construcción (0-6) mapeadas al §17 de los requisitos, con alcance y criterio de salida de cada una. | Para saber en qué etapa estamos y qué sigue. |
| `docs/especificacion/etapa-1.md` | Especificación técnica de la Etapa 0 + 1: modelo de datos, endpoints, matriz de permisos como tests, audit log. | Al implementar la Etapa 1. |
| `docs/especificacion/etapa-2.md` | Especificación técnica de la Etapa 2: propiedades, inquilinos, órdenes, trabajos, asignaciones, cuentas de acceso limitado, notificaciones in-app. **Aprobada e implementada.** | Al revisar la Etapa 2. |
| `docs/especificacion/etapa-3.md` | Especificación técnica de la Etapa 3: seguimiento de trabajos (avances, incompletos, reasignaciones, «no pudo concretarse», cierre y cancelación de órdenes), archivos (fotos/documentos con almacenamiento S3) e historial. **Aprobada e implementada.** | Al revisar la Etapa 3. |
| `docs/especificacion/etapa-4.md` | Especificación técnica de la Etapa 4: costos por asignación (borrador → envío → corrección), límites de gasto, margen, solicitudes y constancias de autorización (§18.1), relación comercial (`commercial_relations`) y política de emergencia. **Aprobada e implementada.** | Al revisar la Etapa 4. |
| `docs/especificacion/etapa-5.md` | Especificación técnica de la Etapa 5: facturas (borrador → emitida → pagos/saldo → anulada), PDF con `pdfmake`, pagos con detección de duplicados y conciliación, facturación a cliente propio con visibilidad en cuenta limitada, descargas contables PDF/Excel. **Aprobada e implementada.** | Al revisar la Etapa 5. |
| `docs/especificacion/etapa-6.md` | Especificación técnica de la Etapa 6: reclamos de garantía (§13), urgencias con ventana/recordatorio/escalación y preferencias de notificación (§14, §18.4), planes de suscripción (§15, §18.3). **Aprobada e implementada.** | Al revisar la Etapa 6. |
| `docs/especificacion/etapa-7.md` | Especificación técnica de la Etapa 7: impuestos de la v1 sobre Nevada — perfil fiscal por empresa, renglones imponibles, tasa ajustable por factura, cálculo y congelado al emitir, PDF y Excel contables (§11.6, §18.2 resuelto). **Aprobada e implementada.** | Al revisar la Etapa 7. |
| `frontend_plan.md` | Plan de construcción del frontend (etapas F0–F8), decisiones D1–D5 y criterio de salida de cada etapa. | Para saber en qué etapa del frontend estamos y qué sigue. |
| `frontend/AGENTS.md` | Reglas de trabajo específicas del frontend (complementa al `AGENTS.md` raíz, que sigue vigente). | Siempre al trabajar en `frontend/`. |
| `docs/especificacion/be-1-filtros-ordenes.md` | Especificación técnica de BE-1: filtros `status` y `assignment_status` en `GET /companies/{id}/orders` (prerequisito del dashboard F2). **Aprobada e implementada.** | Al implementar F2. |
| `docs/especificacion/frontend/etapa-f0.md` | Especificación técnica de la Etapa F0 del frontend: scaffolding, design system, cliente API generado, sesión y selector de espacio. **Aprobada e implementada.** | Al revisar F0 o implementar F1. |
| `docs/especificacion/frontend/etapa-f1.md` | Especificación técnica de la Etapa F1 del frontend: registro, recuperación de contraseña, invitaciones, creación de espacios y gestión de miembros. **Aprobada e implementada** (enmienda F1-D4: e2e con buzón de prueba `EMAIL_OUTBOX_FILE`, §12). | Al revisar F1 o implementar F2. |
| `docs/especificacion/frontend/etapa-f2.md` | Especificación técnica de la Etapa F2 del frontend: portada/dashboard con tarjetas de órdenes abiertas y pendientes de aceptar (filtros BE-1), aceptar/rechazar directo, notificaciones in-app por espacio y accesos rápidos. **Aprobada e implementada.** | Al revisar F2 o implementar F3. |
| `docs/especificacion/frontend/etapa-f3.md` | Especificación técnica de la Etapa F3 del frontend: catálogos (propiedades con inquilinos, clientes propios y relaciones comerciales) y portal de acceso limitado (órdenes, pedidos de trabajo y facturas con PDF). **Aprobada e implementada.** | Al revisar F3 o implementar F4. |
| `docs/especificacion/frontend/etapa-f4.md` | Especificación técnica de la Etapa F4 del frontend: órdenes y trabajos — lista con filtros BE-1, creación, detalle con máquina de estados §20 en la UI, órdenes compuestas y reasignaciones. **Aprobada e implementada.** | Al revisar F4 o implementar F5. |
| `docs/especificacion/be-2-orden-status-assigned.md` | Especificación técnica de BE-2: retiro del estado muerto `assigned` de `orders` con migración dura, alineando BD y API con §20.1. **Aprobada e implementada.** | Al revisar BE-2 o el modelo de estados de `orders`. |

Regla: los documentos se referencian entre sí, no se copian. Si un requisito cambia, se cambia primero en `proyect.md` y después en la especificación.

## Estado

- Requisitos funcionales: **aprobados el 17/10/2026 (v1.0)**.
- Etapa 0 (scaffolding del backend): **completada el 17/10/2026** — lint, tests unitarios, build, e2e con Testcontainers + PostgreSQL real y arranque con BD, todo verde (gate: `npm run check`). Repo con respaldo en GitHub (`molinadiego/Property_Administrator`); CI activa en GitHub Actions: `npm run check` en cada push a `main` y en cada pull request (`.github/workflows/ci.yml`).
- Etapa 1 (auth, empresas, invitaciones, roles, audit log): **implementada el 17/10/2026** — gate `npm run check` en verde (unit 29 ✓, e2e 37 ✓ con matriz de permisos + contrato OpenAPI snapshot). Email con Resend operativa en modo sandbox. Seed de desarrollo implementado.
- Etapa 2 (propiedades, órdenes, asignaciones, cuentas con acceso limitado, notificaciones in-app): **spec aprobada e implementada el 17/10/2026** — gate `npm run check` en verde (unit 29 ✓, e2e 64 ✓ con la matriz de 24 escenarios de la spec + contrato OpenAPI actualizado). Decisiones aprobadas: token opaco por correo para cuentas limitadas, `own_business` en `CompanyType`, `client_relationships` explícita, notificaciones in-app con tipo enumerado. Seed de desarrollo implementado.
- Etapa 3 (seguimiento de trabajos, archivos e historial): **spec aprobada e implementada el 17/10/2026** (`docs/especificacion/etapa-3.md`, 7/7 preguntas resueltas — incluye la enmienda de `proyect.md` §5.6 alineada a §20.1). Almacenamiento decidido: `StorageService` + driver S3 con mock `s3rver` en proceso en dev/test. Gate `npm run check` en verde (unit 46 ✓, e2e 112 ✓ con la matriz de 49 escenarios + contrato OpenAPI actualizado); `job_events` append-only a nivel de BD.
- Etapa 4 (costos y autorizaciones): **spec aprobada el 18/10/2026** (`docs/especificacion/etapa-4.md`, 9/9 decisiones resueltas). Cubre costos por asignación con correcciones versionadas, límites de gasto, margen ≤ 20 %, solicitudes/constancias de autorización (procedimiento §18.1 en un paso), entidad nueva `commercial_relations` para la política de emergencia (§8.6) y resumen económico de la orden. **Implementada el 18/10/2026** (módulos `economic-settings`, `costs` y `authorizations`; matriz e2e de 52 escenarios; `npm run check` verde).
- Etapa 5 (facturación y pagos): **spec aprobada el 18/10/2026** (`docs/especificacion/etapa-5.md`, 6/6 decisiones resueltas: sin impuestos ni datos fiscales hasta cerrar §18.2; **facturación a cliente propio entra en v1** con visibilidad de solo lectura en su cuenta limitada; emitir/pagar cualquier miembro y anular solo `owner`; devoluciones de pago incluidas; precedencia de §11.2 sobre §20.4 en la tensión de «vencida»). **Implementada el 18/10/2026** (módulo `billing`; matriz e2e de 54 escenarios y 27 ACs; `npm run check` verde).
- Etapa 6 (garantías, urgencias con preferencias y suscripciones): **spec aprobada el 18/10/2026** (`docs/especificacion/etapa-6.md`, 7/7 decisiones D1–D7 resueltas: ventana de respuesta sobre la asignación pendiente de la orden urgente; recordatorio al asignado y escalación a los owners de su empresa; `own_business` cae en el plan de profesional; precios ajustables por semilla sin rol admin de plataforma; reclamos solo sobre trabajos completados, privados de la empresa originadora; preferencias sobre todos los avisos excepto los correos de cuenta, que siempre se envían; barrido cada 15 min con `@nestjs/schedule`, cron deshabilitado en test). Integraciones y automatizaciones pospuestas por decisión del dueño (18/10/2026). **Implementada el 18/10/2026** (módulos `warranty`, `urgency` y `subscriptions`; matriz e2e de 34 escenarios; `npm run check` verde).
- BE-1 (filtros `status`/`assignment_status` en órdenes, prerequisito de F2): **spec aprobada e implementada el 19/10/2026** (`docs/especificacion/be-1-filtros-ordenes.md`; unit 16 ✓, e2e 15 ✓, gate backend verde).
- BE-2 (retiro del estado muerto `assigned` de `orders`, migración dura): **spec aprobada e implementada el 20/10/2026** (`docs/especificacion/be-2-orden-status-assigned.md`; migración `20261020180000_be2_remove_order_assigned` con reclasificación de filas, `?status=assigned` → 422, OpenAPI y cliente frontend regenerados; gate backend verde: unit 131 ✓, e2e 289 ✓; gate frontend verde: 43 tests ✓).
- Frontend — Etapa F0 (fundamentos: SPA, design system, cliente API generado, sesión y selector de espacio): **spec aprobada e implementada el 20/10/2026** (`docs/especificacion/frontend/etapa-f0.md`). Gate `frontend/ npm run check` en verde (lint + typecheck + 43 unit) y smoke Playwright verde local con Chrome en 1280/360 (F0-D5, documentado en la spec §11). CI con los jobs `frontend-check` y `frontend-e2e` (smoke contra backend + PostgreSQL reales).
- Frontend — Etapa F1 (cuentas, invitaciones y espacios): **spec aprobada e implementada el 20/10/2026** (`docs/especificacion/frontend/etapa-f1.md`, con la enmienda F1-D4 de e2e vía buzón de prueba — §12). Registro sin sesión, recuperación/reset de contraseña, pantalla pública de invitación (aceptar con sesión o creando cuenta+y+sesión), creación de espacio con los 3 tipos participantes y gestión de miembros/invitaciones en `/app/settings/members`. Gate frontend en verde (lint + typecheck + 68 unit) y e2e Playwright (smoke + `account-flows`: registro→login→crear espacio, invitación→aceptar, reset de contraseña y revocación de miembro) con el buzón de prueba `EMAIL_OUTBOX_FILE` (JSONL) en CI.
- Frontend — Etapa F2 (portada/dashboard): **spec aprobada e implementada el 20/10/2026** (`docs/especificacion/frontend/etapa-f2.md`; decisiones F2-D1…F2-D7 aprobadas con la spec). Portada por espacio activo (`/app`): tarjeta de órdenes abiertas (`status=open,in_progress`, etiquetas BE-2 R5), pendientes de aceptar con **una fila por asignación propia** y aceptar/rechazar con diálogo (rechazo con motivo opcional ≤1000, espejo de `RejectAssignmentDto`), notificaciones in-app del espacio con badge de no leídas y marcar como leída, y accesos rápidos («Miembros» solo owner). Adiciones backend aprobadas: `id` en `MembershipViewDto`, `companyId` por notificación y response DTOs (Opción A) para `GET /orders` y `GET /notifications` (OpenAPI y cliente regenerados; e2e backend 290 ✓). La portada filtra por espacio activo las órdenes y notificaciones de otros espacios que el servidor trae por visibilidad §2.12/§2.4 (spec §4, flujo 4 de §8). Gate frontend en verde (lint + typecheck + 83 unit, +15 de F2) y e2e Playwright `dashboard-flows.spec.ts` (4 flujos × 1280/360,18/18 en total junto con smoke y account-flows) contra backend local con `FRONTEND_URL`.
- Frontend — Etapa F3 (catálogos y acceso limitado): **spec aprobada e implementada el 20/10/2026** (`docs/especificacion/frontend/etapa-f3.md`; decisiones F3-D1…F3-D7 aprobadas con la spec). Sub-rutas de catálogo en `/app/catalogs/{properties,properties/new,properties/:propertyId,clients,relations}` con ficha editable solo para `property_management`, alta/edición de inquilinos, registro de clientes (ambos con enlace de acceso por correo) y relaciones comerciales con contraparte exclusiva (empresa XOR cliente propio), cierre sin reapertura (§2.4) y **sin borrados (CRU)**. Portal público `/limited/:token`: órdenes con etiquetas BE-2 R5 («Borrador»), pedido de trabajo con las propiedades de sus propias órdenes (F3-D2, `[]` → aviso), Facturas solo si ≥1 con detalle y descarga de PDF, y 401 → pantalla de enlace inválido sin redirect a login (F3-D5). Adiciones backend aprobadas: response DTOs (Opción A) de properties/clients/relations/limited/billing-limited, `GET /limited/{token}/properties` (e2e `#12b`/`#52b`) y correcciones de contrato que F3 destapó (`UpdateCommercialRelationDto` nullable y `@ApiParam('id')` por método en `BillingController`; OpenAPI y cliente regenerados). Gate backend en verde (unit 136 ✓, e2e 292 ✓) y gate frontend en verde (lint + typecheck + 109 unit, +25 de F3); e2e Playwright `catalog-flows.spec.ts` (6 flujos × 1280/360; 30/30 en total con smoke, account y dashboard) contra backend local con `FRONTEND_URL` y buzón de prueba.
- Frontend — Etapa F4 (órdenes y trabajos): **spec aprobada e implementada el 20/10/2026** (`docs/especificacion/frontend/etapa-f4.md`; etapa aprobada por adelantado con las decisiones F4-D1…F4-D7, ver `MEMORY.md` §3). Rutas `/app/orders` (chips de estado + «Mis pendientes de aceptar» de BE-1, cap de 100 con nota visible), `/app/orders/new` (propiedad, título, descripción, urgencia vía `PATCH` best-effort — §11 —, datos de acceso×3 y cliente propio solo `own_business`) y `/app/orders/:orderId` (matriz `allowedOrderActions` con las transiciones válidas de §20 — AC-F4.12 —, trabajos y asignaciones con historial, acceso solo si el servidor lo envía, edición de instrucciones, cancelar con motivo, cerrar y convertir pedido; 403/409/404 → banner `aria-live` + refetch). Integración con F2: tile «Crear orden» y navegación de notificaciones `order`/`assignment` (F4-D6). Adición backend aprobada: response DTOs de órdenes (Opción A, F4-D1; OpenAPI y cliente regenerados). Resuelto con el dueño: AC-F4.4/AC-F4.6 validan el avance y los motivos con `201`/`204` (spec §2.3.4; la lectura en pantalla llega con el historial de F5). Gate backend en verde (unit 136 ✓, e2e 292 ✓) y gate frontend en verde (lint + typecheck + 144 unit, +35 de F4); e2e Playwright `orders-flows.spec.ts` (8 tests × 1280/360 = 16/16, los 6 flujos de la spec §8) contra backend local con `FRONTEND_URL` y buzón de prueba.

## Entorno

Requisitos: **Node.js 24 LTS** y **Docker Desktop** (arrancado).

```bash
cd backend
cp .env.example .env        # credenciales locales de desarrollo
docker compose up -d        # PostgreSQL + MinIO
npm install
npx prisma generate         # genera el cliente en src/generated/prisma
npm run prisma:migrate      # primera migración contra la BD local
npm run start:dev           # API en http://localhost:3000/api/v1
```

Swagger UI: `http://localhost:3000/api/docs`.

```bash
npm run lint                # ESLint
npm test                    # tests unitarios (Jest)
npm run test:e2e            # tests de integración (Testcontainers + PostgreSQL real)
npm run check               # gate de etapa: lint + build + tests + e2e en secuencia
```

### Frontend (`frontend/`)

La SPA (React + Vite) corre en `http://localhost:5173` y hace proxy de `/api`
al backend de `:3000` (mismo origen, ver `frontend_plan.md` D4).

```bash
cd frontend
npm install
npm run dev                 # SPA en http://localhost:5173 (requiere el backend arriba)
npm run check               # gate: lint + typecheck + unit (Vitest)
npm run openapi:generate    # regenera el cliente desde backend/openapi/openapi.json
npm run test:e2e            # smoke Playwright (en local usa el Chrome del sistema)
```
