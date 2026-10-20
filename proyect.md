BORRADOR GENERAL DE REQUISITOS

Plataforma de administración de propiedades y trabajos de reparación

Versión: 1.0 — Requisitos aprobados
Estado: Aprobado (17/10/2026)
Historial: v0.5 consolidación de reglas de alcance, autorizaciones y estados; v0.6 reglas de autorización unificadas, cuentas con acceso limitado, transiciones de factura y formato; v0.7 decisiones del 18.1-18.3 incorporadas (propiedad requerida, política de emergencia con override, acceso permanente a registros, facturación por orden, jurisdicción EE.UU., cobro de suscripciones); v1.0 aprobado para convertirse en especificación funcional y técnica. Enmienda 17/10/2026 (§5.6, aprobada por el dueño): ante el rechazo de una orden, la administradora crea una nueva orden para otro contratista conservando la referencia a la rechazada (§20.1; la rechazada no se reabre); se retiró de §5.6 la opción de cancelar la rechazada, que §20.1 no contempla entre sus transiciones. Enmienda 18/10/2026 (§15, §18.3 y §18.4, aprobada por el dueño): cuestiones abiertas de suscripciones y diseño resueltas — planes sin límites ni funciones diferenciadas y con precios de ejemplo ajustables, cobranza fuera del sistema, plazos y escalación para solicitudes urgentes, preferencias de notificación, corrección de registros (datos maestros editables con auditoría, historial siempre correctivo), conservación permanente de documentos y sin informes nuevos. Enmienda 19/10/2026 (§11.6, §18.2, aprobada por el dueño): impuestos de la v1 — jurisdicción Estados Unidos, estado de Nevada; perfil fiscal configurable por empresa (ID fiscal, dirección, tasa por defecto, exención) con tasa ajustable por factura al emitir; el emisor marca línea por línea qué conceptos son imponibles, sin reglas fijas por tipo de emisor y destinatario; el impuesto se calcula y congela al emitir, se muestra en el PDF y en la exportación contable; §18.2 queda resuelto.
Objetivo: Definir cómo debe funcionar el negocio antes de diseñar la arquitectura técnica o comenzar la implementación.

⸻

1. Objetivo del sistema

Desarrollar una plataforma que permita administrar propiedades, clientes, órdenes de reparación, asignaciones de trabajo, seguimiento de tareas, costos, facturas, pagos e historial.

La plataforma debe servir para tres tipos principales de participantes:

- Empresas de administración de propiedades (Property Management).
- Contratistas que reciben trabajos y pueden distribuirlos entre distintos profesionales.
- Profesionales independientes, como handymen, plomeros, electricistas, técnicos de HVAC y especialistas en drywall.

El sistema debe adaptarse a distintas formas de trabajo. No todas las reparaciones pasan por una administradora y un contratista: un profesional también puede recibir trabajos directamente de sus propios clientes.
Cuando la orden la genera una administradora, puede asignarla directamente a un profesional o enviarla a un contratista. Cuando la genera un contratista, puede resolverla él mismo o asignar sus partes a profesionales. Cuando la genera un profesional para un cliente propio, el profesional es responsable de gestionarla.

La prioridad inicial es construir el backend. La interfaz y las demás funcionalidades se desarrollarán posteriormente.

1.1. Principios generales

1. Cada participante debe acceder solamente a la información que le corresponde.
2. Una persona puede trabajar con varias empresas sin mezclar automáticamente sus datos.
3. Cada orden debe tener un alcance claramente definido.
4. Los trabajos, autorizaciones, costos y facturas deben mantener su propio historial.
5. Las acciones importantes deben identificar quién las realizó y cuándo.
6. Las reglas deben reflejar situaciones reales del trabajo, evitando pasos innecesarios.
7. No se debe autorizar un trabajo adicional simplemente porque cabe en el límite económico de la orden; solo la entidad que la originó puede autorizarlo.
8. El sistema no debe borrar silenciosamente información histórica o financiera.

⸻

2. Tipos de usuarios y relaciones comerciales

2.1. Administradora de propiedades

La administradora puede:

- Registrar y administrar propiedades e inquilinos.
- Crear órdenes de reparación.
- Enviar una orden directamente a un profesional o a un contratista.
- Definir límites de gasto y políticas de autorización.
- Adjuntar instrucciones, fotografías y documentos.
- Consultar el avance de las órdenes que le pertenecen.
- Recibir información sobre los trabajos realizados y sus costos.
- Cerrar las órdenes originales que administra.
- Crear, recibir o gestionar las facturas que correspondan a su relación comercial.

La administradora no necesita ver automáticamente las facturas privadas que un profesional emite a un contratista.
Solo puede ver las facturas emitidas por la entidad a la que le envió las órdenes de trabajo y las que ella misma emite (ver 11.3).

2.2. Contratista

El contratista puede:

- Recibir órdenes de una o varias administradoras.
- Crear órdenes para sus propios clientes.
- Aceptar o rechazar órdenes recibidas.
- Dividir una orden en trabajos independientes.
- Asignar cada trabajo al profesional adecuado.
- Reasignar trabajos cuando sea necesario.
- Consultar el avance de las órdenes que gestiona.
- Revisar costos, evidencias y resultados.
- Informar y proponer trabajos adicionales a la entidad originadora de la orden.
- Presentar resultados y costos a quien encargó el trabajo.
- Emitir sus propias facturas.
- Mantener el historial de los trabajos que gestionó.

El contratista no debe acceder a todas las órdenes de una administradora ni a los trabajos privados de un profesional.
Solo puede acceder a los trabajos en los que el contratista intervino.

2.3. Profesional independiente

El profesional puede:

- Trabajar directamente para sus clientes.
- Recibir trabajos de contratistas.
- Recibir trabajos directamente de administradoras.
- Aceptar o rechazar asignaciones.
- Consultar las instrucciones y la información necesaria para realizar su trabajo.
- Registrar avances, resultados, materiales, mano de obra y gastos.
- Adjuntar fotografías y comprobantes.
- Informar que no puede completar un trabajo y explicar el motivo.
- Presentar sus costos a la persona o empresa correspondiente.
- Emitir facturas y registrar pagos.
- Consultar y descargar sus propios registros contables.

Un profesional asignado a una parte de una orden no debe ver automáticamente los trabajos de otros profesionales.

2.4. Una persona puede participar en distintos espacios

Una persona debe tener una cuenta personal y poder participar en diferentes empresas o relaciones comerciales.

Por ejemplo, un profesional puede trabajar para dos contratistas y, al mismo tiempo, administrar su propio negocio.

Los permisos y los datos deben mantenerse separados según cada relación.

⸻

3. Cuentas, invitaciones y permisos

3.1. Registro

Un profesional puede registrarse por su cuenta para utilizar la plataforma con su propio negocio y sus propios clientes.

Para incorporarse al espacio de otra empresa, puede recibir una invitación por correo electrónico.

La persona invitada puede aceptar la invitación con una cuenta existente o crear una nueva.

3.2. Invitaciones

Una invitación concede acceso únicamente al espacio y a los permisos correspondientes.

No concede acceso automático a toda la información de la empresa ni a los registros privados de otras relaciones comerciales.

3.3. Revocación de acceso

Una empresa puede retirar el acceso de una persona a su espacio.

La revocación:

- No elimina la cuenta personal del usuario.
- No elimina el negocio propio del profesional.
- No borra los registros históricos de las órdenes.
- No concede a ninguna de las partes acceso a información privada que no le corresponda.

3.4. Separación entre empresas

La seguridad entre empresas es un requisito central.

Ejemplos:

- Un contratista solo puede consultar las órdenes que le fueron asignadas o que creó en su propio espacio.
- Un profesional solo puede consultar sus asignaciones y sus propios registros.
- Una administradora solo puede consultar sus órdenes y la información que le corresponde.
- Un profesional no puede consultar las órdenes privadas de otros contratistas para los que trabaja.

El servidor debe comprobar los permisos en cada operación. Ocultar información en la interfaz no es suficiente.

3.5. Registros contables después de terminar una relación

Cuando termina la relación entre un profesional y un contratista, cada parte conserva sus propios registros.

Ambas partes pueden descargar sus registros contables en PDF o Excel.

El acceso no expira: cada parte conserva acceso de solo lectura a sus propios registros contables de esa relación —costos, facturas y pagos— y puede descargarlos en PDF o Excel en cualquier momento, incluida después de finalizada la relación. La revocación de acceso al espacio (ver 3.3) no elimina este acceso a los propios registros.

⸻

4. Propiedades e inquilinos

4.1. Información del propietario

El registro puede incluir:

- Nombre y apellido.
- Teléfono.
- Correo electrónico.
- Dirección.
- Ciudad.
- Estado.
- Código postal.

4.2. Información de la propiedad

La ficha de una propiedad puede incluir:

- Dirección completa.
- Estado de ocupación: ocupada o vacante.
- Comunidad o complejo al que pertenece, si corresponde.
- Código de acceso a la comunidad, cuando corresponda y con acceso restringido.
- Instrucciones de entrada.
- Autorización para ingresar cuando el inquilino no está presente.
- Información sobre mascotas y precauciones necesarias.
- Otras instrucciones operativas relevantes.

El código de lockbox no se guarda aquí: vive en cada orden de trabajo, porque puede cambiar periódicamente (ver 5.8). El código de acceso a la comunidad sí se registra en la propiedad, con acceso restringido; cuando cambie con frecuencia puede asentarse también en la orden (ver 5.8).

4.3. Información del inquilino

Cuando la propiedad está ocupada, se pueden registrar:

- Nombre o nombres.
- Teléfono o teléfonos.
- Dirección, cuando corresponda.
- Horarios o franjas horarias disponibles para la visita.

Si la propiedad está vacante, no se deben exigir datos de inquilino.

Los propietarios, los inquilinos y los clientes propios de un profesional pueden tener una cuenta con acceso limitado: consultar el estado de las órdenes de la vivienda o de la relación que les corresponde y comunicar pedidos. No ven costos, facturas ni información de otras propiedades o relaciones. Su pedido de trabajo lo transforma en orden un usuario de la empresa correspondiente (ver 5.1).

4.4. Actualización de datos

Los datos de una propiedad o un inquilino pueden cambiar después de crear una orden.

El profesional asignado debe consultar la información operativa vigente que necesita para realizar el trabajo.

Los cambios importantes deben registrar quién los hizo y cuándo.

La administradora mantiene los datos oficiales de la propiedad. El contratista puede modificar las instrucciones de una orden que gestiona, pero no los datos oficiales de la propiedad. El profesional puede informar que existe un error, sin modificar directamente el registro oficial.

4.5. Protección de datos sensibles

La información de acceso, los códigos y los datos del inquilino deben compartirse únicamente con quienes los necesiten para la orden correspondiente.

Cuando un profesional pierde la asignación, pierde también el acceso operativo a la información sensible de esa asignación, sin que ello elimine el historial que legítimamente le corresponde conservar.

⸻

5. Órdenes de trabajo

5.1. Quién puede crear una orden

Una orden puede ser creada por:

- Una administradora.
- Un contratista.
- Un profesional independiente para un cliente propio.

Los inquilinos, propietarios y clientes propios pueden tener cuenta con acceso limitado (ver 4.3), pero no crean órdenes por sí mismos: su pedido se transforma en una orden creada por un usuario de la empresa o profesional con el que se relacionan.

Toda orden debe estar vinculada a una propiedad. Si el contratista o el profesional trabaja para un cliente que todavía no tiene una propiedad registrada, debe crear primero una ficha, que puede ser mínima (dirección y datos de contacto).

El sistema no debe exigir que todas las órdenes pasen por una administradora o por un contratista.

5.2. Destino de la orden

Cuando una administradora crea una orden, puede enviarla:

- Directamente a un profesional.
- A un contratista, que puede gestionar y distribuir los trabajos necesarios.

Un contratista también puede crear órdenes propias y asignarlas a profesionales.

Un profesional independiente puede crear órdenes para sus propios clientes.

5.3. Alcance de una orden

Cada orden debe describir claramente el trabajo solicitado.

Por ejemplo:

- Revisar un triturador de basura.
- Reparar una fuga.
- Reemplazar un equipo.
- Reparar una pared de drywall.

Una orden de trabajo encarga resolver el problema descrito, no solamente observarlo. El profesional puede diagnosticar la causa y realizar la reparación o el reemplazo razonablemente necesario para resolver ese problema, siempre dentro del alcance y de los límites económicos y autorizaciones aplicables.

Por ejemplo, una orden titulada «Revisar triturador» significa que el profesional debe determinar por qué no funciona y resolver la falla, ya sea reparándolo o reemplazándolo si eso resulta necesario y está permitido por las condiciones económicas de la orden. No significa que deba limitarse a inspeccionarlo.

Que una orden no tenga límite económico no autoriza trabajos ajenos al problema original. Tampoco el límite económico, por sí solo, autoriza un trabajo independiente solicitado durante la visita.

Ejemplo: si durante la reparación del triturador el ocupante pide arreglar también un grifo que funciona de manera independiente, ese segundo trabajo debe informarse a la entidad originadora de la orden. Solo esa entidad, mediante un usuario autorizado para actuar en su nombre, puede aprobarlo. Si lo aprueba como trabajo adicional, se agrega a la misma orden como un trabajo separado. El ocupante no puede autorizarlo en nombre de la administradora, salvo que actúe formalmente como usuario autorizado de esa entidad.

Si el cliente cambia el objetivo principal por otro trabajo diferente, no se debe reemplazar silenciosamente el alcance original. Si todavía no se realizó ningún trabajo, la orden original puede cancelarse con el motivo correspondiente y crearse una nueva orden vinculada a la anterior. Si ya se realizó cualquier trabajo, no se cancela la orden completa: se conserva el trabajo realizado y su historial, y el cambio de objetivo se documenta mediante una nueva orden vinculada cuando corresponda. Los trabajos adicionales que sean autorizados por la entidad originadora de la orden se agregan a esa misma orden como trabajos separados, conservando su descripción, autorización, responsable, costos y estado.

5.4. Presupuesto y orden de trabajo son procesos diferentes

Un presupuesto es una estimación previa que se solicita cuando el cliente necesita conocer el costo antes de decidir si autoriza la reparación. Puede requerir una visita de inspección, diagnóstico y presentación del precio estimado; por sí solo no autoriza a ejecutar la reparación.

Una orden de trabajo, en cambio, encarga resolver el problema descrito, sujeto a su alcance, a las políticas aplicables y a los límites de gasto. El profesional puede determinar durante el trabajo si la solución necesaria es reparar o reemplazar el componente afectado, siempre que respete esas condiciones.

No se deben generar presupuestos automáticamente para cada orden ni para cada visita.

5.5. Órdenes compuestas

Una orden original puede incluir distintos trabajos.

Ejemplo:

- Reparación de drywall.
- Reemplazo de triturador.
- Revisión del aire acondicionado.

El contratista puede dividir la orden en trabajos separados y asignarlos a profesionales diferentes.

Cada trabajo debe mantener su propia información operativa, instrucciones, asignación, estado, costos y evidencias.

Los trabajos independientes pueden avanzar según sus propias autorizaciones, sin tener que esperar necesariamente a que se resuelvan las demás partes.

5.6. Aceptación y rechazo

- El contratista puede aceptar o rechazar una orden que recibe de una administradora.
- El profesional puede aceptar o rechazar una asignación de un contratista o una administradora.
- Si un contratista rechaza una orden, la administradora puede crear una nueva orden para otro contratista, conservando la referencia a la rechazada; la orden rechazada no se reabre (ver 20.1).
- Si un profesional rechaza un trabajo, el responsable —la entidad originadora de la orden o el contratista que la gestiona, según corresponda— puede reasignarlo. Si se determina que el trabajo no puede realizarse, debe registrarse «No pudo concretarse» con el motivo, respetando las reglas de cancelación de la orden original.

El rechazo corresponde a una asignación concreta y no equivale a cancelar el trabajo subyacente. Si un profesional rechaza la asignación, el trabajo permanece pendiente para que el responsable lo reasigne. Si finalmente no puede realizarse, se registra el resultado «No pudo concretarse» con el motivo. El rechazo y la nueva asignación deben quedar registrados por separado.

5.7. Reasignaciones

Un trabajo puede reasignarse si el profesional lo rechaza antes de aceptarlo o si, después de aceptarlo, no puede completarlo. El responsable debe registrar el motivo cuando corresponda. La reasignación crea una nueva asignación y conserva el historial de las anteriores.

El sistema debe conservar el historial de las asignaciones anteriores, quién trabajó en cada etapa y las acciones realizadas.

Cuando el profesional deja de estar asignado, pierde el acceso operativo correspondiente, salvo que exista un permiso específico para alguna acción posterior.

5.8. Información de acceso de la orden

La orden puede registrar la información de acceso de la visita:

- Código de lockbox, si existe.
- Código de acceso a la comunidad, cuando cambie con frecuencia.
- Instrucciones de entrada específicas de esa visita, cuando difieran de las de la propiedad.

Esta información vive en la orden, no en la ficha de la propiedad, porque los códigos rotan con el tiempo. El profesional asignado la ve mientras mantiene la asignación; al perderla, pierde también el acceso a estos datos (ver 4.5).

⸻

6. Seguimiento y finalización de trabajos

6.1. Trabajo del profesional

El profesional asignado puede registrar:

- Avance.
- Resultado del trabajo.
- Fecha y hora relevantes.
- Materiales utilizados.
- Costos y mano de obra.
- Fotografías o evidencias, cuando correspondan.
- Tareas que quedan pendientes.
- Motivo por el que no pudo completar el trabajo.

El profesional marca su propio trabajo como terminado. No debe marcar como ejecutado el trabajo de otro profesional.

6.2. Trabajo incompleto

Si el profesional descubre que no puede completar su trabajo, debe informar qué ocurrió y por qué.

El contratista o la entidad originadora de la orden decide qué hacer después, según la relación comercial y los permisos correspondientes.

Las opciones pueden incluir:

- Resolver el problema con el profesional actual.
- Reasignar el trabajo.
- Si se determina que no puede realizarse, registrar esa parte como «No pudo concretarse», indicando el motivo. No se elimina el trabajo ni su historial.

La imposibilidad de completar una parte no cancela la orden original. Esa parte debe quedar identificada como «No pudo concretarse», con el motivo y el historial de las acciones realizadas. Los demás trabajos de la orden continúan según corresponda.

6.3. Trabajo que no pudo concretarse

Cuando una parte de una orden no pueda realizarse, el responsable debe registrar ese resultado como «No pudo concretarse», junto con el motivo y una explicación.

Las fotografías u otras evidencias son opcionales.

El sistema conserva el historial, los costos y las acciones realizadas. Este estado corresponde únicamente al trabajo afectado y no cancela la orden ni modifica automáticamente el estado de los demás trabajos.

6.4. Cierre de la orden original

Hay que distinguir entre completar un trabajo individual y cerrar la orden original.

- Cada profesional informa y marca la finalización de su propio trabajo.
- El contratista supervisa las partes que gestiona y presenta los resultados a quien encargó la orden.
- La entidad originadora de la orden original tiene la autoridad para cerrarla.

Si una administradora abrió la orden, la cierra un usuario autorizado de esa administradora.

Si el contratista abrió su propia orden, la cierra el contratista responsable.

Si un profesional independiente abrió una orden para un cliente propio, la cierra el responsable de ese negocio.

El sistema debe registrar por separado quién creó la orden, qué entidad es originadora de ella y qué usuario realizó el cierre.

Una orden compuesta puede cerrarse cuando cada trabajo incluido está terminado o tiene registrado que «No pudo concretarse», con su motivo. No debe cerrarse mientras haya trabajos pendientes, asignados, aceptados, en curso o incompletos que todavía deban continuar. Una asignación rechazada o revocada que se conserva únicamente como historial no bloquea por sí sola el cierre; debe comprobarse el estado del trabajo al que correspondía.

⸻

7. Fotografías, documentos e historial

7.1. Archivos

La plataforma debe permitir adjuntar fotografías y documentos a una orden o a un trabajo específico.

La administradora o el contratista pueden compartir instrucciones visuales, fotografías y documentos relevantes.

El profesional puede adjuntar evidencias durante el trabajo, al terminarlo o cuando no puede completarlo.

Las fotografías de antes y después son opcionales en el alcance inicial.

7.2. Historial de la propiedad

La plataforma debe conservar un historial de las reparaciones, incluyendo:

- Dirección de la propiedad.
- Trabajo realizado.
- Fechas relevantes.
- Costos registrados.
- Órdenes relacionadas.

El profesional puede consultar su propio historial de trabajos en una dirección, incluso si esos trabajos están cerrados.

No puede consultar automáticamente trabajos privados realizados por otros profesionales.

7.3. Historial del contratista

El contratista conserva el historial de las órdenes que gestionó, las administradoras relacionadas, los profesionales asignados y los costos comunicados.

No puede consultar las órdenes privadas de un profesional que no formen parte de sus propias relaciones comerciales.

7.4. Historial de la administradora

La administradora conserva el historial de sus órdenes, los contratistas responsables, los resultados y los costos presentados.

No necesita acceder automáticamente al detalle privado de las asignaciones individuales de cada profesional.

7.5. Compartir antecedentes de otras reparaciones

Un contratista o una administradora puede compartir expresamente antecedentes relevantes para una nueva reparación.

Sin esa autorización, un profesional no puede consultar automáticamente fotografías privadas, costos, identidades u órdenes de otros profesionales en la misma propiedad.

7.6. Datos operativos temporales del contratista

El contratista puede acceder a los datos operativos necesarios mientras gestiona una orden.

Al cerrarse o cancelarse, conserva el historial mínimo necesario, como dirección, trabajo, fechas y costos, sin recibir automáticamente una ficha permanente completa de la propiedad.

⸻

8. Costos y autorizaciones económicas

8.1. Registro de costos

El profesional debe poder revisar los costos de materiales, mano de obra y otros conceptos pertinentes antes de enviarlos.

La información no debe enviarse automáticamente sin una acción de confirmación del profesional.

El destinatario depende de la relación comercial: puede ser el contratista, la administradora o el cliente propio del profesional.

Después de confirmar el envío, la plataforma puede notificar al destinatario por correo electrónico.

8.2. Corrección de costos

Si el profesional detecta un error después de enviar los costos, debe poder comunicar una corrección.

El sistema conserva el importe original, la corrección, las fechas y el historial correspondiente. El destinatario original recibe la notificación de la corrección.

Una corrección de costos no modifica automáticamente una factura ya emitida.

8.3. Costos y precios comerciales diferentes

Los costos y precios de cada relación comercial se mantienen separados.

Por ejemplo:

- El profesional cobra USD 200 al contratista.
- El contratista cobra USD 280 a la administradora.

Son importes ilustrativos. El sistema no debe asumir que el precio cobrado por el contratista al cliente es igual al que paga al profesional.

Cada parte ve la información económica que corresponde a su relación comercial.

8.4. Límites de gasto

Una entidad puede establecer una política general de límite de gasto.

Por ejemplo, una administradora puede trabajar con un límite de USD 250 para ciertas órdenes.

Al crear cada orden, el usuario autorizado decide si se aplica el límite general. Si esa es la política habitual, debe aplicarse por defecto.

El límite puede ser:

- Un importe máximo aprobado.
- Sin límite económico, cuando no se configura un máximo.

El límite cubre el costo total aplicable, incluidos materiales y mano de obra.

Si el costo conocido desde el principio supera el límite, se necesita autorización antes de comenzar el trabajo que excede lo permitido.

Si el exceso se descubre durante el trabajo, el profesional debe detenerse antes de comprometer el gasto adicional y solicitar autorización.

La autorización para superar el límite de gasto corresponde exclusivamente a la entidad originadora de la orden, mediante un usuario autorizado para actuar en su nombre. Un contratista no puede aprobar por sí solo un gasto que supere un límite impuesto por la entidad originadora de la orden.

La autorización para realizar cualquier trabajo adicional también corresponde exclusivamente a la entidad originadora de la orden, mediante un usuario autorizado para actuar en su nombre. El contratista o el profesional pueden informar, justificar y proponer el trabajo, pero no autorizarlo por cuenta propia. Una vez autorizado, el trabajo adicional debe agregarse a la misma orden como un trabajo diferenciado, dejando constancia de quién lo autorizó, cuándo, cuál es su alcance y qué límite económico le resulta aplicable. Esta regla es independiente del acuerdo sobre el precio comercial entre las partes.

8.5. Margen comercial opcional de hasta el 20 %

La plataforma puede permitir registrar un margen comercial de hasta el 20 % cuando un usuario autorizado lo active expresamente. El margen es una referencia para calcular o acordar precios comerciales; no aumenta por sí mismo el límite de gasto de la orden ni autoriza gastos adicionales.

Reglas del margen:

- Debe estar activado expresamente y quedar registrado en la orden.
- No se aplica automáticamente si no está activado.
- No modifica el límite de gasto aprobado por la entidad originadora de la orden.
- No permite al contratista superar un límite impuesto por la administradora.
- Si el costo real previsto supera el límite autorizado, se necesita la autorización explícita de la entidad originadora de la orden antes de comprometer el gasto adicional.
- Desactivar el margen no borra importes, cálculos ni autorizaciones históricas.

Ejemplo:

- Límite de gasto autorizado: USD 250.
- Margen comercial configurado del 20 %: USD 50 como referencia de cálculo comercial.
- El margen no convierte el límite de gasto en USD 300.
- Si el trabajo requiere comprometer un gasto superior a USD 250, se debe obtener autorización expresa de quien originó la orden antes de comprometer ese gasto.

El gasto real debe conservarse aunque supere el límite. Registrar un exceso no significa que haya sido autorizado.

8.6. Emergencias

Las políticas de emergencia se configuran por empresa como política general. Una relación comercial puede sobreescribir esa política cuando sus condiciones difieran —por ejemplo, un cliente propio de un profesional con una política distinta a la de una administradora—. La política vigente de una orden es la de la relación comercial correspondiente, o la general de la empresa si la relación no define una propia.

Pueden contemplar:

- Resolver sin autorización previa.
- Solicitar autorización antes de intervenir.
- Permitir un importe adicional previamente autorizado para emergencias.

Si existe peligro inmediato, el profesional puede realizar las medidas mínimas razonables necesarias para controlar ese peligro, sin convertir esa excepción en una autorización automática para toda la reparación.

Cuando sea posible sin retrasar la intervención, el profesional registra una estimación del costo. Una vez controlado el peligro, registra los costos reales y los comprobantes disponibles.

Si se necesita una decisión y el contacto habitual no responde, se aplica el mecanismo de contacto alternativo o escalación configurado. La falta de respuesta no equivale a una autorización.

8.7. Autorizaciones fuera de la plataforma

Las autorizaciones recibidas por teléfono u otro medio deben poder dejarse registradas en la orden, identificando la autorización y la persona que la concedió.

El sistema debe conservar trazabilidad suficiente para distinguir el gasto realizado, el límite inicial y las autorizaciones adicionales.

El procedimiento definitivo para registrar, confirmar y corregir estas autorizaciones queda sujeto a una revisión de simplicidad antes de diseñar la implementación.

8.8. Diagnóstico y resolución del problema

Una orden de trabajo busca resolver el problema descrito. El profesional debe diagnosticar la causa y determinar la solución razonable, que puede ser reparar o reemplazar el componente afectado.

Por ejemplo, si la orden dice «Revisar triturador» y el diagnóstico demuestra que el triturador no puede repararse razonablemente y debe reemplazarse, el profesional puede realizar el reemplazo sin pedir una nueva aprobación específica si el reemplazo es necesario para resolver la falla original y el costo total queda dentro del límite autorizado o no existe un límite económico configurado. Debe respetar, además, cualquier política expresa aplicable a la orden.

Si el costo supera el límite, debe solicitar autorización antes de comprometer el gasto que excede lo permitido. Si se descubre un problema independiente que no es necesario para resolver la falla original, se aplican las reglas de trabajos adicionales; estar dentro del límite no autoriza por sí solo ese otro trabajo.

Si lo solicitado es un presupuesto, y no una orden de trabajo, la visita sirve para diagnosticar y estimar el precio. La reparación no se ejecuta hasta que el cliente o la entidad autorizada apruebe el presupuesto y se genere o confirme la correspondiente orden de trabajo.

⸻

9. Trabajos adicionales y cambios en el alcance

Un trabajo adicional es diferente de un gasto adicional.

Por ejemplo, una orden autoriza reemplazar un triturador por USD 110 y durante la visita se descubre que también hace falta cambiar una válvula.

Deben distinguirse:

- El trabajo original.
- El trabajo adicional.
- El costo adicional.
- El precio comercial adicional.
- El límite de gasto.
- La autorización para realizar el nuevo trabajo.

Estar dentro del límite de gasto no autoriza automáticamente un trabajo independiente ni determina el precio comercial que se cobrará. Sin embargo, una intervención directamente necesaria y razonable para completar el trabajo original puede formar parte de su alcance práctico.

Ejemplo: la orden pide reemplazar un grifo de baño. Al cerrar la válvula de paso para hacer el trabajo, la válvula empieza a perder y no es posible completar correctamente la reparación sin resolver esa fuga. La reparación de la válvula puede considerarse relacionada y necesaria para completar el trabajo original. Si el costo total queda dentro del límite autorizado, puede realizarse sin una autorización adicional de alcance, siempre que no exista una política expresa que exija aprobación. Si el costo supera el límite, se debe obtener autorización para excederlo antes de comprometer ese gasto.

En cambio, reparar otro grifo que no está relacionado con la intervención original es un trabajo adicional independiente. El profesional debe informar a la entidad originadora de la orden y esperar su autorización antes de empezar. Si se autoriza, se agrega a la misma orden como un trabajo separado; no se crea una orden nueva únicamente por tratarse de un trabajo adicional.

El contratista debe informar y proponer el trabajo adicional a la entidad originadora de la orden. No puede autorizarlo por sí mismo. La entidad originadora decide si lo aprueba y, si lo hace, el trabajo adicional se agrega a esa misma orden como un trabajo separado.

Cuando la orden fue creada por un profesional independiente para su propio cliente, ese profesional es la entidad originadora y debe registrar la autorización del cliente según la relación comercial aplicable.

Si no hay respuesta, se espera y se utilizan los recordatorios o mecanismos de escalación configurados. El silencio nunca autoriza el trabajo adicional.

Si el cliente solicita cambiar por completo el objetivo principal, se debe documentar el cambio sin borrar el alcance original. Si no se realizó ningún trabajo, puede cancelarse la orden y crearse otra vinculada. Si ya se realizó algún trabajo, la orden original no puede cancelarse; el nuevo objetivo se registra en una orden separada vinculada, salvo que la entidad originadora de la orden decida autorizarlo expresamente como trabajo adicional de esa misma orden.

⸻

10. Materiales, adelantos y gastos

10.1. Materiales y mano de obra

Los materiales y la mano de obra deben registrarse por separado.

Por ejemplo:

- Materiales: USD 90.
- Mano de obra: USD 110.
- Subtotal: USD 200, antes de los impuestos que correspondan.

Si el contratista compra los materiales, el profesional factura únicamente los conceptos que le corresponden, como su mano de obra.

10.2. Comprobantes

El profesional puede adjuntar tickets o recibos de compra de materiales.

Estos comprobantes respaldan el gasto, pero no sustituyen la factura que el profesional o contratista debe emitir a su cliente.

10.3. Herramientas y desplazamientos

El uso de herramientas propias no genera automáticamente un gasto adicional.

El alquiler de herramientas puede registrarse como concepto independiente cuando exista realmente.

Los gastos de desplazamiento son opcionales. Combustible, peajes, estacionamiento y otros gastos se registran cuando corresponden; no se agregan automáticamente.

La primera versión no contempla facturación por hora como modelo obligatorio. Los precios se basan en trabajos o servicios con importes definidos.

10.4. Adelantos para materiales

Si se entrega dinero por adelantado para comprar materiales, el sistema debe registrar:

- Importe adelantado.
- Gastos realizados.
- Comprobantes disponibles.
- Saldo sin utilizar.
- Devolución del dinero sobrante.
- Justificación del gasto.
- Asignación explícita a otra orden, cuando corresponda.

Debe distinguirse entre un anticipo que se descuenta de una factura, un reembolso de gastos y un fondo que debe justificarse.

10.5. Devoluciones a la tienda

Cuando se devuelven materiales a la tienda, la devolución se registra como un movimiento separado.

Se conserva la compra original y se calcula el costo neto teniendo en cuenta la devolución.

10.6. Materiales sobrantes

El sistema debe permitir registrar materiales que no se utilizaron y su destino:

- Se conservan para otro trabajo.
- Vuelven al inventario del contratista.
- Se devuelven a la tienda.

Debe quedar claro quién pagó los materiales, quién los tiene y dónde se utilizarán.

Como regla general, el material pertenece a quien lo pagó, salvo que exista otro acuerdo.

⸻

11. Facturación formal

11.1. Emisión de facturas

La plataforma permitirá crear y emitir facturas formales.

Una factura puede incluir:

- Número.
- Fecha.
- Datos del emisor.
- Datos del destinatario.
- Propiedad y órdenes o trabajos relacionados.
- Líneas de materiales.
- Mano de obra.
- Alquiler de herramientas, cuando corresponda.
- Desplazamiento y otros cargos, cuando correspondan.
- Subtotal.
- Impuestos aplicables.
- Total.
- Pagos registrados.
- Saldo pendiente.

Debe poder generarse un PDF descargable.

Una factura puede incluir trabajos de varias órdenes. Cada línea referencia el trabajo y la orden de la que proviene. En la primera versión, los flujos de negocio facturan por orden: las facturas del contratista a una administradora corresponden siempre a una sola orden aceptada, y el profesional factura su trabajo individual conforme a 11.4.

El emisor y el destinatario pueden registrar la recepción o realización de un pago. Si ambos registran una operación que parece corresponder al mismo pago, la plataforma debe señalar la posible duplicación y conservar ambos registros. Para conciliarlos se comparan, como mínimo, el importe, la fecha, la referencia o comprobante y las partes involucradas. Hasta que se resuelva la coincidencia, el posible duplicado no debe sumarse dos veces al total pagado. La conciliación debe dejar constancia de quién la resolvió, cuándo y qué registros se vincularon. Ningún registro se sobrescribe ni se elimina silenciosamente.

11.2. Estados de factura

La factura puede encontrarse en los siguientes estados:

- Borrador: todavía no fue emitida y puede editarse.
- Emitida / pendiente de pago: fue emitida y no registra pagos.
- Parcialmente pagada: recibió uno o más pagos, pero mantiene un saldo pendiente.
- Pagada: el saldo pendiente es cero.
- Vencida: pasó la fecha de vencimiento y mantiene un saldo pendiente.
- Anulada: fue anulada mediante un procedimiento que conserva el documento original y su historial.

El estado de vencida depende de la fecha de vencimiento y del saldo pendiente. Una factura parcialmente pagada puede pasar a vencida si vence el saldo restante. La factura emitida no es un estado final: puede recibir pagos, quedar vencida o ser anulada conforme a las reglas aplicables. El sistema debe registrar los pagos parciales, pagos completos, fechas y saldo pendiente.

11.3. Facturas independientes

Cada relación comercial tiene sus propias facturas.

Por ejemplo, el profesional puede facturar al contratista y el contratista a la administradora. No es una única factura compartida.

Las facturas son privadas entre el emisor y el destinatario correspondiente, salvo que exista autorización expresa para compartirlas.

En particular, la administradora solo puede ver las facturas emitidas por la entidad a la que le envió la orden de trabajo. No ve las facturas de otras relaciones comerciales —por ejemplo, las que un profesional emite a un contratista distinto—, salvo autorización expresa.

11.4. Facturar sin cerrar la orden

Un profesional puede emitir la factura de su trabajo individual cuando ese trabajo está terminado, aunque la orden general siga abierta porque otros profesionales todavía están trabajando.

Emitir una factura no significa que la orden esté cerrada ni que el cliente haya pagado.

11.5. Errores en facturas

Una factura emitida no debe editarse o borrarse silenciosamente.

Si contiene un error, se debe corregir o anular mediante un procedimiento que conserve el documento original, el historial de cambios y los pagos relacionados.

El mecanismo exacto dependerá también de las obligaciones fiscales aplicables.

11.6. Alcance fiscal

Un PDF con apariencia de factura no garantiza por sí solo el cumplimiento de todos los requisitos fiscales.

Para la primera versión, la jurisdicción aplicable es Estados Unidos, estado de Nevada. Las facturas se emiten como PDF con numeración propia, sin facturación electrónica.

Cada empresa tiene un perfil fiscal configurable por un usuario con rol de máxima jerarquía en la empresa: identificación fiscal, dirección fiscal, tasa de impuesto por defecto y bandera de exención. La tasa vive en la configuración —no en el código— y puede ajustarse por factura al emitir, porque Nevada aplica la tasa del lugar donde se recibe el servicio.

Quien emite la factura marca línea por línea qué conceptos son imponibles; no hay reglas fijas por tipo de emisor y destinatario. Al emitir, la plataforma calcula el impuesto sobre las líneas imponibles, lo congela junto al subtotal y el total, y lo muestra en el PDF y en la exportación contable. Las facturas anteriores a esta regla conservan sus importes con impuesto cero. El registro y la presentación de declaraciones ante el departamento de impuestos quedan fuera del sistema, a cargo del emisor.

⸻

12. Correcciones, historial y trazabilidad

El sistema debe conservar el historial de las operaciones importantes.

Entre ellas:

- Creación, aceptación y rechazo de órdenes.
- Asignaciones y reasignaciones.
- Trabajos completados, que no pudieron concretarse o cancelados.
- Cambios importantes en los datos de propiedades.
- Costos enviados y corregidos.
- Autorizaciones económicas.
- Facturas emitidas, corregidas o anuladas.
- Pagos, conciliaciones de pagos y devoluciones.
- Cambios de permisos y revocaciones de acceso.

El historial debe permitir identificar quién realizó la acción y cuándo, de acuerdo con la naturaleza del registro.

No se deben eliminar silenciosamente gastos, facturas, autorizaciones ni documentos que deban conservarse.

⸻

13. Garantías y reparaciones repetidas

La plataforma debe permitir relacionar un reclamo de garantía con la reparación original.

El registro debe conservar la información disponible sobre:

- Orden original.
- Trabajo realizado.
- Profesional que lo ejecutó.
- Fechas.
- Materiales y costos.
- Fotografías y documentos.
- Reclamo posterior y su resolución.

Un reclamo de garantía no implica automáticamente que la cobertura esté aprobada ni que se autorice un nuevo trabajo.

El reclamo formal lo inicia y gestiona la entidad originadora de la orden original dentro de su propio espacio.

Un inquilino puede informar a la administradora de un problema con una reparación, pero no necesita abrir directamente un reclamo formal dentro del sistema.

El proceso debe respetar la separación entre las órdenes privadas de administradoras, contratistas y profesionales.

⸻

14. Comunicaciones y notificaciones

14.1. Correo electrónico

El correo electrónico se utilizará para las comunicaciones relevantes, entre ellas:

- Invitaciones a empresas.
- Asignaciones de trabajo.
- Notificaciones de nuevas órdenes.
- Avisos sobre cambios de asignación.
- Solicitudes de autorización.
- Envío de costos.
- Correcciones de costos.
- Notificaciones relevantes sobre facturas y pagos.

Las órdenes pueden enviarse por correo electrónico cuando corresponda, sin que el correo sustituya el registro de la orden dentro de la plataforma.

Las comunicaciones importantes deben identificar la orden relacionada y evitar compartir información que el destinatario no esté autorizado a ver.

14.2. Solicitudes urgentes

Una orden puede marcarse como urgente.

Las empresas podrán configurar plazos, recordatorios y escalaciones para solicitudes que requieren una respuesta rápida.

La falta de respuesta no autoriza gastos ni trabajos adicionales.

Las emergencias con peligro inmediato se rigen por la política de emergencia, no únicamente por el nivel de urgencia de una notificación.

14.3. SMS

Los mensajes SMS quedan pospuestos hasta validar el funcionamiento de las asignaciones y el seguimiento de trabajos.

⸻

15. Suscripciones y modelo comercial

La definición de los planes y precios quedó cerrada en 18.3, al terminar el relevamiento funcional.

Se contemplarán al menos tres categorías:

- Profesional independiente.
- Contratista.
- Administradora de propiedades.

No necesariamente deben pagar el mismo importe, ya que sus necesidades, volumen de trabajo y funciones son diferentes.

El modelo deberá contemplar a las personas que tienen un negocio propio y, al mismo tiempo, participan en espacios de otras empresas, evitando cargos duplicados sin una razón clara.

Regla acordada para eso: una persona que tiene su propio negocio y además participa en el espacio de otra empresa paga únicamente su plan propio; participar en el espacio de otra empresa no genera un cargo adicional. Cada empresa paga su propio plan según su categoría.

Los planes no tienen límites de uso ni funciones diferenciadas en la primera versión; sus precios se fijarán cuando haya uso real (18.3).

⸻

16. Seguridad y privacidad

La seguridad debe formar parte del diseño desde el principio.

Requisitos principales:

1. Verificar los permisos en el servidor para cada operación.
2. Separar los espacios de distintas empresas.
3. Limitar la información visible a lo necesario para cada trabajo.
4. Proteger los códigos de acceso, los datos de inquilinos y demás información sensible.
5. Restringir el acceso a fotografías y documentos según sus permisos.
6. Revocar el acceso operativo cuando termina una asignación o relación, sin borrar indebidamente los registros.
7. Mantener el historial de acciones relevantes.
8. Evitar que una persona consulte órdenes privadas de otras empresas.
9. Separar los costos y las facturas de cada relación comercial.
10. Comprobar que las descargas de PDF y Excel respeten los permisos de quien las solicita.

⸻

17. Alcance inicial y prioridades

La plataforma se construirá por etapas. El objetivo no es desarrollar todo de una vez.

La primera etapa debe establecer una base segura y funcional para gestionar las entidades, los usuarios, las propiedades, las órdenes y las asignaciones.

Una posible organización inicial es:

Etapa 1 — Base del sistema

- Cuentas y autenticación.
- Empresas y espacios de trabajo.
- Invitaciones por correo electrónico.
- Roles y permisos.
- Separación de información entre empresas.
- Historial de acciones (audit log): desde el inicio, porque agregar trazabilidad sobre un modelo ya construido es mucho más costoso.

Etapa 2 — Propiedades y órdenes

- Propiedades e inquilinos.
- Cuentas con acceso limitado para propietarios, inquilinos y clientes propios (ver 4.3 y 5.1).
- Creación de órdenes.
- Alcance de los trabajos.
- Asignación, aceptación y rechazo.
- Órdenes compuestas y división de trabajos.
- Notificaciones in-app básicas, para poder probar los flujos de aceptación y rechazo sin depender del correo.

Etapa 3 — Seguimiento

- Avances y finalización.
- Trabajos incompletos.
- Reasignaciones, trabajos que no pudieron concretarse y cancelaciones.
- Fotografías, documentos e historial.

Etapa 4 — Costos y autorizaciones

- Materiales y mano de obra.
- Límites de gasto.
- Margen comercial opcional, sin aumento automático del límite de gasto.
- Autorizaciones y emergencias.
- Correcciones de costos.

Etapa 5 — Facturación y pagos

- Facturas.
- PDF.
- Pagos parciales y completos.
- Saldos y correcciones.
- Descargas contables.

Etapa 6 — Funciones complementarias

- Garantías.
- Notificaciones avanzadas.
- Suscripciones.
- Integraciones y automatizaciones.

Esta secuencia es una propuesta de organización, no una autorización para comenzar a implementar. Las dependencias técnicas y el alcance final deberán revisarse después de aprobar los requisitos.

⸻

18. Decisiones que todavía conviene revisar

La lista siguiente no significa que haya que decidir todo ahora. Sirve para distinguir las cuestiones que pueden necesitar una definición adicional de las reglas que ya están acordadas.

18.1. Funcionamiento del negocio

- Definir un procedimiento simple para registrar una autorización recibida por teléfono: quién autorizó, cuándo, qué autorizó y quién registró la constancia. El registro debe respetar la regla de que solo la entidad originadora de la orden puede autorizar trabajos adicionales y superar su límite de gasto.

18.2. Facturación y obligaciones fiscales — resuelto el 19/10/2026

- Requisitos del documento: PDF con datos de emisor (incluido su ID fiscal), destinatario, número consecutivo propio, fechas, propiedades/trabajos, líneas, subtotal, impuesto (tasa e importe) y total.
- Tratamiento de impuestos: perfil fiscal por empresa sobre Nevada; la imponibilidad la decide el emisor línea por línea; cálculo y congelado al emitir; cobranza y declaraciones fuera del sistema.

18.3. Suscripciones — resuelto el 18/10/2026

- Los planes no tienen límites de uso ni funciones diferenciadas: todas las categorías reciben todas las funciones; la diferencia entre categorías es la naturaleza del trabajo de cada una.
- Los precios se fijarán cuando haya uso real; mientras tanto, los importes son de ejemplo —33 USD el profesional, 66 USD el contratista y 99 USD la administradora, por mes— y pueden ajustarse sin cambiar el modelo.
- El sistema administra los planes y a qué empresa corresponde cada uno. La cobranza se realiza fuera del sistema; integrar cobros automáticos es una decisión futura que requeriría un proveedor de pagos.

18.4. Detalles de funcionamiento por definir durante el diseño — resueltos el 18/10/2026

- Plazos de respuesta y escalación para solicitudes urgentes: cada empresa configura el plazo de respuesta de una orden urgente, con 24 horas por defecto. A mitad del plazo se recuerda a quien debe responder y al vencer se escala al responsable de la empresa. La falta de respuesta no autoriza gastos ni trabajos adicionales (14.2).
- Reglas específicas de las notificaciones: los avisos siempre quedan en la aplicación; cada usuario puede decidir, según el tipo de aviso, si además recibe correo. Los avisos transaccionales se envían por correo de manera predeterminada. Los SMS siguen pospuestos (14.3).
- Procedimientos de corrección de registros erróneos: los datos de referencia —propiedad, inquilino, contactos, títulos de órdenes en borrador— pueden corregirse sobre el registro, dejando constancia en la auditoría. Los estados, el historial y los registros económicos nunca se modifican: se corrigen mediante un registro nuevo enlazado que indica el motivo, como ya ocurre con las facturas anuladas, las devoluciones y las asignaciones nuevas.
- Requisitos detallados para la conservación de documentos: conservación permanente, sin borrado automático. Los respaldos se realizan mediante descargas.
- Necesidades concretas de informes y descargas: se mantienen la descarga contable por periodo y las listas por entidad; no se agregan nuevos informes en la primera versión.
- Casos excepcionales de conciliación de pagos: ya previstos en 11.1 y en uso — los registros que no pueden confirmarse quedan señalados para revisión y los importes no se duplican.

Estas cuestiones deben resolverse cuando corresponda. No deben convertirse en obstáculos para revisar el funcionamiento general del negocio.

⸻

19. Criterio para aprobar el borrador

Antes de convertir este documento en especificaciones técnicas, hay que comprobar que:

- Las reglas reflejan el funcionamiento real del negocio.
- Las responsabilidades de administradoras, contratistas y profesionales están bien diferenciadas.
- Los permisos no permiten acceder a información privada de otras empresas.
- Los trabajos adicionales autorizados quedan registrados en la misma orden como trabajos separados; los cambios completos de objetivo se documentan sin perder el historial ni cancelar una orden en la que ya se trabajó.
- Los límites económicos no se confunden con el alcance del trabajo.
- Los costos no se confunden con los precios comerciales ni con las facturas.
- Las facturas, los pagos y las correcciones conservan su historial.
- Las reglas no agregan burocracia innecesaria.
- Las cuestiones todavía abiertas están identificadas y no se presentan como decisiones definitivas.

Este borrador está consolidado para revisión y aprobación. Una vez aprobado, podrá convertirse en especificaciones funcionales y técnicas para el desarrollo del backend. La aprobación de este documento no autoriza por sí sola cambios en proyectos ni la implementación de código.

⸻

20. Reglas de estados y transiciones

Estas reglas resumen el comportamiento funcional de los estados. Los nombres definitivos pueden ajustarse durante el diseño, pero no deben cambiar el significado de las transiciones.

20.1. Orden original

- Borrador → Enviada: la orden se envía al destinatario.
- Enviada → Aceptada: el destinatario acepta la orden. Cuando la orden va directamente a un profesional, la aceptación de la orden y la del trabajo principal es una sola acción.
- Enviada → Rechazada: el destinatario rechaza esa orden.
- Borrador, Enviada o Aceptada → Cancelada: solo puede cancelarse la orden completa si no se realizó ningún trabajo. La persona responsable debe registrar el motivo.
- Aceptada → En curso: comienza al menos uno de los trabajos incluidos.
- En curso → Cerrada: todos los trabajos incluidos están completados o tienen registrado que no pudieron concretarse, con el motivo correspondiente.

Una vez realizado cualquier trabajo de la orden, no se puede cancelar la orden completa. Si una orden contiene varios trabajos y uno de ellos no puede realizarse, ese trabajo se marca «No pudo concretarse», se registra el motivo y los demás trabajos continúan o se cierran según su propio estado. El trabajo realizado, sus costos y su historial se conservan.

Una orden rechazada no se reabre para enviarla a otro destinatario. Si corresponde, se crea una nueva orden y se conserva la referencia a la rechazada.

20.2. Trabajo individual

- Pendiente → Asignado / esperando respuesta: se crea una asignación a un profesional.
- Asignado / esperando respuesta → Aceptado: el profesional acepta la asignación.
- Asignado / esperando respuesta → Pendiente: la asignación fue rechazada o revocada. El trabajo queda libre para que el responsable cree una nueva asignación.
- Aceptado → En curso: el profesional comienza el trabajo.
- En curso → Completado: el profesional registra que terminó su trabajo.
- En curso → Incompleto: el profesional informa que no pudo terminarlo y explica el motivo.
- Incompleto → En curso: el mismo profesional continúa el trabajo, si el responsable lo autoriza.
- Pendiente, Asignado, Aceptado, En curso o Incompleto → No pudo concretarse: el trabajo no puede realizarse o completarse; el responsable registra el motivo y se conserva el historial y cualquier costo incurrido.

El rechazo de una asignación no convierte el trabajo en un estado terminal. El trabajo permanece pendiente para que el responsable lo reasigne. La asignación rechazada se conserva como un registro histórico independiente. El estado «No pudo concretarse» corresponde al trabajo específico y no cancela la orden completa. Completado es un estado final: una reparación posterior se gestiona como un reclamo de garantía conforme a la sección 13, sin reabrir el trabajo.

20.3. Asignación

Cada asignación es un registro propio. Puede quedar Propuesta, Aceptada, Rechazada o Revocada. Una asignación rechazada o revocada no se reactiva: se crea una nueva asignación para la siguiente propuesta.

20.4. Factura

- Borrador → Emitida / pendiente de pago: la factura se emite.
- Emitida / pendiente de pago → Parcialmente pagada: se registra un pago parcial.
- Emitida / pendiente de pago → Pagada: se registra el pago total.
- Emitida / pendiente de pago → Vencida: vence y mantiene saldo pendiente.
- Parcialmente pagada → Pagada: se salda el importe pendiente.
- Parcialmente pagada → Vencida: vence el saldo pendiente.
- Vencida → Parcialmente pagada: se registra un pago parcial después del vencimiento.
- Vencida → Pagada: se registra el pago total después del vencimiento.
- Emitida, Parcialmente pagada o Vencida → Anulada: se anula mediante un procedimiento autorizado que conserva el original y el historial, sujeto a las reglas fiscales aplicables.

La emisión no es un estado final. Los pagos y la anulación deben quedar registrados como eventos; una factura anulada no se borra del historial.
