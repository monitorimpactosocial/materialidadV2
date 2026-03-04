import polars as pl
import os

def build_dim_tema():
    parquet_path = r"c:\Users\DiegoMeza\OneDrive - PARACEL S.A\MONITOREO_IMPACTO_SOCIAL_PARACEL\MATERIALIDAD\materialidad-dashboard\app\public\data\responses_long.parquet"
    out_path = r"c:\Users\DiegoMeza\OneDrive - PARACEL S.A\MONITOREO_IMPACTO_SOCIAL_PARACEL\MATERIALIDAD\materialidad-dashboard\app\public\data\dim_tema.csv"
    
    df = pl.read_parquet(parquet_path)
    
    # Extract unique temas
    dim_tema = df.select(["tema_id", "tema_nombre"]).unique().sort("tema_id")
    
    dim_tema.write_csv(out_path)
    print(f"dim_tema.csv generado con {len(dim_tema)} temas en {out_path}")

if __name__ == "__main__":
    build_dim_tema()
