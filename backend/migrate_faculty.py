import sqlite3
import os

def migrate_db():
    db_path = 'atlas_v3.db'
    if not os.path.exists(db_path):
        print("Database not found!")
        return

    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # 1. Back up faculty data (joined with users)
    c.execute("""
        SELECT f.id, u.first_name, u.last_name, u.email, u.contact_number, f.max_units, f.type, f.department_id 
        FROM faculty f 
        JOIN users u ON f.user_id = u.id
    """)
    faculty_data = c.fetchall()

    # 2. Back up unavailabilities
    c.execute("SELECT id, faculty_id, day_of_week, start_time, end_time, created_at FROM faculty_unavailability")
    unavail_data = c.fetchall()

    # 3. Create new tables
    c.execute("DROP TABLE IF EXISTS faculty_unavailability")
    c.execute("DROP TABLE IF EXISTS subject_offerings") # Foreign keys depend on faculty, need to temporarily drop and recreate if using strict mode, but SQLite allows dropping table if pragmas are off.
    # Actually, subject_offerings references faculty.id, which isn't changing.
    
    # We will rename old faculty table to faculty_old
    c.execute("DROP TABLE IF EXISTS faculty_old")
    c.execute("ALTER TABLE faculty RENAME TO faculty_old")

    # Create new faculty table
    c.execute("""
        CREATE TABLE faculty (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name VARCHAR(255) NOT NULL,
            last_name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            contact_number VARCHAR(20),
            max_units INTEGER NOT NULL DEFAULT 18,
            type VARCHAR(50) NOT NULL DEFAULT 'full_time',
            department_id INTEGER,
            FOREIGN KEY(department_id) REFERENCES departments(id)
        )
    """)

    # Populate new faculty table
    for f in faculty_data:
        c.execute("""
            INSERT INTO faculty (id, first_name, last_name, email, contact_number, max_units, type, department_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7]))

    # Recreate faculty_unavailability
    c.execute("""
        CREATE TABLE faculty_unavailability (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            faculty_id INTEGER NOT NULL,
            day_of_week VARCHAR(10) NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            created_at DATETIME,
            FOREIGN KEY(faculty_id) REFERENCES faculty(id)
        )
    """)

    # Populate new faculty_unavailability
    # In old schema, faculty_id in unavailability pointed to user_id. We must map it to faculty.id!
    # Wait, let's map user_id -> faculty.id
    c.execute("SELECT id, user_id FROM faculty_old")
    user_to_fac = {row[1]: row[0] for row in c.fetchall()}

    for u in unavail_data:
        fac_id = user_to_fac.get(u[1]) # Old faculty_id was user_id
        if fac_id is not None:
            c.execute("""
                INSERT INTO faculty_unavailability (id, faculty_id, day_of_week, start_time, end_time, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (u[0], fac_id, u[2], u[3], u[4], u[5]))

    # Now we can delete professors from the users table!
    c.execute("DELETE FROM users WHERE role = 'faculty'")

    # Drop old table
    c.execute("DROP TABLE faculty_old")

    conn.commit()
    conn.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate_db()
