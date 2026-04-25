import bcrypt
from app.database import SessionLocal
from app import models

def seed_admin():
    db = SessionLocal()
    admin = db.query(models.User).filter(models.User.email == "admin@dlsau.edu.ph").first()
    if not admin:
        hashed = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode("utf-8")
        new_admin = models.User(
            first_name="System",
            last_name="Administrator",
            email="admin@dlsau.edu.ph",
            password_hash=hashed,
            role="admin",
            department=None,
            is_verified=True
        )
        db.add(new_admin)
        db.commit()
        print("CREATED")
    else:
        print("EXISTS")
        # Update password just in case
        hashed = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode("utf-8")
        admin.password_hash = hashed
        db.commit()
        print("UPDATED")
    db.close()

if __name__ == "__main__":
    seed_admin()
