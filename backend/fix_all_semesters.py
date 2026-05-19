import sqlite3

conn = sqlite3.connect('atlas_v3.db')
c = conn.cursor()

# Fix 1st
c.execute("UPDATE semesters SET term='1st' WHERE term='1st Semester'")
print('Rows updated (1st):', c.rowcount)

# Fix 2nd
c.execute("UPDATE semesters SET term='2nd' WHERE term='2nd Semester'")
print('Rows updated (2nd):', c.rowcount)

# Fix 3rd
c.execute("UPDATE semesters SET term='3rd semester' WHERE term='3rd Semester'")
print('Rows updated (3rd):', c.rowcount)

conn.commit()
conn.close()
