import os
import sys

sys.path.insert(0, '/opt/spotdl-web')

from app import create_app
from app.models import get_db
from app.auth import hash_password
from app.config import ADMIN_USER, ADMIN_PASS


def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(80) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('admin','user') DEFAULT 'user',
            is_approved TINYINT(1) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS downloads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            spotify_url VARCHAR(512) NOT NULL,
            title VARCHAR(255),
            artist VARCHAR(255),
            image_url VARCHAR(1024),
            filename VARCHAR(255),
            status ENUM('pending','processing','completed','failed','cancelled') DEFAULT 'pending',
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS url_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            spotify_url VARCHAR(512) NOT NULL,
            content_type VARCHAR(20) NOT NULL,
            collection_name VARCHAR(255),
            image_url VARCHAR(1024),
            track_data JSON,
            batch_id VARCHAR(32),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    c.execute("SELECT COUNT(*) FROM users WHERE username=%s", (ADMIN_USER,))
    if c.fetchone()[0] == 0 and ADMIN_PASS:
        hashed = hash_password(ADMIN_PASS)
        c.execute(
            "INSERT INTO users (username, password, role, is_approved) VALUES (%s, %s, %s, %s)",
            (ADMIN_USER, hashed, 'admin', 1)
        )

    for idx_sql in [
        "CREATE INDEX IF NOT EXISTS idx_downloads_user_id ON downloads(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status)",
        "CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_url_history_user_id ON url_history(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_url_history_created_at ON url_history(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_url_history_batch_id ON url_history(batch_id)",
    ]:
        try:
            c.execute(idx_sql)
        except Exception:
            pass

    c.execute("SELECT id, password FROM users")
    for row in c.fetchall():
        if row[1] and not row[1].startswith('$2'):
            hashed = hash_password(row[1])
            c.execute("UPDATE users SET password=%s WHERE id=%s", (hashed, row[0]))

    c.execute("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='spotdl_db' AND table_name='downloads' AND column_name='artist'")
    if c.fetchone()[0] == 0:
        c.execute("ALTER TABLE downloads ADD COLUMN artist VARCHAR(255) AFTER title")
        c.execute("ALTER TABLE downloads ADD COLUMN image_url VARCHAR(1024) AFTER artist")

    c.execute("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='spotdl_db' AND table_name='users' AND column_name='role'")
    if c.fetchone()[0] == 0:
        c.execute("ALTER TABLE users ADD COLUMN role ENUM('admin','user') DEFAULT 'user' AFTER password")
        c.execute("ALTER TABLE users ADD COLUMN is_approved TINYINT(1) DEFAULT 0 AFTER role")

    c.execute("SHOW COLUMNS FROM downloads LIKE 'status'")
    col = c.fetchone()
    if col and 'cancelled' not in col[1]:
        c.execute("ALTER TABLE downloads MODIFY COLUMN status ENUM('pending','processing','completed','failed','cancelled') DEFAULT 'pending'")

    conn.close()


app = create_app()

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=False)
