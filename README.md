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
