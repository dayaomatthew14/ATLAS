import sqlite3

conn = sqlite3.connect('atlas_v3.db')
cursor = conn.cursor()
cursor.execute("UPDATE semesters SET term = '3rd Semester' WHERE term = 'Summer'")
conn.commit()
print('Updated', cursor.rowcount, 'rows')
conn.close()
