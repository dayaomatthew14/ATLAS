import os
import bcrypt
from app.database import SessionLocal
from app import models
from app.academics import COLLEGES

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
        print("Master Admin: CREATED")
    else:
        print("Master Admin: EXISTS")
        hashed = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode("utf-8")
        setattr(admin, "password_hash", hashed)
        db.commit()
        print("Master Admin: UPDATED")

    # Seed the 4 Dean Administrators
    dean_password = os.getenv("DEAN_SEED_PASSWORD", "DeanPassword123!")
    dean_hashed = bcrypt.hashpw(dean_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    for spec in COLLEGES:
        code = str(spec["code"])
        email = f"dean.{code.lower()}@dlsau.edu.ph"
        dean = db.query(models.User).filter(models.User.email == email).first()
        if not dean:
            dean = models.User(
                first_name="Dean",
                last_name=code,
                email=email,
                password_hash=dean_hashed,
                role="admin",
                department=code,
                is_verified=True
            )
            db.add(dean)
            db.commit()
            print(f"Dean {code}: CREATED ({email})")
        else:
            setattr(dean, "role", "admin")
            setattr(dean, "department", code)
            setattr(dean, "is_verified", True)
            db.commit()
            print(f"Dean {code}: UPDATED ({email})")

    db.close()

if __name__ == "__main__":
    seed_admin()
