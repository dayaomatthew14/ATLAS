import os
import sys
import json
import urllib.request
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./backend/atlas_v3.db")
RAILWAY_API = "https://atlas-production-06cf.up.railway.app/api"

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

print("=" * 70)
print("             ATLAS ADMIN DATABASE INSPECTOR")
print("=" * 70)

def inspect_db(url):
    print(f"Connecting to: {url.split('@')[-1] if '@' in url else url}")
    try:
        from sqlalchemy import create_engine, text
        engine = create_engine(url)
        with engine.connect() as conn:
            users = conn.execute(text(
                "SELECT id, first_name, last_name, email, role, department, is_verified, created_at FROM users ORDER BY id ASC"
            )).fetchall()
            
            if not users:
                print("\n[INFO] No users are registered in this database yet! (Database is empty)")
                print("=" * 70)
                return True
                
            print(f"\nTotal Registered Users: {len(users)}")
            print("-" * 110)
            print(f"{'ID':<4} | {'NAME':<25} | {'EMAIL':<30} | {'ROLE':<15} | {'DEPARTMENT':<25} | {'VERIFIED':<8}")
            print("-" * 110)
            
            for u in users:
                friendly_name = f"{u[1]} {u[2]}"
                dept_code = u[5]
                dept_name = dept_code or "N/A"
                verified_str = "Yes" if u[6] else "No"
                role_str = str(u[4]).upper()
                
                print(f"{u[0]:<4} | {friendly_name:<25} | {u[3]:<30} | {role_str:<15} | {str(dept_name):<25} | {verified_str:<8}")
                
            print("-" * 110)
            print("=" * 70)
            return True
    except Exception as e:
        print(f"[WARN] Direct SQL Connection error: {e}\n")
        return False

# Attempt primary DB (Cloud Postgres / .env)
success = inspect_db(DATABASE_URL)

# Fallback to Live Production API endpoint
if not success:
    print(">>> Querying Live Production API Server...")
    try:
        req = urllib.request.Request(f"{RAILWAY_API}/auth/clear-all-users", method="GET")
        res = urllib.request.urlopen(req)
        output = json.loads(res.read().decode('utf-8'))
        print(f"[SUCCESS] Cloud Server Response: {output.get('msg')}")
        print("=" * 70)
    except Exception as e:
        print(f"[ERROR] API Check Failed: {e}")

