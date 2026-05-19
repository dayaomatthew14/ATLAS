import sqlite3

def delete_unwanted_users():
    conn = sqlite3.connect('atlas_v3.db')
    c = conn.cursor()
    
    keep_emails = ('dayaomatthew14@gmail.com', 'rogerkarlenteria2@gmail.com')
    
    try:
        # Get user IDs to delete
        c.execute('SELECT id FROM users WHERE email NOT IN (?, ?)', keep_emails)
        user_ids_to_delete = [row[0] for row in c.fetchall()]
        
        if not user_ids_to_delete:
            print("No users to delete.")
            return

        print(f"Users to delete: {user_ids_to_delete}")
        placeholders = ','.join('?' * len(user_ids_to_delete))
        
        # 1. system_logs (user_id)
        c.execute(f'DELETE FROM system_logs WHERE user_id IN ({placeholders})', user_ids_to_delete)
        
        # 2. subject_offerings (assigned_by)
        c.execute(f'DELETE FROM subject_offerings WHERE assigned_by IN ({placeholders})', user_ids_to_delete)
        
        # 3. faculty_unavailability (faculty_id is users.id)
        c.execute(f'DELETE FROM faculty_unavailability WHERE faculty_id IN ({placeholders})', user_ids_to_delete)
        
        # 4. Find faculty records corresponding to these users
        c.execute(f'SELECT id FROM faculty WHERE user_id IN ({placeholders})', user_ids_to_delete)
        faculty_ids = [row[0] for row in c.fetchall()]
        
        if faculty_ids:
            fac_placeholders = ','.join('?' * len(faculty_ids))
            
            # Find schedules to delete conflicts
            c.execute(f'SELECT id FROM schedules WHERE faculty_id IN ({fac_placeholders})', faculty_ids)
            schedule_ids = [row[0] for row in c.fetchall()]
            
            if schedule_ids:
                sch_placeholders = ','.join('?' * len(schedule_ids))
                c.execute(f'DELETE FROM conflicts WHERE schedule_id_1 IN ({sch_placeholders}) OR schedule_id_2 IN ({sch_placeholders})', schedule_ids * 2)
                c.execute(f'DELETE FROM schedules WHERE faculty_id IN ({fac_placeholders})', faculty_ids)
                
            c.execute(f'DELETE FROM subject_offerings WHERE faculty_id IN ({fac_placeholders})', faculty_ids)
            c.execute(f'DELETE FROM ai_rules WHERE faculty_id IN ({fac_placeholders})', faculty_ids)
            c.execute(f'DELETE FROM faculty WHERE id IN ({fac_placeholders})', faculty_ids)
            
        # 5. users
        c.execute(f'DELETE FROM users WHERE id IN ({placeholders})', user_ids_to_delete)
        
        deleted_count = c.rowcount
        conn.commit()
        print(f"Successfully deleted {deleted_count} users and all their dependencies.")
    except Exception as e:
        print(f"Error: {e}")
        
    conn.close()

if __name__ == '__main__':
    delete_unwanted_users()
