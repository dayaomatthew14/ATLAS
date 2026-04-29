from app.database import SessionLocal, engine
from app.models import Department, Base

# Ensure tables exist
Base.metadata.create_all(bind=engine)

def seed_departments():
    db = SessionLocal()
    depts = [
        ('CAST', 'College of Arts, Sciences and Technology'),
        ('COED', 'College of Education'),
        ('CBMA', 'College of Business and Management'),
        ('CVMAS', 'College of Veterinary Medicine')
    ]
    for code, name in depts:
        if not db.query(Department).filter_by(code=code).first():
            db.add(Department(code=code, name=name))
    db.commit()
    db.close()
    print("Departments seeded successfully.")

if __name__ == '__main__':
    seed_departments()
