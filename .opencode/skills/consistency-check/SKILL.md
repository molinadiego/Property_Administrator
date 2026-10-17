---
name: Revisión de consistencia
description: Ejecutar cuando cambia (o va a cambiar) una regla de negocio en proyect.md — busca las secciones cruzadas afectadas, contradicciones y el vocabulario que debe unificarse, y propone los arreglos antes de editar
---

# Revisión de consistencia tras un cambio de regla

`proyect.md` es un documento cruzado: una regla casi nunca vive en una sola sección. Aplicar un cambio a medias deja contradicciones silenciosas, que son el error más caro cuando el documento se convierta en especificación técnica.

## Flujo

1. **Identificar la regla cambiada** y su sección exacta en `proyect.md`.
2. **Buscar referencias cruzadas**: grep de la forma de referenciar la sección (`ver N.N`, `sección N`, `N.N.`) y de los términos clave de la regla, en todo `proyect.md`.
3. **Revisar los clústeres conocidos** de la tabla siguiente: aunque la regla parezca local, verificar cada sección del clúster.
4. **Reportar antes de editar**: listar secciones afectadas, contradicciones encontradas y arreglos propuestos. Esperar aprobación (ciclo revisar → aprobar → aplicar).
5. **Aplicar los arreglos aprobados** en todas las secciones afectadas, no solo en la que disparó el cambio.
6. **Verificar**:
   - Vocabulario unificado: "entidad originadora" (nunca "entidad que originó" ni "entidad responsable"), "la administradora" en femenino, "No pudo concretarse" para la cancelación parcial de trabajos.
   - Formato: sin tabs, sin "●", listas con `-` simple.
   - Todas las referencias `§N.N` siguen apuntando a secciones existentes.
7. **Bajar el cambio aguas abajo** si corresponde: `docs/especificacion/*.md` (criterios, matriz de permisos), `docs/plan.md` (alcance de etapa) y `MEMORY.md` (si la decisión cierra algo que estaba en §18 o entra en "no volver a proponer").
8. Si el cambio altera un criterio de aprobación del §19 o el alcance del §17, avisarlo explícitamente.

## Clústeres de secciones cruzadas conocidas

| Tema | Secciones ligadas |
|---|---|
| Regla de alcance ejecutable / autorizaciones | §1.1.7 ↔ §5.3 ↔ §8.4 ↔ §8.8 ↔ §9 ↔ §18.1 |
| Estados de orden | §20.1 ↔ §6.4 (cierre) ↔ §9 |
| Estados de factura y pagos | §20.4 ↔ §11.2 ↔ §11.5 |
| Visibilidad de facturas | §2.1 ↔ §11.3 ↔ §11.4 |
| Facturación (agrupación vs por orden) | §11.1 ↔ §11.4 ↔ §18.2 |
| Acceso a la propiedad y códigos | §4.2 ↔ §4.5 ↔ §5.8 |
| Cuentas con acceso limitado | §4.3 ↔ §5.1 ↔ §17 (Etapa 2) |
| Registros contables tras cerrar relación | §3.3 ↔ §3.5 ↔ §16.6 |
| Separación entre empresas | §2.4 ↔ §3.4 ↔ §16 ↔ §16.8 |
| Trazabilidad | §1.1.5 ↔ §12 ↔ §17 (Etapa 1, audit log) |
| Política de emergencia | §8.6 ↔ §8.4 ↔ §17 (Etapa 4) |
| Modelo de suscripciones | §15 ↔ §18.3 ↔ §17 (Etapa 6) |
