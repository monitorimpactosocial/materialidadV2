import pandas as pd
import glob
import os

path = r"c:\Users\DiegoMeza\OneDrive - PARACEL S.A\MONITOREO_IMPACTO_SOCIAL_PARACEL\MATERIALIDAD\OneDrive_1_3-3-2026\*.xlsx"
files = glob.glob(path)

for f in files:
    print(f"--- {os.path.basename(f)} ---")
    try:
        df = pd.read_excel(f, nrows=0)
        print(list(df.columns))
    except Exception as e:
        print(f"Error: {e}")
