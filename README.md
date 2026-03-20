# materialidad-dashboard (instrumento de recolección + tablero)

Este paquete implementa una **app web estática** (sin servidor) para:

- **Encuesta Externa** (stakeholders) con escala 1 a 5.
- **Evaluación Interna** (impacto y financiera) con escala 1 a 5.
- **Tablero interactivo** (umbrales, pesos, escenarios, matriz).
- **Reporte** listo para imprimir a PDF (desde el navegador).
- **Ediciones bianuales** (gestión de ciclos, creación y cierre de ediciones).

## Despliegue rápido en GitHub Pages

1. Suba el contenido del ZIP a la raíz del repositorio `monitorimpactosocial/materialidad-dashboard`.
2. En GitHub: **Settings → Pages**.
3. En **Build and deployment**, seleccione:
   - **Source**: *Deploy from a branch*
   - **Branch**: `main`
   - **Folder**: `/ (root)`
4. Guarde. GitHub publicará en:
   - `https://monitorimpactosocial.github.io/materialidad-dashboard/`

## Uso operativo

- Navegue a **Encuesta Externa** y registre respuestas.
- Navegue a **Evaluación Interna** y registre al menos una evaluación del comité.
- En **Inicio** puede ajustar umbrales, pesos y escenarios.
- En **Tablero** verá matriz y ranking recalculados.
- En **Reporte** use **Imprimir (PDF)**.

## Respaldo y restauración

En **Administración**:
- **Exportar JSON**: respaldo integral (recomendado).
- **Exportar CSV**: exportaciones operativas.
- **Importar JSON**: restaurar base en este navegador.

## Limitación, modo sin servidor

Esta versión almacena datos en el **navegador** (localStorage). Para recolección multiusuario y centralizada (varios dispositivos),
se recomienda integrar un backend (por ejemplo, Google Apps Script + Sheets, Supabase, o API propia).

## Catálogos

- `data/topics.json`: lista de temas P01 a P27 (editable).
- `data/scale.json`: mapeo de escala.
- `data/scenarios.json`: escenarios gerenciales.

