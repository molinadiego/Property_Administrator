---
name: Nueva spec de etapa
description: Ejecutar para generar la especificación técnica de una etapa (docs/especificacion/etapa-N.md) siguiendo la plantilla y convenciones aprobadas
---

# Generar la spec de una etapa

## Antes de escribir

1. Leer en `docs/plan.md` el alcance y el criterio de salida de la etapa (son la base de las secciones "Alcance" y "Definición de hecho").
2. Leer en `proyect.md` todas las secciones que la etapa implementa (el §17 define qué secciones toca cada etapa).
3. Releer `docs/especificacion/etapa-1.md` como **ejemplo canónico** — la spec nueva sigue su estructura y su nivel de detalle.
4. Si la etapa depende de una decisión de negocio abierta (§18 de `proyect.md`), no inventarla: marcarla como supuesto pendiente o preguntar antes de escribir.

## Plantilla (11 secciones)

1. **Alcance** — qué entra y qué queda fuera, derivado de `docs/plan.md`.
2. **Modelo de datos** — entidades nuevas y modificadas: `id` UUID, timestamps UTC, `company_id` en toda tabla tenant-scoped, `Decimal` para dinero (nunca `Float`), índices y constraints.
3. **Convenciones de la API** — si ya están definidas en una spec anterior, **referenciar** (`docs/especificacion/etapa-1.md` §3), no copiar. Agregar solo lo nuevo.
4. **Endpoints** — tabla con método, ruta, descripción, permiso requerido y códigos de éxito/fracaso. Prefijo `/api/v1`.
5. **Reglas de permisos** — referenciadas por § a `proyect.md`, nunca copiadas. Recordar: verificación en el servidor por operación (§16.1), tenant guard (§16.2).
6. **Matriz de permisos como tests** — cada regla en escenario → comportamiento esperado. Recordar la convención de códigos: 401 sin sesión, 403 rol insuficiente en la propia empresa, **404 recurso de otra empresa** (no filtrar existencia ajena).
7. **Eventos de audit log de la etapa** — mapeados a lo que exige §12.
8. **Pruebas** — unitarias (Jest) e integración (Testcontainers + PostgreSQL real).
9. **Definición de hecho** — copiar los criterios de salida de `docs/plan.md` para esa etapa.
10. **Criterios de aceptación** — Given/When/Then, numerados (AC-N.M), referenciando reglas por §, convertibles 1:1 en tests.
11. **Casos excepcionales** — edge cases con comportamiento esperado (unique constraints, carreras, límites de recursos, datos sensibles nunca en payloads).

## Después de escribir

- La spec es **condición previa a implementar** (regla SDD en `AGENTS.md`): no empezar código hasta que el dueño apruebe la spec.
- Actualizar `README.md` (tabla de documentos) y `docs/plan.md` (link a la nueva spec) si corresponde.
