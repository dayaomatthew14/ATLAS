import sqlite3

conn = sqlite3.connect('atlas_v3.db')
c = conn.cursor()
c.execute("UPDATE semesters SET term='3rd semester' WHERE term='3rd Semester'")
conn.commit()
print('Rows updated:', c.rowcount)
conn.close()
