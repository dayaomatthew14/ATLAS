import sqlite3
import os

db_path = 'atlas_v3.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if subjects table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='subjects'")
    if cursor.fetchone():
        print("Dropping subjects table...")
        cursor.execute("DROP TABLE subjects")
        conn.commit()
        print("Dropped subjects table.")
    
    conn.close()
    
from app.database import engine # type: ignore
from app import models # type: ignore
# Recreate the tables based on the updated models
models.Base.metadata.create_all(bind=engine)
print("Recreated missing tables.")
