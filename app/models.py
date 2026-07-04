import mysql.connector
from flask import g
from flask_login import UserMixin

from app.config import DB_CONFIG


class User(UserMixin):
    def __init__(self, id, username, role='user'):
        self.id = id
        self.username = username
        self.role = role

    @property
    def is_admin(self):
        return self.role == 'admin'


def get_db():
    return mysql.connector.connect(**DB_CONFIG)


def close_db(exception=None):
    db = g.pop('db', None)
    if db is not None:
        try:
            db.close()
        except Exception:
            pass
