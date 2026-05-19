import sqlite3

def migrate():
    conn = sqlite3.connect('backend/atlas_v3.db')
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE system_logs ADD COLUMN department_id INTEGER REFERENCES departments(id)")
        print("Successfully added department_id to system_logs")
    except sqlite3.OperationalError as e:
        print(f"Error or already exists: {e}")
        
    conn.commit()
    conn.close()

if __name__ == "__main__":
    migrate()
