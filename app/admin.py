import json
from flask import request, jsonify
from flask_login import login_required

from app.models import get_db
from app.config import load_app_config, save_app_config, APP_CONFIG_FILE
from app.auth import is_admin_user, validate_csrf, validate_csrf_request


def register_admin_routes(app):

    @app.route('/api/admin/users')
    @login_required
    def api_admin_users():
        if not is_admin_user():
            return jsonify({'error': 'Forbidden'}), 403
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT id, username, role, is_approved, created_at FROM users ORDER BY id')
        users = c.fetchall()
        conn.close()
        for u in users:
            if u.get('created_at'):
                u['created_at'] = u['created_at'].isoformat() if hasattr(u['created_at'], 'isoformat') else str(u['created_at'])
        return jsonify({'users': users})

    @app.route('/api/admin/users/<action>/<int:user_id>', methods=['POST'])
    @login_required
    @validate_csrf
    def api_admin_user_action(action, user_id):
        if not is_admin_user():
            return jsonify({'error': 'Forbidden'}), 403
        if action not in ('approve', 'revoke', 'delete', 'promote', 'demote'):
            return jsonify({'error': 'Invalid action.'}), 400
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT id, username, role FROM users WHERE id = %s', (user_id,))
        user = c.fetchone()
        if not user:
            conn.close()
            return jsonify({'error': 'User not found.'}), 404
        if user['username'] == 'admin':
            conn.close()
            return jsonify({'error': 'Cannot modify admin.'}), 400
        if action == 'approve':
            c.execute('UPDATE users SET is_approved = 1 WHERE id = %s', (user_id,))
        elif action == 'revoke':
            c.execute('UPDATE users SET is_approved = 0 WHERE id = %s', (user_id,))
        elif action == 'promote':
            c.execute('UPDATE users SET role = %s WHERE id = %s', ('admin', user_id))
        elif action == 'demote':
            c.execute('UPDATE users SET role = %s WHERE id = %s', ('user', user_id))
        elif action == 'delete':
            c.execute('DELETE FROM users WHERE id = %s', (user_id,))
        conn.close()
        return jsonify({'ok': True, 'action': action})

    @app.route('/api/admin/settings', methods=['GET', 'POST'])
    @login_required
    def api_admin_settings():
        if not is_admin_user():
            return jsonify({'error': 'Forbidden'}), 403
        if request.method == 'POST':
            if not validate_csrf_request():
                return jsonify({'error': 'CSRF token missing'}), 403
            data = request.get_json(silent=True) or {}
            app_config = load_app_config()
            for key in ('batch_limit', 'max_concurrent_downloads', 'require_approval', 'audio_format', 'bitrate'):
                if key in data:
                    app_config[key] = data[key]
            save_app_config(app_config)
            return jsonify({'ok': True, 'config': app_config})
        return jsonify({'config': load_app_config()})
