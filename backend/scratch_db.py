import sqlite3

conn = sqlite3.connect('atlas_v3.db')
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(users);")
columns = cursor.fetchall()
print("Columns:")
for col in columns:
    print(col)

cursor.execute("SELECT * FROM users;")
users = cursor.fetchall()
print("\nUsers:")
for user in users:
    print(user)

conn.close()
