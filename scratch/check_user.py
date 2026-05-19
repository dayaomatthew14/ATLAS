import sqlite3
import os

db_path = 'backend/atlas_v3.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

email = 'dayaomatthew14@gmail.com'
cur.execute("SELECT id, email, role, department FROM users WHERE email = ?", (email,))
user = cur.fetchone()
print(f"User found: {user}")

if user:
    # Check if there is a faculty record for this user
    cur.execute("SELECT id, department_id FROM faculty WHERE user_id = ?", (user[0],))
    faculty = cur.fetchone()
    print(f"Faculty record: {faculty}")
    
    if user[3]: # Department name
        cur.execute("SELECT id, name, code FROM departments WHERE name = ? OR code = ?", (user[3], user[3]))
        dept = cur.fetchone()
        print(f"Department details: {dept}")

conn.close()
