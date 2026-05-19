import bcrypt
import sqlite3

# Generate a salt and hash the password
salt = bcrypt.gensalt(12)
hashed_password = bcrypt.hashpw(b"password123", salt).decode('utf-8')

conn = sqlite3.connect('atlas_v3.db')
cursor = conn.cursor()
cursor.execute("UPDATE users SET password_hash = ? WHERE email = 'chair@dlsau.edu.ph'", (hashed_password,))
conn.commit()
conn.close()
print("Password updated successfully.")
