import os
import bcrypt
from app.database import SessionLocal
from app import models
from app.academics import COLLEGES

def seed_admin():
    db = SessionLocal()
    # Purge the retired admin@dlsau.edu.ph account if present
    stale_admin = db.query(models.User).filter(models.User.email == "admin@dlsau.edu.ph").first()
    if stale_admin:
        db.delete(stale_admin)
        db.commit()
        print("Master Admin (admin@dlsau.edu.ph): PURGED")

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
