import pandas as pd
import io

def parse_curriculum(file_path):
    print(f"\n--- Testing File: {file_path} ---")
    xl = pd.ExcelFile(file_path)
    
    for sheet in xl.sheet_names:
        # Check first 20 rows for school name
        df_header = pd.read_excel(file_path, sheet_name=sheet, nrows=20, header=None)
        header_text = df_header.to_string().lower()
        
        if "de la salle" in header_text or "university" in header_text:
            print(f"Targeting Sheet: {sheet}")
            
            # Find the header row
            full_df = pd.read_excel(file_path, sheet_name=sheet, header=None)
            header_row_idx = -1
            col_map = {}
            
            for i, row in full_df.iterrows():
                row_vals = [str(v).strip().lower() for v in row.values]
                if "course code" in row_vals or "code" in row_vals:
                    header_row_idx = i
                    for idx, val in enumerate(row_vals):
                        if "course code" in val or "code" == val: col_map['code'] = idx
                        if "course title" in val or "title" in val or "subject name" in val: col_map['name'] = idx
                        if "units" == val or "unit" in val: col_map['units'] = idx
                    break
            
            if header_row_idx != -1 and 'code' in col_map and 'name' in col_map:
                print(f"Found header at row {header_row_idx}. Col map: {col_map}")
                
                # Parse rows below
                data_df = full_df.iloc[header_row_idx + 1:]
                items = []
                for _, row in data_df.iterrows():
                    code = str(row[col_map['code']]).strip()
                    name = str(row[col_map['name']]).strip()
                    units = row[col_map['units']] if 'units' in col_map else 3
                    
                    # Skip empty rows or header-like rows
                    if not code or code == 'nan' or len(code) < 3 or code.lower() == 'course code':
                        continue
                        
                    # Handle units
                    try:
                        units = int(float(units))
                    except:
                        units = 3
                        
                    # Determine type
                    ctype = 'lecture'
                    if 'lab' in name.lower() or 'laboratory' in name.lower() or code.endswith('B'):
                        ctype = 'lab'
                        
                    items.append({"code": code, "name": name, "units": units, "type": ctype})
                
                print(f"Successfully parsed {len(items)} items.")
                if items:
                    print(f"Sample: {items[0]}")
                return items
    return []

parse_curriculum(r"C:\Users\mtthw\Downloads\BSCS CURRICULUM AY 2026.xlsx")
parse_curriculum(r"C:\Users\mtthw\Downloads\BSCPE CURRICULUM AY 2026.xlsx")
