import sqlite3
import os

db_path = 'backend/atlas_v3.db'
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cur.fetchall()]
for table in tables:
    print(f"--- Table: {table} ---")
    cur.execute(f"PRAGMA table_info({table})")
    columns = cur.fetchall()
    for col in columns:
        print(col)
    print("\n")

conn.close()
