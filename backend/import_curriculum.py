import pandas as pd
import os
import sys

# Add the parent directory to sys.path so we can import the app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, engine
from app import models

# Ensure tables exist
models.Base.metadata.create_all(bind=engine)

def parse_curriculum(filepath, sheet_name, department_id, db, global_codes_seen):
    print(f"Parsing {filepath} (Sheet: {sheet_name})...")
    try:
        df = pd.read_excel(filepath, sheet_name=sheet_name)
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return

    added_count = 0
    skipped_count = 0

    for index, row in df.iterrows():
        # Clean the row to just string values
        cleaned = [str(x).strip() for x in row.values if pd.notna(x) and str(x).strip() != '']
        
        if len(cleaned) >= 5:
            # Look for the sequence of three numbers: Lec, Lab, Units
            found = False
            for i in range(2, len(cleaned) - 2):
                try:
                    lec = int(float(cleaned[i]))
                    lab = int(float(cleaned[i+1]))
                    units = int(float(cleaned[i+2]))
                    
                    code = cleaned[i-2]
                    title = cleaned[i-1]
                    
                    # Basic validation that it's a code
                    if len(code) > 20 or len(title) < 3:
                        continue
                        
                    found = True
                    break
                except ValueError:
                    continue
            
            if found:
                # Determine type
                subj_type = 'lab' if lab > 0 else 'lecture'
                
                # Check if exists in db or in our current batch
                existing = db.query(models.Subject).filter(models.Subject.code == code).first()
                if existing or code in global_codes_seen:
                    skipped_count += 1
                else:
                    new_subj = models.Subject(
                        code=code,
                        name=title,
                        units=units,
                        department_id=department_id,
                        type=subj_type
                    )
                    db.add(new_subj)
                    global_codes_seen.add(code)
                    added_count += 1

    try:
        db.commit()
    except Exception as e:
        print(f"Commit error: {e}")
        db.rollback()
    
    print(f"Finished {filepath}. Added: {added_count}, Skipped (Duplicates): {skipped_count}\n")

def main():
    db = SessionLocal()
    
    # Get or create CAST department
    cast_dept = db.query(models.Department).filter(models.Department.code == 'CAST').first()
    if not cast_dept:
        cast_dept = models.Department(code='CAST', name='College of Arts, Sciences and Technology')
        db.add(cast_dept)
        db.commit()
        db.refresh(cast_dept)
    
    bscs_file = r'C:\Users\mtthw\Downloads\BSCS CURRICULUM AY 2026.xlsx'
    bscpe_file = r'C:\Users\mtthw\Downloads\BSCPE CURRICULUM AY 2026.xlsx'
    
    global_codes_seen = set()
    parse_curriculum(bscs_file, 'UPDATED', cast_dept.id, db, global_codes_seen)
    parse_curriculum(bscpe_file, 'BSCpE2026', cast_dept.id, db, global_codes_seen)
    
    db.close()

if __name__ == '__main__':
    main()
