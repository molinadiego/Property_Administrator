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

Regla: los documentos se referencian entre sí, no se copian. Si un requisito cambia, se cambia primero en `proyect.md` y después en la especificación.

## Estado

- Requisitos funcionales: **aprobados el 17/10/2026 (v1.0)**.
- Etapa 0 (scaffolding del backend): **código completo en `backend/`** — lint, tests unitarios, build y arranque verdes localmente; pruebas e2e (Testcontainers) y CI (GitHub Actions) listas para el primer push.

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
```
