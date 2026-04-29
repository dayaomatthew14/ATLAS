from app.database import SessionLocal
from app import models

def clean_database():
    print("Starting database cleanup...")
    db = SessionLocal()
    try:
        # Delete Conflicts first due to foreign keys to schedules
        deleted_conflicts = db.query(models.Conflict).delete()
        print(f"Deleted {deleted_conflicts} conflicts.")

        # Delete Schedules
        deleted_schedules = db.query(models.Schedule).delete()
        print(f"Deleted {deleted_schedules} schedules.")

        # Delete System Logs
        deleted_logs = db.query(models.SystemLog).delete()
        print(f"Deleted {deleted_logs} system logs.")

        # Delete Faculty Unavailability
        deleted_unavailability = db.query(models.FacultyUnavailability).delete()
        print(f"Deleted {deleted_unavailability} faculty unavailability records.")

        db.commit()
        print("Database successfully cleaned of transactional data.")
    except Exception as e:
        db.rollback()
        print(f"Error during cleanup: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clean_database()
