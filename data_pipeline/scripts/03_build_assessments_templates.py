import polars as pl
import json
import os

def build_templates():
    parquet_path = r"c:\Users\DiegoMeza\OneDrive - PARACEL S.A\MONITOREO_IMPACTO_SOCIAL_PARACEL\MATERIALIDAD\materialidad-dashboard\app\public\data\responses_long.parquet"
    impact_path = r"c:\Users\DiegoMeza\OneDrive - PARACEL S.A\MONITOREO_IMPACTO_SOCIAL_PARACEL\MATERIALIDAD\materialidad-dashboard\app\public\data\impact_assessment.csv"
    fin_path = r"c:\Users\DiegoMeza\OneDrive - PARACEL S.A\MONITOREO_IMPACTO_SOCIAL_PARACEL\MATERIALIDAD\materialidad-dashboard\app\public\data\financial_assessment.csv"
    scenarios_path = r"c:\Users\DiegoMeza\OneDrive - PARACEL S.A\MONITOREO_IMPACTO_SOCIAL_PARACEL\MATERIALIDAD\materialidad-dashboard\app\public\data\scenarios.json"
    
    df = pl.read_parquet(parquet_path)
    temas = df.select("tema_id").unique().sort("tema_id")
    
    # 1. Impact Assessment Template
    impact_df = temas.with_columns([
        pl.lit(3.0).alias("severidad"),
        pl.lit(3.0).alias("alcance"),
        pl.lit(3.0).alias("irremediabilidad"),
        pl.lit(3.0).alias("probabilidad"),
        pl.lit(3.0).alias("influencia")
    ])
    impact_df.write_csv(impact_path)
    print(f"Plantilla generada: {impact_path}")
    
    # 2. Financial Assessment Template
    fin_df = temas.with_columns([
        pl.lit(3.0).alias("impacto_financiero"),
        pl.lit(3.0).alias("probabilidad_financiera"),
        pl.lit("M").alias("horizonte")
    ])
    fin_df.write_csv(fin_path)
    print(f"Plantilla generada: {fin_path}")
    
    # 3. Scenarios JSON
    scenarios = [
        {
            "id": "base",
            "name": "Escenario Base",
            "tau_impact": 3.0,
            "tau_fin": 3.0,
            "weights": {
                "w_severidad": 0.25,
                "w_alcance": 0.25,
                "w_irremediabilidad": 0.25,
                "w_probabilidad": 0.25
            },
            "rule_double": "OR",
            "stakeholders_weighting": "equal"
        },
        {
            "id": "estricto",
            "name": "Escenario Estricto (AND)",
            "tau_impact": 3.5,
            "tau_fin": 3.5,
            "weights": {
                "w_severidad": 0.40,
                "w_alcance": 0.20,
                "w_irremediabilidad": 0.20,
                "w_probabilidad": 0.20
            },
            "rule_double": "AND",
            "stakeholders_weighting": "weighted"
        },
        {
            "id": "laxo",
            "name": "Escenario Laxo",
            "tau_impact": 2.5,
            "tau_fin": 2.5,
            "weights": {
                "w_severidad": 0.25,
                "w_alcance": 0.25,
                "w_irremediabilidad": 0.25,
                "w_probabilidad": 0.25
            },
            "rule_double": "OR",
            "stakeholders_weighting": "equal"
        }
    ]
    
    with open(scenarios_path, 'w', encoding='utf-8') as f:
        json.dump(scenarios, f, indent=4, ensure_ascii=False)
    print(f"Escenarios generados: {scenarios_path}")

if __name__ == "__main__":
    build_templates()
