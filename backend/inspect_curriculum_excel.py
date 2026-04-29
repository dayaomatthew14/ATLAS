import pandas as pd
import openpyxl

file_path = r"C:\Users\mtthw\Downloads\BSCS CURRICULUM AY 2026.xlsx"

try:
    xl = pd.ExcelFile(file_path)
    print(f"Sheets: {xl.sheet_names}")
    
    for sheet in xl.sheet_names:
        # Check first few rows for school name
        df_header = pd.read_excel(file_path, sheet_name=sheet, nrows=10, header=None)
        header_text = df_header.to_string().lower()
        if "de la salle" in header_text or "dlsau" in header_text or "university" in header_text:
            print(f"\n--- Found potential school sheet: {sheet} ---")
            # Read more of the sheet to see the structure
            df = pd.read_excel(file_path, sheet_name=sheet, skiprows=10) # Skip header rows
            print("Columns found:")
            print(df.columns.tolist())
            print("\nFirst 10 rows:")
            print(df.head(10).to_string())
            break
except Exception as e:
    print(f"Error: {e}")
