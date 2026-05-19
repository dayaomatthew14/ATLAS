import sqlite3

conn = sqlite3.connect('backend/atlas_v3.db')
cur = conn.cursor()

print("Updating schedules table...")
try:
    # Rename subject_id to curriculum_id
    cur.execute("ALTER TABLE schedules RENAME COLUMN subject_id TO curriculum_id")
    print("Renamed subject_id to curriculum_id")
except Exception as e:
    print(f"Error renaming column: {e}")

try:
    # Add is_locked
    cur.execute("ALTER TABLE schedules ADD COLUMN is_locked BOOLEAN DEFAULT 0")
    print("Added is_locked column")
except Exception as e:
    print(f"Error adding is_locked column: {e}")

conn.commit()
conn.close()
print("Done.")
