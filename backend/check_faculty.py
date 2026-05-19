import sqlite3

conn = sqlite3.connect('atlas_v3.db')
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM faculty")
print("Faculty count:", cursor.fetchone()[0])
conn.close()
