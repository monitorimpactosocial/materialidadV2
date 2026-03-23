# Auditoría técnica profunda del proyecto

## Diagnóstico general

El proyecto original presentaba una base funcional visualmente correcta, pero con debilidades críticas de persistencia, sincronización, seguridad y coherencia metodológica. La principal vulnerabilidad operativa consistía en que la aplicación prometía trabajar con almacenamiento local e importación/exportación, pero la base principal no se recuperaba ni persistía correctamente desde `localStorage`.

## Hallazgos críticos detectados

### 1. Persistencia local rota
- Existía una clave principal de almacenamiento, pero la base no se leía ni se guardaba de forma consistente.
- Consecuencia, alto riesgo de pérdida de datos al recargar la app o al depender de memoria de sesión.

### 2. Incompatibilidad de versiones
- La lectura remota aceptaba solo `version === 2`, mientras los datos incluidos y la base local se encontraban en `version: 1`.
- Consecuencia, datos válidos podían ser ignorados silenciosamente.

### 3. Sincronización no resiliente
- Si la nube fallaba durante un envío, la app mostraba mensajes pero no conservaba una cola formal de reintento.
- Consecuencia, divergencia entre local y nube.

### 4. Borrado e importación inconsistentes
- El flujo de borrado e importación afectaba claves de almacenamiento que luego no eran utilizadas como fuente principal.
- Consecuencia, falsa sensación de restauración o limpieza.

### 5. Edición cerrada seguía operable
- La aplicación permitía mantener una edición cerrada como edición activa sin bloquear nuevos registros.
- Consecuencia, contaminación del ciclo cerrado.

### 6. Credenciales triviales en frontend
- Existían credenciales administrativas extremadamente débiles y visibles en código cliente.
- Consecuencia, control aparente de acceso, pero sin seguridad real.

### 7. Coherencia metodológica incompleta
- El reporte declaraba ponderaciones detalladas de impacto y financiero, pero el formulario interno activo solo capturaba puntaje resumido.
- Consecuencia, desalineación entre narrativa metodológica y cálculo efectivo.

### 8. Progreso interno mal medido
- El indicador de avance interno contabilizaba temas con respuestas parciales como si estuvieran completos.
- Consecuencia, retroalimentación engañosa al usuario.

### 9. Exportación insuficiente
- Las salidas CSV resumían registros, pero no extraían el detalle por tema, reduciendo la utilidad analítica.
- Consecuencia, reprocesamiento posterior más costoso.

### 10. Sanitización limitada
- El proyecto utilizaba `innerHTML` en varios flujos y no normalizaba sistemáticamente textos y puntajes antes de persistir.
- Consecuencia, mayor fragilidad ante datos malformados.

## Correcciones implementadas

1. Migración automática a esquema versión 2.
2. Persistencia `offline-first` real.
3. Fusión de fuentes `initial_db`, local y nube.
4. Cola de sincronización diferida con reintento.
5. Deduplación por identificador.
6. Normalización de filas externas e internas.
7. Control de edición abierta antes de capturar.
8. Bloqueo de doble envío.
9. Corrección del cómputo de progreso interno.
10. Exportación detallada en formato largo para encuestas y evaluaciones.
11. Mensajería operativa sobre pendientes de sincronización e integridad parcial.
12. Ajuste del texto metodológico del reporte para que refleje el comportamiento real del cálculo.

## Riesgos residuales

1. Seguridad real no resuelta. Mientras la app siga siendo estática, la autenticación embebida no protege frente a inspección del código fuente.
2. Sin backend transaccional, la resolución de conflictos multiusuario sigue siendo limitada.
3. Las operaciones de eliminación y administración siguen dependiendo de la lógica del frontend, por lo que para trazabilidad completa se requiere un backend con bitácora.

## Siguiente fase recomendada

- Migrar autenticación y persistencia a backend.
- Incorporar bitácora de cambios y usuarios.
- Separar configuración, catálogo, captura y analítica en módulos.
- Añadir pruebas automatizadas para validación de esquemas y reglas de negocio.
