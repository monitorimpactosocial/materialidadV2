import os
import glob
import pandas as pd
import polars as pl
import re
import hashlib

def get_group_from_filename(filename):
    basename = os.path.basename(filename)
    match = re.search(r'Encuesta de materialidad\s*-\s*(.+?)\.xlsx', basename, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return "Desconocido"

def clean_duplicate_columns(df):
    # Pandas appends .1, .2, etc. to duplicate column names
    # We want to keep only the one with values, or merge them.
    cols_to_drop = []
    base_cols = {}
    
    for col in df.columns:
        # Match pattern like "1. Tema de prueba" and "1. Tema de prueba.1"
        base_name = re.sub(r'\.\d+$', '', col)
        if base_name != col:
            # It's a duplicate column
             # If base_name exists in our mapping, let's merge non-nulls
             if base_name in base_cols:
                 actual_base = base_cols[base_name]
                 # Fill NA in the base column using the duplicate column
                 df[actual_base] = df[actual_base].fillna(df[col])
             cols_to_drop.append(col)
        else:
            base_cols[base_name] = col
            
    df = df.drop(columns=cols_to_drop)
    return df

def map_relevance(val):
    if pd.isna(val):
        return None
    val_str = str(val).strip().upper()
    if "MUY RELEVANTE" in val_str: return 5
    if "MEDIANAMENTE RELEVANTE" in val_str: return 3
    if "POCO RELEVANTE" in val_str: return 2
    if "NADA RELEVANTE" in val_str: return 1
    if "RELEVANTE" in val_str: return 4
    return None

def process_file(filepath):
    """Processes a single Excel file and returns a melted pandas DataFrame."""
    group = get_group_from_filename(filepath)
    df = pd.read_excel(filepath)
    df = clean_duplicate_columns(df)
    
    # Identify identifier vs theme columns
    theme_cols = []
    id_cols = []
    
    for col in df.columns:
        if re.match(r'^\s*\d{1,2}[\.\-\s]', str(col)):
            theme_cols.append(col)
        else:
            id_cols.append(col)
            
    # Add group
    df['grupo_interes'] = group
    id_cols.append('grupo_interes')
    
    # Try to find standard ID columns (like date, org, sector)
    date_col = next((c for c in id_cols if 'marca temporal' in c.lower() or 'fecha' in c.lower() or 'timestamp' in c.lower()), None)
    org_col = next((c for c in id_cols if 'organizaci' in c.lower() or 'comunidad' in c.lower()), None)
    sector_col = next((c for c in id_cols if 'sector' in c.lower()), None)
    
    # Melt the dataframe (Unpivot)
    melted = df.melt(id_vars=id_cols, value_vars=theme_cols, var_name='tema_nombre_original', value_name='relevancia_label')
    melted = melted.dropna(subset=['relevancia_label'])
    
    # Build standard columns
    result = pd.DataFrame()
    result['fecha'] = melted[date_col] if date_col else None
    result['grupo_interes'] = melted['grupo_interes']
    result['sector_org'] = melted[sector_col] if sector_col else "N/A"
    result['organizacion'] = melted[org_col] if org_col else "N/A"
    result['tema_nombre_original'] = melted['tema_nombre_original']
    
    # Extract tema_id
    result['tema_id'] = result['tema_nombre_original'].apply(lambda x: int(re.search(r'^\s*(\d{1,2})', str(x)).group(1)) if re.search(r'^\s*(\d{1,2})', str(x)) else -1)
    
    # Clean tema_nombre (remove the prefix)
    result['tema_nombre'] = result['tema_nombre_original'].apply(lambda x: re.sub(r'^\s*\d{1,2}[\.\-\s]*', '', str(x)).strip())
    
    result['relevancia_label'] = melted['relevancia_label']
    result['relevancia_num'] = result['relevancia_label'].apply(map_relevance)
    
    # We will build id_respuesta uniquely by row. To do this, we need the original row index or robust hash.
    # Since we melted, we can group by the original index. We can add a temporary _row_id to the df before melt.
    return result, df, melted

def build_responses_long():
    input_dir = r"c:\Users\DiegoMeza\OneDrive - PARACEL S.A\MONITOREO_IMPACTO_SOCIAL_PARACEL\MATERIALIDAD\OneDrive_1_3-3-2026"
    output_path = r"c:\Users\DiegoMeza\OneDrive - PARACEL S.A\MONITOREO_IMPACTO_SOCIAL_PARACEL\MATERIALIDAD\materialidad-dashboard\app\public\data\responses_long.parquet"
    
    files = glob.glob(os.path.join(input_dir, "*.xlsx"))
    all_responses = []
    
    for f in files:
        print(f"Procesando: {os.path.basename(f)}")
        group = get_group_from_filename(f)
        df = pd.read_excel(f)
        df = clean_duplicate_columns(df)
        df['_local_row_id'] = range(len(df))
        
        theme_cols = [c for c in df.columns if re.match(r'^\s*\d{1,2}[\.\-\s]', str(c))]
        id_cols = [c for c in df.columns if c not in theme_cols]
        
        melted = df.melt(id_vars=id_cols, value_vars=theme_cols, var_name='tema_nombre_original', value_name='relevancia_label')
        melted = melted.dropna(subset=['relevancia_label'])
        
        date_col = next((c for c in id_cols if 'marca temporal' in c.lower() or 'fecha' in c.lower() or 'timestamp' in c.lower()), None)
        org_col = next((c for c in id_cols if 'organizaci' in c.lower() or 'comunidad' in c.lower() or 'empresa' in c.lower()), None)
        sector_col = next((c for c in id_cols if 'sector' in c.lower() or 'área' in c.lower()), None)
        
        for _, row in melted.iterrows():
            # Create a robust hash for the respondent (without leaking PII)
            hash_input = f"{group}_{row['_local_row_id']}".encode('utf-8')
            resp_id = hashlib.md5(hash_input).hexdigest()[:12]
            
            tema_original = str(row['tema_nombre_original'])
            match = re.search(r'^\s*(\d{1,2})', tema_original)
            tema_id = int(match.group(1)) if match else -1
            tema_nombre = re.sub(r'^\s*\d{1,2}[\.\-\s]*', '', tema_original).strip()
            
            relevancia_label = str(row['relevancia_label'])
            relevancia_num = map_relevance(relevancia_label)
            
            all_responses.append({
                'id_respuesta': resp_id,
                'fecha': row[date_col] if date_col and date_col in row else None,
                'grupo_interes': group,
                'sector_org': str(row[sector_col]) if sector_col and sector_col in row and not pd.isna(row[sector_col]) else "N/A",
                'organizacion': str(row[org_col]) if org_col and org_col in row and not pd.isna(row[org_col]) else "N/A",
                'tema_id': tema_id,
                'tema_nombre': tema_nombre,
                'relevancia_num': relevancia_num,
                'relevancia_label': relevancia_label
            })
            
    final_df = pd.DataFrame(all_responses)
    
    # Fill NAs in string cols
    final_df['sector_org'] = final_df['sector_org'].fillna("N/A")
    final_df['organizacion'] = final_df['organizacion'].fillna("N/A")
    
    # Save using polars for parquet
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    pl_df = pl.from_pandas(final_df)
    pl_df.write_parquet(output_path)
    print(f"Guardado {len(final_df)} registros en {output_path}")

if __name__ == "__main__":
    build_responses_long()
