import secrets
from datetime import timedelta

from flask import Flask, jsonify, session
from flask_login import LoginManager
from flask_session import Session

from app.config import (
    SECRET_KEY, REDIS_URL, HTTPS_ENABLED, SESSION_LIFETIME,
    DOWNLOAD_FOLDER, DB_CONFIG
)
from app.cache import redis_client
from app.models import User, get_db, close_db
from app.auth import (
    generate_csrf_token, register_auth_routes, limiter as auth_limiter,
    hash_password
)
from app.spotify import parse_spotify_url, fetch_spotify_metadata, fetch_spotify_playlist_metadata
from app.admin import register_admin_routes
from app.history import register_history_routes
from app.downloads import register_download_routes
from app.sse import sse_queues
from app.config import ADMIN_USER, ADMIN_PASS


def create_app():
    app = Flask(__name__)
    app.secret_key = SECRET_KEY

    app.config.update(
        PERMANENT_SESSION_LIFETIME=SESSION_LIFETIME,
        DOWNLOAD_FOLDER=DOWNLOAD_FOLDER,
        MAX_CONTENT_LENGTH=500 * 1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_SECURE=HTTPS_ENABLED,
        SESSION_COOKIE_NAME='spotdl_session',
    )

    # ── Redis Session ──
    if redis_client:
        _session_redis = None
        try:
            from redis import Redis as RedisConnection
            _session_redis = RedisConnection.from_url(REDIS_URL, decode_responses=False, socket_connect_timeout=3)
            _session_redis.ping()
        except Exception:
            _session_redis = redis_client
        app.config.update(
            SESSION_TYPE='redis',
            SESSION_REDIS=_session_redis,
            SESSION_USE_SIGNER=True,
            SESSION_KEY_PREFIX='spotdl:session:',
        )
        Session(app)

    # ── Login Manager ──
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = None

    @login_manager.unauthorized_handler
    def unauthorized():
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Login required'}), 401
        return jsonify({'error': 'Login required'}), 401

    @login_manager.user_loader
    def load_user(user_id):
        try:
            conn = get_db()
            c = conn.cursor(dictionary=True)
            c.execute('SELECT id, username, role FROM users WHERE id = %s', (int(user_id),))
            user = c.fetchone()
            conn.close()
            if user:
                return User(user['id'], user['username'], user.get('role', 'user'))
        except Exception:
            pass
        return None

    # ── CSRF ──
    app.jinja_env.globals['csrf_token'] = generate_csrf_token

    # ── Security Headers ──
    @app.after_request
    def set_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "media-src 'self' https://p.scdn.co blob:; "
            "img-src 'self' https://i.scdn.co https://image-cdn-ak.spotifycdn.com https://mosaic.scdn.co data: blob:; "
            "connect-src 'self';"
        )
        return response

    @app.before_request
    def make_session_permanent():
        session.permanent = True

    # ── DB Teardown ──
    app.teardown_appcontext(close_db)

    # ── Health Check ──
    @app.route('/')
    def index():
        from flask import send_from_directory
        return send_from_directory(app.static_folder or '/opt/spotdl-web/static/react', 'index.html')

    @app.route('/<path:path>')
    def static_proxy(path):
        from flask import send_from_directory
        import os
        static_dir = '/opt/spotdl-web/static/react'
        file_path = os.path.join(static_dir, path)
        if os.path.isfile(file_path):
            return send_from_directory(static_dir, path)
        return send_from_directory(static_dir, 'index.html')

    # ── SSE ──
    import queue as q_module

    @app.route('/api/events')
    @login_required_sse(app, login_manager)
    def sse_events():
        q = q_module.Queue(maxsize=50)
        from flask_login import current_user
        uid = current_user.id
        if uid not in sse_queues:
            sse_queues[uid] = []
        sse_queues[uid].append(q)

        def generate():
            try:
                yield "event: connected\ndata: {}\n\n"
                while True:
                    try:
                        msg = q.get(timeout=30)
                        yield msg
                    except q_module.Empty:
                        yield ": keepalive\n\n"
            except GeneratorExit:
                pass
            finally:
                if uid in sse_queues and q in sse_queues[uid]:
                    sse_queues[uid].remove(q)

        return app.response_class(generate(), mimetype='text/event-stream',
                                  headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

    # ── Error Handlers ──
    @app.errorhandler(403)
    def forbidden(e):
        if getattr(e, 'code', 0) == 403 or True:
            from flask import request
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Forbidden'}), 403
        return jsonify({'error': 'Forbidden'}), 403

    @app.errorhandler(404)
    def not_found(e):
        from flask import request
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Not found'}), 404
        return jsonify({'error': 'Not found'}), 404

    @app.errorhandler(429)
    def rate_limited(e):
        from flask import request
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Rate limit exceeded. Try again later.'}), 429
        return jsonify({'error': 'Rate limit exceeded.'}), 429

    @app.errorhandler(500)
    def server_error(e):
        from flask import request
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Internal server error'}), 500
        return jsonify({'error': 'Internal server error'}), 500

    # ── Register Blueprints/Routes ──
    register_auth_routes(app)
    register_admin_routes(app)
    register_history_routes(app)
    register_download_routes(app, auth_limiter)

    # ── Preview route (needs special import) ──
    from app.auth import validate_csrf
    from app.utils import estimate_size_mb

    @app.route('/api/preview', methods=['POST'])
    @login_required_sse(app, login_manager)
    @validate_csrf
    def api_preview_json():
        from flask import request
        data = request.get_json(silent=True) or {}
        url = data.get('spotify_url', '').strip()
        audio_format = data.get('audio_format', 'mp3')
        bitrate = data.get('bitrate', '128k')
        if not url:
            return jsonify({'error': 'Please enter a Spotify URL.'}), 400

        content_type, item_id = parse_spotify_url(url)
        if not content_type:
            return jsonify({'error': 'Invalid Spotify URL.'}), 400

        if content_type == 'track':
            metadata = fetch_spotify_metadata(url)
            if not metadata:
                return jsonify({'error': 'Could not fetch track info. Check the URL.'}), 400
            metadata['type'] = 'track'
            metadata['estimated_size_mb'] = estimate_size_mb(metadata.get('duration_ms', 0), audio_format, bitrate)
            return jsonify(metadata)

        if content_type in ('album', 'playlist'):
            metadata = fetch_spotify_playlist_metadata(url)
            if not metadata:
                return jsonify({'error': f'Could not fetch {content_type} info. Check the URL.'}), 400
            total_ms = sum(t.get('duration_ms', 0) for t in metadata.get('tracks', []))
            metadata['estimated_size_mb'] = estimate_size_mb(total_ms, audio_format, bitrate)
            metadata['audio_format'] = audio_format
            metadata['bitrate'] = bitrate
            for t in metadata.get('tracks', []):
                t['estimated_size_mb'] = estimate_size_mb(t.get('duration_ms', 0), audio_format, bitrate)
            return jsonify(metadata)

        if content_type == 'artist':
            return jsonify({'error': 'Artist URLs not supported.'}), 400

        return jsonify({'error': 'Unsupported URL type.'}), 400

    return app


def login_required_sse(app, login_manager):
    """login_required that works for SSE (sends 401 instead of redirect)"""
    from functools import wraps
    from flask import request
    from flask_login import current_user

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not current_user.is_authenticated:
                if request.path.startswith('/api/'):
                    from flask import jsonify
                    return jsonify({'error': 'Login required'}), 401
                return login_manager.unauthorized()
            return f(*args, **kwargs)
        return decorated
    return decorator
