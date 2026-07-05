import hmac
import secrets

import bcrypt
from flask import request, jsonify, session, abort
from flask_login import login_user, logout_user, login_required, current_user
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from app.config import load_app_config, REDIS_URL
from app.models import get_db, User
from app.utils import sanitize_username

_storage = "memory://"
try:
    import redis as _rl_redis
    _test = _rl_redis.Redis.from_url(REDIS_URL, socket_connect_timeout=2)
    _test.ping()
    _storage = REDIS_URL
except Exception:
    pass

limiter = Limiter(key_func=get_remote_address, default_limits=[], storage_uri=_storage)


def is_admin_user():
    return current_user.is_authenticated and getattr(current_user, 'is_admin', False)


def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def check_password(password, hashed):
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except (ValueError, TypeError):
        return False


def generate_csrf_token():
    if '_csrf_token' not in session:
        session['_csrf_token'] = secrets.token_hex(32)
    return session['_csrf_token']


def validate_csrf(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not validate_csrf_request():
            abort(403)
        return f(*args, **kwargs)
    return decorated


def validate_csrf_request():
    token = request.form.get('_csrf_token') or request.headers.get('X-CSRF-Token')
    if not token:
        data = request.get_json(silent=True)
        if data:
            token = data.get('_csrf_token')
    session_token = session.get('_csrf_token', '')
    return bool(token and hmac.compare_digest(token, session_token))


def register_auth_routes(app):

    @app.route('/api/csrf')
    def api_csrf():
        return jsonify({'csrf_token': generate_csrf_token()})

    @app.route('/api/login', methods=['POST'])
    @limiter.limit("10/minute")
    def api_login():
        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip() or request.form.get('username', '').strip()
        password = data.get('password', '') or request.form.get('password', '')
        token = data.get('_csrf_token') or request.form.get('_csrf_token')
        if not token or token != session.get('_csrf_token'):
            return jsonify({'error': 'Invalid request'}), 403
        if not username or not password:
            return jsonify({'error': 'Please fill in all fields.'}), 400
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT id, username, password, role, is_approved FROM users WHERE username = %s', (username,))
        user = c.fetchone()
        conn.close()
        if user and check_password(password, user['password']):
            if not user['is_approved']:
                return jsonify({'error': 'Your account is pending admin approval.'}), 403
            login_user(User(user['id'], user['username'], user.get('role', 'user')))
            return jsonify({'user': {'id': user['id'], 'username': user['username'], 'role': user.get('role', 'user'), 'is_admin': user.get('role') == 'admin'}})
        return jsonify({'error': 'Invalid username or password.'}), 401

    @app.route('/api/register', methods=['POST'])
    @limiter.limit("5/minute")
    def api_register():
        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip() or request.form.get('username', '').strip()
        password = data.get('password', '') or request.form.get('password', '')
        confirm = data.get('confirm_password', '') or request.form.get('confirm_password', '')
        token = data.get('_csrf_token') or request.form.get('_csrf_token')
        if not token or token != session.get('_csrf_token'):
            return jsonify({'error': 'Invalid request'}), 403
        if not username or not password or not confirm:
            return jsonify({'error': 'Please fill in all fields.'}), 400
        clean = sanitize_username(username)
        if clean != username or len(username) < 3:
            return jsonify({'error': 'Username: 3-80 chars, letters/numbers/dots/dashes/underscores only.'}), 400
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters.'}), 400
        if password != confirm:
            return jsonify({'error': 'Passwords do not match.'}), 400
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT id FROM users WHERE username = %s', (clean,))
        if c.fetchone():
            conn.close()
            return jsonify({'error': 'Username already exists.'}), 409
        hashed = hash_password(password)
        c.execute('INSERT INTO users (username, password, role, is_approved) VALUES (%s, %s, %s, %s)', (clean, hashed, 'user', 0))
        conn.close()
        return jsonify({'message': 'Account created! Waiting for admin approval.'})

    @app.route('/api/logout', methods=['POST'])
    @login_required
    @validate_csrf
    def api_logout():
        logout_user()
        return jsonify({'ok': True})

    @app.route('/api/me')
    @login_required
    def api_me():
        return jsonify({'user': {'id': current_user.id, 'username': current_user.username, 'role': current_user.role, 'is_admin': current_user.is_admin}})

    @app.route('/api/settings', methods=['POST'])
    @login_required
    @validate_csrf
    def api_user_settings():
        data = request.get_json(silent=True) or {}
        new_username = data.get('username', '').strip()
        new_password = data.get('new_password', '').strip()
        current_password = data.get('current_password', '').strip()

        if not current_password:
            return jsonify({'error': 'Current password is required.'}), 400

        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT password FROM users WHERE id = %s', (current_user.id,))
        user = c.fetchone()
        conn.close()

        if not user or not check_password(current_password, user['password']):
            return jsonify({'error': 'Current password is incorrect.'}), 400

        updates = []
        params = []

        if new_username:
            clean = sanitize_username(new_username)
            if clean != new_username or len(new_username) < 3:
                return jsonify({'error': 'Username: 3-80 chars, letters/numbers/dots/dashes/underscores only.'}), 400
            conn = get_db()
            c = conn.cursor(dictionary=True)
            c.execute('SELECT id FROM users WHERE username = %s AND id != %s', (clean, current_user.id))
            if c.fetchone():
                conn.close()
                return jsonify({'error': 'Username already taken.'}), 409
            conn.close()
            updates.append('username = %s')
            params.append(clean)

        if new_password:
            if len(new_password) < 6:
                return jsonify({'error': 'New password must be at least 6 characters.'}), 400
            hashed = hash_password(new_password)
            updates.append('password = %s')
            params.append(hashed)

        if not updates:
            return jsonify({'error': 'No changes provided.'}), 400

        params.append(current_user.id)
        conn = get_db()
        c = conn.cursor()
        c.execute(f'UPDATE users SET {", ".join(updates)} WHERE id = %s', params)
        conn.close()

        if new_username:
            from flask_login import login_user
            login_user(User(current_user.id, new_username, current_user.role))

        return jsonify({'ok': True, 'message': 'Settings updated.'})
