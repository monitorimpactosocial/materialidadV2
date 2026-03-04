from pathlib import Path
import shutil

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC = REPO_ROOT / "data_pipeline" / "output"
DST = REPO_ROOT / "app" / "public" / "data"
DST.mkdir(parents=True, exist_ok=True)

for fn in ["responses_long.csv", "dim_tema.csv", "impact_assessment.csv", "financial_assessment.csv", "scenarios.json"]:
    src = SRC / fn
    if src.exists():
        shutil.copy2(src, DST / fn)
