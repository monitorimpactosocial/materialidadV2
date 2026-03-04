import re
import json
import hashlib
from pathlib import Path

import pandas as pd
import numpy as np

# ------------------------------------------------------------
# Configuración
# ------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[2]
INPUT_DIR = REPO_ROOT / "data_pipeline" / "input"
OUTPUT_DIR = REPO_ROOT / "data_pipeline" / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Archivos esperados (ajuste los nombres según corresponda)
FILES = [
    ("260128 Encuesta de materialidad - Colaboradores y colaboradoras.xlsx", "Colaboradores"),
    ("260128 Encuesta de materialidad - Comisión de Seguimiento.xlsx", "Comisión de Seguimiento"),
    ("260128 Encuesta de materialidad - Componente Forestal.xlsx", "Componente Forestal"),
    ("260128 Encuesta de materialidad - Componente Industrial.xlsx", "Componente Industrial"),
    ("260128 Encuesta de materialidad - Comunidades Indígenas.xlsx", "Comunidades Indígenas"),
    ("260128 Encuesta de materialidad - Grupo de interés en general.xlsx", "Grupo de interés en general"),
]

MAP_LABELS = {
    "MUY RELEVANTE": 5,
    "RELEVANTE": 4,
    "MEDIANAMENTE RELEVANTE": 3,
    "POCO RELEVANTE": 2,
    "NADA RELEVANTE": 1
}

THEME_COL_RE = re.compile(r"^\s*(\d{1,2})\.\s*(.+)$")

def to_score(v):
    if pd.isna(v):
        return np.nan
    s = str(v).strip().upper()
    s = re.sub(r"\s+", " ", s)
    for k, score in MAP_LABELS.items():
        if s.startswith(k):
            return score
    return np.nan

def main():
    rows = []
    tema_catalog = {}

    for fname, grupo in FILES:
        path = INPUT_DIR / fname
        if not path.exists():
            continue

        xls = pd.ExcelFile(path)
        sheet = xls.sheet_names[0]
        df = pd.read_excel(path, sheet_name=sheet, engine="openpyxl")

        theme_cols = [c for c in df.columns if isinstance(c, str) and THEME_COL_RE.match(c)]
        if not theme_cols:
            continue

        for i, r in df.iterrows():
            ts = None
            for cand in ["submission_time", "start", "end", "fecha", "Fecha", "Timestamp", "ts"]:
                if cand in df.columns:
                    ts = r.get(cand)
                    break
            ts_str = ""
            if pd.notna(ts):
                try:
                    ts_str = str(pd.to_datetime(ts))
                except Exception:
                    ts_str = str(ts)
            hid = hashlib.sha256(f"{grupo}|{i}|{ts_str}".encode("utf-8")).hexdigest()[:16]

            for col in theme_cols:
                val = r.get(col)
                score = to_score(val)
                if pd.isna(score):
                    continue
                m = THEME_COL_RE.match(col.strip())
                tema_id = int(m.group(1))
                tema_nombre = m.group(2).strip()
                tema_catalog[tema_id] = tema_nombre

                rows.append({
                    "id_respuesta": hid,
                    "grupo_interes": grupo,
                    "tema_id": tema_id,
                    "tema_nombre": tema_nombre,
                    "relevancia_num": int(score),
                    "relevancia_label": str(val).strip()
                })

    responses_long = pd.DataFrame(rows)
    responses_long.to_csv(OUTPUT_DIR / "responses_long.csv", index=False, encoding="utf-8")

    dim_tema = pd.DataFrame([
        {"tema_id": k, "tema_nombre": v, "pilar": "No clasificado"}
        for k, v in sorted(tema_catalog.items())
    ])
    dim_tema.to_csv(OUTPUT_DIR / "dim_tema.csv", index=False, encoding="utf-8")

    impact_assessment = pd.DataFrame([{
        "tema_id": k, "severidad": 3, "alcance": 3, "irremediabilidad": 3, "probabilidad": 3
    } for k in sorted(tema_catalog.keys())])
    impact_assessment.to_csv(OUTPUT_DIR / "impact_assessment.csv", index=False, encoding="utf-8")

    financial_assessment = pd.DataFrame([{
        "tema_id": k, "impacto_financiero": 3, "probabilidad_financiera": 3
    } for k in sorted(tema_catalog.keys())])
    financial_assessment.to_csv(OUTPUT_DIR / "financial_assessment.csv", index=False, encoding="utf-8")

    scenarios = [
      {
        "id":"base_moderado",
        "nombre":"Base (moderado)",
        "tau_impact":3.5,
        "tau_fin":3.5,
        "rule_double":"AND",
        "weights_impact":{"severidad":0.30,"alcance":0.25,"irremediabilidad":0.25,"probabilidad":0.20},
        "weights_fin":{"impacto_financiero":0.60,"probabilidad_financiera":0.40}
      }
    ]
    (OUTPUT_DIR / "scenarios.json").write_text(json.dumps(scenarios, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
