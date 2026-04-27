from app.database import SessionLocal
from app import models

db = SessionLocal()
users = db.query(models.User).all()
for u in users:
    print(f"Email: {u.email}, Role: {u.role}")
db.close()
