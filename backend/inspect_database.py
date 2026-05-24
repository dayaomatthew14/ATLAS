import os
import sys
from dotenv import load_dotenv

# Load env variables from backend folder
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./atlas_v3.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

print("=" * 70)
print("             ATLAS ADMIN DATABASE INSPECTOR")
print("=" * 70)
print(f"Connecting to: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")

try:
    from sqlalchemy import create_engine, text
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as conn:
        # Fetch all registered users
        users = conn.execute(text(
            "SELECT id, first_name, last_name, email, role, department, is_verified, created_at FROM users ORDER BY id ASC"
        )).fetchall()
        
        if not users:
            print("\n[INFO] No users are registered in the database yet!")
            print("=" * 70)
            sys.exit(0)
            
        print(f"\nTotal Registered Users: {len(users)}")
        print("-" * 110)
        print(f"{'ID':<4} | {'NAME':<25} | {'EMAIL':<30} | {'ROLE':<15} | {'DEPARTMENT':<25} | {'VERIFIED':<8}")
        print("-" * 110)
        
        for u in users:
            friendly_name = f"{u[1]} {u[2]}"
            # If the user has a DEPT_X code, try to fetch the friendly name of that department
            dept_code = u[5]
            dept_name = dept_code
            if dept_code and dept_code.startswith("DEPT_"):
                dept_res = conn.execute(
                    text("SELECT name FROM departments WHERE code = :code"), 
                    {"code": dept_code}
                ).first()
                if dept_res:
                    dept_name = dept_res[0]
            
            verified_str = "Yes" if u[6] else "No"
            role_str = str(u[4]).upper()
            
            print(f"{u[0]:<4} | {friendly_name:<25} | {u[3]:<30} | {role_str:<15} | {str(dept_name):<25} | {verified_str:<8}")
            
        print("-" * 110)
        print("=" * 70)
        
except ImportError:
    print("[ERROR] SQLAlchemy is not installed in your active python environment.")
except Exception as e:
    print(f"[ERROR] Failed to connect/query the database: {e}")
    print("\nNOTE: If you are connecting locally to the Render Postgres database, make sure you replace the internal host name in DATABASE_URL with the External Database URL in your .env!")
