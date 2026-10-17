# Reglas del agente

## Cómo trabajar

- Trabajar dentro de la tarea acordada; pedir autorización para cambios fuera de alcance y para documentos aprobados.
- `proyect.md` (v1.0) es la fuente de verdad de negocio y es inmutable sin aprobación expresa. No inventar decisiones de negocio: si algo está abierto (§18), preguntar.
- Revisar las secciones relevantes de los documentos antes de implementar.
- Jerarquía de documentos: `proyect.md` > `docs/stack.md` > `docs/plan.md` > `docs/especificacion/`. Ante un conflicto entre documentos: reportarlo, no resolverlo en silencio.
- Ejecutar las pruebas y explicar los resultados; no dar un trabajo por terminado con CI rojo.
- Spec-driven: aprobar la spec de la etapa/feature (`docs/especificacion/`) antes de implementar. Si la feature tiene reglas de negocio, permisos o estados, requiere spec completa (alcance, criterios de aceptación, casos excepcionales); los criterios se convierten en tests. Las reglas de negocio en la spec se referencian por § a `proyect.md`, no se copian.

## Código

- Código, identificadores y commits en inglés; documentación en español.
- Verificar permisos en el servidor para cada operación nueva y cubrirla con un test de la matriz de permisos (§16.1).
- Dependencias nuevas solo con justificación (stack cerrado en `docs/stack.md`).
- Secretos solo en variables de entorno; en tests y seeds, solo datos ficticios.
- No hacer borrados destructivos ni migraciones que pierdan historial (§1.1.8).

## Alcance

- Respetar el alcance de la etapa actual (`docs/plan.md`); no agregar funcionalidades no pedidas.
- Cambiar una regla de negocio implica revisar todas las secciones afectadas de `proyect.md` y avisar si alguna queda contradicha.
