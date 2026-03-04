# materialidad-dashboard

Tablero web estático (GitHub Pages) para análisis de materialidad con recálculo en tiempo real al ajustar umbrales y pesos.

## 1. Contenido
- `app/`: Front-end (Vite + React + DuckDB-WASM + Plotly)
- `data_pipeline/`: Scripts de consolidación (opcional) para transformar XLSX a un dataset estable
- `.github/workflows/deploy.yml`: despliegue automático a GitHub Pages (branch `main`)

## 2. Ejecución local
Requisitos: Node 20+

```bash
cd app
npm install
npm run dev
```

La app carga datos desde `app/public/data/`.

## 3. Datos
Por defecto se incluyen archivos en `app/public/data/`:
- `responses_long.csv`: respuestas normalizadas (formato largo), sin campos personales
- `dim_tema.csv`: catálogo de temas
- `impact_assessment.csv`, `financial_assessment.csv`: plantillas (valores neutros = 3)
- `scenarios.json`: escenarios gerenciales

Sustituya `impact_assessment.csv` y `financial_assessment.csv` por evaluaciones internas reales.

## 4. Publicación en GitHub Pages
1. En GitHub: Settings → Pages → Source: GitHub Actions
2. Hacer push a `main`
3. La app queda disponible en: `https://monitorimpactosocial.github.io/materialidad-dashboard/`

## 5. Pipeline de consolidación (opcional)
Ubique los XLSX en `data_pipeline/input/` y ejecute:

```bash
python data_pipeline/scripts/build_responses_long.py
```

Esto reconstruye los archivos en `data_pipeline/output/` (y opcionalmente puede copiar a `app/public/data/`).
