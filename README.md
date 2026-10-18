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

Regla: los documentos se referencian entre sí, no se copian. Si un requisito cambia, se cambia primero en `proyect.md` y después en la especificación.

## Estado

- Requisitos funcionales: **aprobados el 17/10/2026 (v1.0)**.
- Etapa 0 (scaffolding del backend): **completada el 17/10/2026** — lint, tests unitarios, build, e2e con Testcontainers + PostgreSQL real y arranque con BD, todo verde (gate: `npm run check`). Repo con respaldo en GitHub (`molinadiego/Property_Administrator`); sin CI remota activa.
- Etapa 1 (auth, empresas, invitaciones, roles, audit log): **implementada el 17/10/2026** — gate `npm run check` en verde (unit 29 ✓, e2e 37 ✓ con matriz de permisos + contrato OpenAPI snapshot). Email con Resend operativa en modo sandbox. Pendiente: seed de desarrollo.
- Etapa 2 (propiedades, órdenes, asignaciones, cuentas con acceso limitado, notificaciones in-app): **spec aprobada e implementada el 17/10/2026** — gate `npm run check` en verde (unit 29 ✓, e2e 64 ✓ con la matriz de 24 escenarios de la spec + contrato OpenAPI actualizado). Decisiones aprobadas: token opaco por correo para cuentas limitadas, `own_business` en `CompanyType`, `client_relationships` explícita, notificaciones in-app con tipo enumerado. Pendiente: seed de desarrollo.

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
