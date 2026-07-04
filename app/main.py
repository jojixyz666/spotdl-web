import os
import sys
import re
import json
import hmac
import time
import secrets
import hashlib
import threading
import subprocess
import zipfile
import io
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from functools import wraps
from urllib.parse import urlparse

sys.path.insert(0, '/opt/spotdl-web/app')

from flask import (
    Flask, render_template, request, redirect, url_for,
    send_from_directory, flash, jsonify, session, abort, g
)
from flask_login import (
    LoginManager, UserMixin, login_user, login_required,
    logout_user, current_user
)
import bcrypt
import mysql.connector
import redis
import requests

# ──────────────────────────────────────────────
# App Config
# ──────────────────────────────────────────────

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))

app.config.update(
    PERMANENT_SESSION_LIFETIME=timedelta(hours=2),
    DOWNLOAD_FOLDER='/opt/spotdl-web/downloads',
    MAX_CONTENT_LENGTH=500 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=os.environ.get('HTTPS_ENABLED', '0') == '1',
    SESSION_COOKIE_NAME='spotdl_session',
)

# Redis
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
redis_client = None
try:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=3)
    redis_client.ping()
except Exception:
    redis_client = None

# Flask-Session with Redis backend (separate connection for binary session data)
if redis_client:
    from flask_session import Session
    _session_redis = None
    try:
        _session_redis = redis.Redis.from_url(REDIS_URL, decode_responses=False, socket_connect_timeout=3)
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

# DB Config from env
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'user': os.environ.get('DB_USER', 'spotdl_user'),
    'password': os.environ.get('DB_PASSWORD', 'SpotDL@Pass123'),
    'database': os.environ.get('DB_NAME', 'spotdl_db'),
    'autocommit': True,
    'pool_name': 'spotdl_pool',
    'pool_size': 10,
    'pool_reset_session': True,
}

YTDLP_BIN = '/opt/spotdl-web/bin/yt-dlp'
FFMPEG_BIN = '/usr/bin/ffmpeg'
APP_CONFIG_FILE = '/opt/spotdl-web/config.json'

# Thread pool for downloads
download_executor = ThreadPoolExecutor(max_workers=10)

# Download semaphore
download_semaphore = threading.Semaphore(5)

def get_download_semaphore():
    global download_semaphore
    try:
        cfg = load_app_config()
        new_limit = cfg.get('max_concurrent_downloads', 5)
        if new_limit != download_semaphore._value:
            download_semaphore = threading.Semaphore(new_limit)
    except Exception:
        pass
    return download_semaphore

def bounded_download(fn, *args):
    sem = get_download_semaphore()
    with sem:
        fn(*args)

# ──────────────────────────────────────────────
# Cache Layer (Redis or in-memory fallback)
# ──────────────────────────────────────────────

_cache = {}

def cache_get(key):
    if redis_client:
        try:
            val = redis_client.get(key)
            return json.loads(val) if val else None
        except Exception:
            pass
    return _cache.get(key)

def cache_set(key, value, ttl=3600):
    if redis_client:
        try:
            redis_client.setex(key, ttl, json.dumps(value))
            return
        except Exception:
            pass
    _cache[key] = value

def cache_delete_pattern(pattern):
    if redis_client:
        try:
            keys = redis_client.keys(pattern)
            if keys:
                redis_client.delete(*keys)
        except Exception:
            pass
    else:
        for k in list(_cache.keys()):
            if re.match(pattern.replace('*', '.*'), k):
                del _cache[k]

def cache_key(*args):
    return 'spotdl:cache:' + hashlib.md5(':'.join(str(a) for a in args).encode()).hexdigest()

DEFAULT_APP_CONFIG = {
    'batch_limit': 500,
    'max_concurrent_downloads': 5,
    'require_approval': True,
    'audio_format': 'mp3',
    'bitrate': '128k',
}

def load_app_config():
    try:
        with open(APP_CONFIG_FILE, 'r') as f:
            cfg = json.load(f)
        merged = dict(DEFAULT_APP_CONFIG)
        merged.update(cfg)
        return merged
    except Exception:
        return dict(DEFAULT_APP_CONFIG)

def save_app_config(cfg):
    with open(APP_CONFIG_FILE, 'w') as f:
        json.dump(cfg, f, indent=2)

# ──────────────────────────────────────────────
# Security: Rate Limiting
# ──────────────────────────────────────────────

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=[],
    storage_uri="memory://",
)

# ──────────────────────────────────────────────
# Security: CSRF Token
# ──────────────────────────────────────────────

def generate_csrf_token():
    if '_csrf_token' not in session:
        session['_csrf_token'] = secrets.token_hex(32)
    return session['_csrf_token']

app.jinja_env.globals['csrf_token'] = generate_csrf_token

def validate_csrf(f):
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

# ──────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = None

@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Login required'}), 401
    return jsonify({'error': 'Login required'}), 401

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

# Cached DB connection per request
@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        try:
            db.close()
        except Exception:
            pass

def is_admin_user():
    return current_user.is_authenticated and getattr(current_user, 'is_admin', False)

def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def check_password(password, hashed):
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except (ValueError, TypeError):
        return False

def sanitize_filename(name):
    name = os.path.basename(name)
    name = re.sub(r'[^\w\-_. ]', '', name)
    return name.strip()[:200] or 'download'

def sanitize_username(username):
    return re.sub(r'[^a-zA-Z0-9_.-]', '', username)

SPOTIFY_URL_RE = re.compile(
    r'(?:https?://)?(?:open\.spotify\.com|spotify\.link)/(track|album|playlist|artist)/([a-zA-Z0-9]+)'
)

def parse_spotify_url(url):
    m = SPOTIFY_URL_RE.search(url)
    if not m:
        return None, None
    return m.group(1), m.group(2)

# ──────────────────────────────────────────────
# Spotify Metadata via Embed API (no auth needed)
# ──────────────────────────────────────────────

def fetch_spotify_metadata(url):
    content_type, track_id = parse_spotify_url(url)
    if not content_type or content_type != 'track':
        return None

    # Check cache
    ck = cache_key('track', track_id)
    cached = cache_get(ck)
    if cached:
        return cached

    try:
        embed_url = f'https://open.spotify.com/embed/{content_type}/{track_id}'
        headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        }
        r = requests.get(embed_url, headers=headers, timeout=10)
        if r.status_code != 200:
            return None

        m = re.search(r'__NEXT_DATA__[^>]*>(.*?)</script>', r.text, re.DOTALL)
        if not m:
            return None

        data = json.loads(m.group(1))
        entity = data.get('props', {}).get('pageProps', {}).get('state', {}).get('data', {}).get('entity', {})

        if not entity or entity.get('type') != 'track':
            return None

        artists = [a.get('name', '') for a in entity.get('artists', [])]
        images = entity.get('visualIdentity', {}).get('image', [])
        image_url = images[0].get('url') if images else ''
        preview_url = entity.get('audioPreview', {}).get('url', '')

        result = {
            'id': track_id,
            'name': entity.get('name', 'Unknown'),
            'artist': ', '.join(artists) if artists else 'Unknown',
            'album': '',
            'duration_ms': entity.get('duration', 0),
            'image_url': image_url,
            'preview_url': preview_url,
            'url': f'https://open.spotify.com/track/{track_id}',
        }
        cache_set(ck, result, ttl=86400)
        return result
    except Exception:
        return None

def fetch_spotify_playlist_metadata(url):
    content_type, playlist_id = parse_spotify_url(url)
    if not content_type or content_type not in ('album', 'playlist'):
        return None

    ck = cache_key('playlist', content_type, playlist_id)
    cached = cache_get(ck)
    if cached:
        cached['batch_limit'] = load_app_config().get('batch_limit', 500)
        return cached

    try:
        embed_url = f'https://open.spotify.com/embed/{content_type}/{playlist_id}'
        headers = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'}
        r = requests.get(embed_url, headers=headers, timeout=15)
        if r.status_code != 200:
            return None

        m = re.search(r'__NEXT_DATA__[^>]*>(.*?)</script>', r.text, re.DOTALL)
        if not m:
            return None

        data = json.loads(m.group(1))
        entity = data.get('props', {}).get('pageProps', {}).get('state', {}).get('data', {}).get('entity', {})
        if not entity:
            return None

        images = entity.get('visualIdentity', {}).get('image', [])
        image_url = images[0].get('url', '') if images else ''

        raw_tracks = entity.get('trackList', [])
        tracks = []
        for i, t in enumerate(raw_tracks):
            if not t.get('isPlayable'):
                continue
            track_id = t.get('uri', '').replace('spotify:track:', '')
            if not track_id:
                continue
            audio = t.get('audioPreview', {})
            tracks.append({
                'index': i + 1,
                'id': track_id,
                'uri': t.get('uri', ''),
                'title': t.get('title', 'Unknown'),
                'artist': t.get('subtitle', 'Unknown'),
                'duration_ms': t.get('duration', 0),
                'preview_url': audio.get('url', '') if audio else '',
                'image_url': image_url,
                'url': f'https://open.spotify.com/track/{track_id}',
            })

        result = {
            'type': content_type,
            'id': playlist_id,
            'name': entity.get('name', 'Unknown'),
            'image_url': image_url,
            'track_count': len(tracks),
            'tracks': tracks,
            'batch_limit': load_app_config().get('batch_limit', 500),
        }
        cache_set(ck, result, ttl=3600)
        return result
    except Exception:
        return None

# ──────────────────────────────────────────────
# Init DB
# ──────────────────────────────────────────────

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
            status ENUM('pending','processing','completed','failed') DEFAULT 'pending',
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

    c.execute("SELECT COUNT(*) FROM users WHERE username=%s", (os.environ.get('ADMIN_USER', 'admin'),))
    if c.fetchone()[0] == 0:
        admin_user = os.environ.get('ADMIN_USER', 'admin')
        admin_pass = os.environ.get('ADMIN_PASS', 'admin123')
        hashed = hash_password(admin_pass)
        c.execute(
            "INSERT INTO users (username, password, role, is_approved) VALUES (%s, %s, %s, %s)",
            (admin_user, hashed, 'admin', 1)
        )

    # Performance indexes
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

    c.execute("SELECT password FROM users WHERE username='admin'")
    row = c.fetchone()
    if row and not row[0].startswith('$2'):
        hashed = hash_password('admin123')
        c.execute("UPDATE users SET password=%s WHERE username='admin'", (hashed,))

    c.execute("UPDATE users SET is_approved=1, role='admin' WHERE username='admin'")

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
        c.execute("UPDATE users SET is_approved=1 WHERE username='admin'")
        c.execute("UPDATE users SET role='admin' WHERE username='admin'")

    conn.close()

# ──────────────────────────────────────────────
# Auth
# ──────────────────────────────────────────────

@login_manager.user_loader
def load_user(user_id):
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT id, username, role FROM users WHERE id = %s', (user_id,))
    user = c.fetchone()
    conn.close()
    if user:
        return User(user['id'], user['username'], user.get('role', 'user'))
    return None

@app.route('/')
def index():
    return jsonify({'status': 'ok', 'app': 'spotdl-web', 'frontend': '/static/react/'}), 200

# ──────────────────────────────────────────────
# Download Logic (yt-dlp)
# ──────────────────────────────────────────────

def run_download(download_id, spotify_url, user_id, title, artist, image_url):
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s WHERE id = %s', ('processing', download_id))
    conn.close()

    cfg = load_app_config()
    audio_format = cfg.get('audio_format', 'mp3')
    bitrate = cfg.get('bitrate', '128k')

    output_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(user_id))
    os.makedirs(output_dir, exist_ok=True)

    safe_name = f'{sanitize_filename(artist)} - {sanitize_filename(title)}'
    output_template = os.path.join(output_dir, f'{safe_name}.%(ext)s')

    bitrate_args = []
    if bitrate == 'disable':
        bitrate_args = ['--bitrate', 'disable']
    elif bitrate == 'auto':
        bitrate_args = ['--bitrate', 'auto']
    else:
        bitrate_args = ['--audio-quality', bitrate.replace('k', '')]

    # Strategy 1: Try YouTube with multiple player clients
    clients = ['web_creator', 'ios', 'mweb', 'tv']
    for client in clients:
        try:
            cmd = [
                YTDLP_BIN,
                f'ytsearch1:{artist} - {title} official audio',
                '--extract-audio',
                '--audio-format', audio_format,
                *bitrate_args,
                '--output', output_template,
                '--no-playlist',
                '--no-overwrites',
                '--ffmpeg-location', FFMPEG_BIN,
                '--quiet',
                '--no-warnings',
                '--extractor-args', f'youtube:player_client={client}',
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

            if result.returncode == 0:
                for f in os.listdir(output_dir):
                    if f.endswith(('.mp3', '.wav', '.flac', '.m4a', '.ogg', '.opus')):
                        conn = get_db()
                        c = conn.cursor()
                        c.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                                  ('completed', f, 'Download completed.', download_id))
                        conn.close()
                        return
        except subprocess.TimeoutExpired:
            continue
        except Exception:
            continue

    # Strategy 2: Try SoundCloud
    try:
        sc_template = os.path.join(output_dir, f'{safe_name}.%(ext)s')
        cmd = [
            YTDLP_BIN,
            f'scsearch1:{artist} - {title}',
            '--extract-audio',
            '--audio-format', audio_format,
            *bitrate_args,
            '--output', sc_template,
            '--no-playlist',
            '--ffmpeg-location', FFMPEG_BIN,
            '--quiet',
            '--no-warnings',
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            for f in os.listdir(output_dir):
                if f.endswith(('.mp3', '.wav', '.flac', '.m4a', '.ogg', '.opus')):
                    conn = get_db()
                    c = conn.cursor()
                    c.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                              ('completed', f, 'Downloaded from SoundCloud.', download_id))
                    conn.close()
                    return
    except Exception:
        pass

    # Strategy 3: Save Spotify preview as fallback
    metadata = fetch_spotify_metadata(spotify_url)
    if metadata and metadata.get('preview_url'):
        try:
            preview_path = os.path.join(output_dir, f'{safe_name}.mp3')
            r = requests.get(metadata['preview_url'], timeout=15)
            if r.status_code == 200 and len(r.content) > 10000:
                with open(preview_path, 'wb') as f:
                    f.write(r.content)
                conn = get_db()
                c = conn.cursor()
                c.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                          ('completed', f'{safe_name}.mp3', 'Saved Spotify preview (30s). Full download unavailable.', download_id))
                conn.close()
                return
        except Exception:
            pass

    # All strategies failed
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s, message = %s WHERE id = %s',
              ('failed', 'Download failed. Try again later.', download_id))
    conn.close()

def submit_download():
    url = request.form.get('spotify_url', '').strip()
    title = request.form.get('title', '').strip()
    artist = request.form.get('artist', '').strip()
    image_url = request.form.get('image_url', '').strip()
    preview_url = request.form.get('preview_url', '').strip()

    if not url:
        flash('Please enter a Spotify URL.', 'warning')
        return jsonify({'error': 'Use API endpoints'}), 404

    content_type, track_id = parse_spotify_url(url)
    if not content_type or content_type != 'track':
        flash('Invalid Spotify URL.', 'warning')
        return jsonify({'error': 'Use API endpoints'}), 404

    url = f'https://open.spotify.com/track/{track_id}'

    if not title or not artist:
        metadata = fetch_spotify_metadata(url)
        if metadata:
            title = metadata['name']
            artist = metadata['artist']
            image_url = metadata.get('image_url', '')
        else:
            title = f'Track {track_id}'
            artist = 'Unknown'

    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute(
        'INSERT INTO downloads (user_id, spotify_url, title, artist, image_url, status) VALUES (%s, %s, %s, %s, %s, %s)',
        (current_user.id, url, title[:255], artist[:255], image_url[:1024], 'pending')
    )
    download_id = c.lastrowid
    conn.close()

    # Save to history (skip if downloading from history page)
    if not request.form.get('from_history'):
        track_data = json.dumps([{
            'id': track_id,
            'title': title,
            'artist': artist,
            'image_url': image_url,
            'url': url,
            'preview_url': preview_url,
        }])
        conn = get_db()
        c = conn.cursor()
        c.execute(
            'INSERT INTO url_history (user_id, spotify_url, content_type, collection_name, image_url, track_data) VALUES (%s, %s, %s, %s, %s, %s)',
            (current_user.id, url, 'track', f'{artist} - {title}', image_url, track_data)
        )
        conn.close()

    download_executor.submit(bounded_download, run_download, download_id, url, current_user.id, title, artist, image_url)

    flash(f'Downloading: {artist} - {title}', 'info')
    return jsonify({'error': 'Use API endpoints'}), 404

def submit_batch_download():
    tracks_json = request.form.get('tracks', '[]')
    collection_name = request.form.get('collection_name', 'Download').strip()[:100]
    content_type = request.form.get('content_type', 'album')

    try:
        tracks = json.loads(tracks_json)
    except (json.JSONDecodeError, TypeError):
        flash('Invalid track data.', 'danger')
        return jsonify({'error': 'Use API endpoints'}), 404

    if not tracks:
        flash('No tracks selected.', 'warning')
        return jsonify({'error': 'Use API endpoints'}), 404

    app_config = load_app_config()
    batch_limit = app_config.get('batch_limit', 500)
    if len(tracks) > batch_limit:
        flash(f'Maximum {batch_limit} tracks per batch.', 'warning')
        return jsonify({'error': 'Use API endpoints'}), 404

    batch_id = secrets.token_hex(8)
    batch_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(current_user.id), f'batch_{batch_id}')
    os.makedirs(batch_dir, exist_ok=True)

    # Save to history (skip if downloading from history page)
    if not request.form.get('from_history'):
        conn = get_db()
        c = conn.cursor()
        c.execute(
            'INSERT INTO url_history (user_id, spotify_url, content_type, collection_name, image_url, track_data, batch_id) VALUES (%s, %s, %s, %s, %s, %s, %s)',
            (current_user.id, tracks[0].get('url', ''), content_type, collection_name,
             tracks[0].get('image_url', ''), json.dumps(tracks), batch_id)
        )
        conn.close()

    for t in tracks:
        t_id = t.get('id', '')
        t_title = t.get('title', f'Track {t_id}')
        t_artist = t.get('artist', 'Unknown')
        t_image = t.get('image_url', '')
        t_url = t.get('url', f'https://open.spotify.com/track/{t_id}')

        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute(
            'INSERT INTO downloads (user_id, spotify_url, title, artist, image_url, status) VALUES (%s, %s, %s, %s, %s, %s)',
            (current_user.id, t_url, t_title[:255], t_artist[:255], t_image[:1024], 'pending')
        )
        download_id = c.lastrowid
        conn.close()

        download_executor.submit(bounded_download, run_batch_download, download_id, t_url, current_user.id, t_title, t_artist, t_image, batch_id)

    flash(f'Batch downloading {len(tracks)} tracks from {collection_name}...', 'info')
    return jsonify({'error': 'Use API endpoints'}), 404

def run_batch_download(download_id, spotify_url, user_id, title, artist, image_url, batch_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s WHERE id = %s', ('processing', download_id))
    conn.close()

    cfg = load_app_config()
    audio_format = cfg.get('audio_format', 'mp3')
    bitrate = cfg.get('bitrate', '128k')

    batch_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(user_id), f'batch_{batch_id}')
    os.makedirs(batch_dir, exist_ok=True)

    safe_name = f'{sanitize_filename(artist)} - {sanitize_filename(title)}'
    output_template = os.path.join(batch_dir, f'{safe_name}.%(ext)s')
    final_output = os.path.join(batch_dir, f'{safe_name}.{audio_format}')

    bitrate_args = []
    if bitrate == 'disable':
        bitrate_args = ['--bitrate', 'disable']
    elif bitrate == 'auto':
        bitrate_args = ['--bitrate', 'auto']
    else:
        bitrate_args = ['--audio-quality', bitrate.replace('k', '')]

    # Strategy 1: YouTube
    clients = ['web_creator', 'ios', 'mweb', 'tv']
    for client in clients:
        try:
            cmd = [
                YTDLP_BIN,
                f'ytsearch1:{artist} - {title} official audio',
                '--extract-audio', '--audio-format', audio_format,
                *bitrate_args,
                '--output', output_template, '--no-playlist', '--no-overwrites',
                '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
                '--extractor-args', f'youtube:player_client={client}',
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0 and os.path.exists(final_output):
                conn = get_db()
                c = conn.cursor()
                c.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                          ('completed', f'{safe_name}.{audio_format}', 'Downloaded.', download_id))
                conn.close()
                return
        except Exception:
            continue

    # Strategy 2: SoundCloud
    try:
        cmd = [
            YTDLP_BIN, f'scsearch1:{artist} - {title}',
            '--extract-audio', '--audio-format', audio_format,
            *bitrate_args,
            '--output', output_template, '--no-playlist',
            '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0 and os.path.exists(final_output):
            conn = get_db()
            c = conn.cursor()
            c.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                      ('completed', f'{safe_name}.{audio_format}', 'Downloaded from SoundCloud.', download_id))
            conn.close()
            return
    except Exception:
        pass

    # Strategy 3: Spotify preview
    metadata = fetch_spotify_metadata(spotify_url)
    if metadata and metadata.get('preview_url'):
        try:
            r = requests.get(metadata['preview_url'], timeout=15)
            if r.status_code == 200 and len(r.content) > 10000:
                with open(final_output, 'wb') as f:
                    f.write(r.content)
                conn = get_db()
                c = conn.cursor()
                c.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                          ('completed', f'{safe_name}.mp3', 'Spotify preview (30s).', download_id))
                conn.close()
                return
        except Exception:
            pass

    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s, message = %s WHERE id = %s',
              ('failed', 'Download failed.', download_id))
    conn.close()

def download_batch_zip(batch_id):
    if not re.match(r'^[a-f0-9]{16}$', batch_id):
        abort(400)

    batch_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(current_user.id), f'batch_{batch_id}')
    if not os.path.isdir(batch_dir):
        flash('Batch not found.', 'danger')
        return jsonify({'error': 'Use API endpoints'}), 404

    mp3_files = [f for f in os.listdir(batch_dir) if f.endswith('.mp3')]
    if not mp3_files:
        flash('No completed downloads in this batch yet.', 'warning')
        return jsonify({'error': 'Use API endpoints'}), 404

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(mp3_files):
            filepath = os.path.join(batch_dir, f)
            zf.write(filepath, f)
    zip_buffer.seek(0)

    from flask import send_file
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f'spotdl_batch_{batch_id[:8]}.zip'
    )

def batch_status(batch_id):
    if not re.match(r'^[a-f0-9]{16}$', batch_id):
        return jsonify({'error': 'Invalid batch ID'}), 400

    batch_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(current_user.id), f'batch_{batch_id}')
    if not os.path.isdir(batch_dir):
        return jsonify({'error': 'Batch not found'}), 404

    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute(
        "SELECT id, title, artist, filename, status, message FROM downloads WHERE user_id = %s AND status != 'pending' ORDER BY id DESC LIMIT 100",
        (current_user.id,)
    )
    rows = c.fetchall()
    conn.close()

    mp3_files = [f for f in os.listdir(batch_dir) if f.endswith('.mp3')]
    return jsonify({
        'completed_count': len(mp3_files),
        'downloads': rows,
    })

def download_file(download_id):
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute(
        'SELECT id, filename, status, user_id FROM downloads WHERE id = %s AND user_id = %s',
        (download_id, current_user.id)
    )
    d = c.fetchone()
    conn.close()

    if not d:
        flash('Download not found.', 'danger')
        return jsonify({'error': 'Use API endpoints'}), 404

    if d['status'] != 'completed' or not d['filename']:
        flash('Download is not ready yet.', 'warning')
        return jsonify({'error': 'Use API endpoints'}), 404

    user_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(current_user.id))
    filename = sanitize_filename(d['filename'])
    if not filename:
        flash('Invalid file.', 'danger')
        return jsonify({'error': 'Use API endpoints'}), 404

    # Check root user dir first
    filepath = os.path.join(user_dir, filename)
    real_user_dir = os.path.realpath(user_dir)

    if os.path.exists(filepath) and os.path.realpath(filepath).startswith(real_user_dir):
        return send_from_directory(user_dir, filename, as_attachment=True)

    # Check batch subdirectories
    if os.path.isdir(user_dir):
        for entry in os.listdir(user_dir):
            batch_path = os.path.join(user_dir, entry)
            if os.path.isdir(batch_path) and entry.startswith('batch_'):
                candidate = os.path.join(batch_path, filename)
                if os.path.exists(candidate) and os.path.realpath(candidate).startswith(real_user_dir):
                    return send_from_directory(batch_path, filename, as_attachment=True)

    flash('File no longer exists.', 'danger')
    return jsonify({'error': 'Use API endpoints'}), 404

def delete_download(download_id):
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute(
        'SELECT id, filename, user_id FROM downloads WHERE id = %s AND user_id = %s',
        (download_id, current_user.id)
    )
    d = c.fetchone()
    if d and d['filename']:
        output_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(current_user.id))
        safe_name = sanitize_filename(d['filename'])
        if safe_name:
            fpath = os.path.join(output_dir, safe_name)
            real_output = os.path.realpath(output_dir)
            real_fpath = os.path.realpath(fpath)
            if real_fpath.startswith(real_output) and os.path.exists(fpath):
                os.remove(fpath)
    if d:
        c.execute('DELETE FROM downloads WHERE id = %s', (download_id,))
    conn.close()
    flash('Download deleted.', 'success')
    return jsonify({'error': 'Use API endpoints'}), 404

def download_status(download_id):
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute(
        'SELECT id, status, title, filename, message FROM downloads WHERE id = %s AND user_id = %s',
        (download_id, current_user.id)
    )
    d = c.fetchone()
    conn.close()
    if d:
        return jsonify(d)
    return jsonify({'error': 'Not found'}), 404

# ──────────────────────────────────────────────
# SSE: Download Progress
# ──────────────────────────────────────────────

import queue
sse_queues = {}

def sse_broadcast(user_id, event, data):
    q_list = sse_queues.get(user_id, [])
    msg = f"event: {event}\ndata: {json.dumps(data)}\n\n"
    for q in q_list:
        try:
            q.put_nowait(msg)
        except queue.Full:
            pass

@app.route('/api/events')
@login_required
def sse_events():
    import queue as q_module
    q = q_module.Queue(maxsize=50)
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

# ──────────────────────────────────────────────
# JSON API Routes (for React frontend)
# ──────────────────────────────────────────────

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

@app.route('/api/preview', methods=['POST'])
@login_required
@validate_csrf
def api_preview_json():
    data = request.get_json(silent=True) or {}
    url = data.get('spotify_url', '').strip()
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
        return jsonify(metadata)

    if content_type in ('album', 'playlist'):
        metadata = fetch_spotify_playlist_metadata(url)
        if not metadata:
            return jsonify({'error': f'Could not fetch {content_type} info. Check the URL.'}), 400
        return jsonify(metadata)

    if content_type == 'artist':
        return jsonify({'error': 'Artist URLs not supported. Paste an album or playlist URL instead.'}), 400

    return jsonify({'error': 'Unsupported Spotify URL type.'}), 400

@app.route('/api/download', methods=['POST'])
@login_required
@validate_csrf
@limiter.limit("20/minute")
def api_download_track():
    data = request.get_json(silent=True) or {}
    url = data.get('url', '').strip() or data.get('spotify_url', '').strip()
    title = data.get('name', '').strip() or data.get('title', '').strip()
    artist = data.get('artist', '').strip()
    image_url = data.get('image_url', '').strip()
    preview_url = data.get('preview_url', '').strip()
    from_history = data.get('from_history', False)

    if not url:
        return jsonify({'error': 'No URL provided.'}), 400

    content_type, track_id = parse_spotify_url(url)
    if content_type == 'track':
        url = f'https://open.spotify.com/track/{track_id}'

    if not title or not artist:
        metadata = fetch_spotify_metadata(url)
        if metadata:
            title = metadata['name']
            artist = metadata['artist']
            image_url = metadata.get('image_url', '')
        else:
            title = f'Track {track_id}'
            artist = 'Unknown'

    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('INSERT INTO downloads (user_id, spotify_url, title, artist, image_url, status) VALUES (%s, %s, %s, %s, %s, %s)',
              (current_user.id, url, title[:255], artist[:255], image_url[:1024], 'pending'))
    download_id = c.lastrowid
    conn.close()

    if not from_history:
        track_data = json.dumps([{'id': track_id, 'title': title, 'artist': artist, 'image_url': image_url, 'url': url, 'preview_url': preview_url}])
        conn = get_db()
        c = conn.cursor()
        c.execute('INSERT INTO url_history (user_id, spotify_url, content_type, collection_name, image_url, track_data) VALUES (%s, %s, %s, %s, %s, %s)',
                  (current_user.id, url, 'track', f'{artist} - {title}', image_url, track_data))
        conn.close()

    sse_broadcast(current_user.id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'pending'})
    download_executor.submit(bounded_download, run_download_progress, download_id, url, current_user.id, title, artist, image_url)

    return jsonify({'ok': True, 'download_id': download_id, 'message': f'Downloading: {artist} - {title}'})

@app.route('/api/download/batch', methods=['POST'])
@login_required
@validate_csrf
@limiter.limit("10/minute")
def api_download_batch():
    data = request.get_json(silent=True) or {}
    tracks = data.get('tracks', [])
    collection_name = data.get('collection_name', 'Download')[:100]
    content_type = data.get('content_type', 'album')
    from_history = data.get('from_history', False)

    if not tracks:
        return jsonify({'error': 'No tracks selected.'}), 400

    app_config = load_app_config()
    batch_limit = app_config.get('batch_limit', 500)
    if len(tracks) > batch_limit:
        return jsonify({'error': f'Maximum {batch_limit} tracks per batch.'}), 400

    batch_id = secrets.token_hex(8)
    batch_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(current_user.id), f'batch_{batch_id}')
    os.makedirs(batch_dir, exist_ok=True)

    if not from_history and tracks:
        conn = get_db()
        c = conn.cursor()
        c.execute('INSERT INTO url_history (user_id, spotify_url, content_type, collection_name, image_url, track_data, batch_id) VALUES (%s, %s, %s, %s, %s, %s, %s)',
                  (current_user.id, tracks[0].get('url', ''), content_type, collection_name, tracks[0].get('image_url', ''), json.dumps(tracks), batch_id))
        conn.close()

    download_ids = []
    for t in tracks:
        t_id = t.get('id', '')
        t_title = t.get('title', t.get('name', f'Track {t_id}'))
        t_artist = t.get('artist', 'Unknown')
        t_image = t.get('image_url', '')
        t_url = t.get('url', f'https://open.spotify.com/track/{t_id}')

        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('INSERT INTO downloads (user_id, spotify_url, title, artist, image_url, status) VALUES (%s, %s, %s, %s, %s, %s)',
                  (current_user.id, t_url, t_title[:255], t_artist[:255], t_image[:1024], 'pending'))
        did = c.lastrowid
        conn.close()
        download_ids.append(did)
        sse_broadcast(current_user.id, 'download_update', {'id': did, 'title': t_title, 'artist': t_artist, 'status': 'pending'})

        download_executor.submit(bounded_download, run_batch_download_progress, did, t_url, current_user.id, t_title, t_artist, t_image, batch_id)

    return jsonify({'ok': True, 'batch_id': batch_id, 'count': len(tracks), 'message': f'Batch downloading {len(tracks)} tracks...'})

@app.route('/api/downloads')
@login_required
def api_downloads():
    page = request.args.get('page', 1, type=int)
    per_page = 20
    offset = (page - 1) * per_page
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT id, spotify_url, title, artist, image_url, filename, status, message, created_at FROM downloads WHERE user_id = %s ORDER BY created_at DESC LIMIT %s OFFSET %s',
              (current_user.id, per_page + 1, offset))
    rows = c.fetchall()
    conn.close()
    has_more = len(rows) > per_page
    return jsonify({'downloads': rows[:per_page], 'has_more': has_more, 'page': page})

@app.route('/api/download/file/<int:download_id>')
@login_required
def api_download_file(download_id):
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT id, filename, status, user_id FROM downloads WHERE id = %s AND user_id = %s', (download_id, current_user.id))
    d = c.fetchone()
    conn.close()
    if not d or d['status'] != 'completed' or not d['filename']:
        return jsonify({'error': 'File not available'}), 404

    user_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(current_user.id))
    filename = sanitize_filename(d['filename'])
    if not filename:
        return jsonify({'error': 'Invalid file'}), 400

    real_user_dir = os.path.realpath(user_dir)
    filepath = os.path.join(user_dir, filename)
    if os.path.exists(filepath) and os.path.realpath(filepath).startswith(real_user_dir):
        return send_from_directory(user_dir, filename, as_attachment=True)

    if os.path.isdir(user_dir):
        for entry in os.listdir(user_dir):
            batch_path = os.path.join(user_dir, entry)
            if os.path.isdir(batch_path) and entry.startswith('batch_'):
                candidate = os.path.join(batch_path, filename)
                if os.path.exists(candidate) and os.path.realpath(candidate).startswith(real_user_dir):
                    return send_from_directory(batch_path, filename, as_attachment=True)

    return jsonify({'error': 'File not found'}), 404

@app.route('/api/delete/<int:download_id>', methods=['POST'])
@login_required
@validate_csrf
def api_delete_download(download_id):
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT id, filename, user_id FROM downloads WHERE id = %s AND user_id = %s', (download_id, current_user.id))
    d = c.fetchone()
    if d and d['filename']:
        user_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(current_user.id))
        safe_name = sanitize_filename(d['filename'])
        if safe_name:
            for root, dirs, files in os.walk(user_dir):
                if safe_name in files:
                    os.remove(os.path.join(root, safe_name))
                    break
    if d:
        c.execute('DELETE FROM downloads WHERE id = %s', (download_id,))
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/history')
@login_required
def api_history():
    page = request.args.get('page', 1, type=int)
    per_page = 20
    offset = (page - 1) * per_page
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT id, spotify_url, content_type, collection_name, image_url, batch_id, created_at FROM url_history WHERE user_id = %s ORDER BY created_at DESC LIMIT %s OFFSET %s',
              (current_user.id, per_page + 1, offset))
    rows = c.fetchall()
    conn.close()
    has_more = len(rows) > per_page
    return jsonify({'items': rows[:per_page], 'has_more': has_more, 'page': page})

@app.route('/api/history/<int:history_id>')
@login_required
def api_history_detail(history_id):
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT id, spotify_url, content_type, collection_name, image_url, track_data, batch_id, created_at FROM url_history WHERE id = %s AND user_id = %s',
              (history_id, current_user.id))
    item = c.fetchone()
    conn.close()
    if not item:
        return jsonify({'error': 'Not found'}), 404

    tracks = []
    if item['track_data']:
        try:
            tracks = json.loads(item['track_data']) if isinstance(item['track_data'], str) else item['track_data']
        except: tracks = []

    zip_available = False
    if item['batch_id']:
        batch_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(current_user.id), f'batch_{item["batch_id"]}')
        if os.path.isdir(batch_dir):
            zip_available = any(f.endswith('.mp3') for f in os.listdir(batch_dir))

    track_urls = [t.get('url', '') for t in tracks]
    status_map = {}
    if track_urls:
        conn = get_db()
        c = conn.cursor(dictionary=True)
        placeholders = ','.join(['%s'] * len(track_urls))
        c.execute(f'SELECT spotify_url, status, filename, id FROM downloads WHERE user_id = %s AND spotify_url IN ({placeholders})',
                  [current_user.id] + track_urls)
        status_map = {row['spotify_url']: row for row in c.fetchall()}
        conn.close()

    for t in tracks:
        st = status_map.get(t.get('url', ''), {})
        t['dl_status'] = st.get('status', '')
        t['dl_filename'] = st.get('filename', '')
        t['dl_id'] = st.get('id', '')

    return jsonify({'item': item, 'tracks': tracks, 'zip_available': zip_available})

@app.route('/api/admin/users')
@login_required
def api_admin_users():
    if not is_admin_user(): return jsonify({'error': 'Forbidden'}), 403
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT id, username, role, is_approved, created_at FROM users ORDER BY created_at DESC')
    users = c.fetchall()
    conn.close()
    for u in users:
        if u.get('created_at'):
            u['created_at'] = u['created_at'].isoformat()
    return jsonify({'users': users})

@app.route('/api/admin/users/<action>/<int:user_id>', methods=['POST'])
@login_required
@validate_csrf
def api_admin_user_action(action, user_id):
    if not is_admin_user(): return jsonify({'error': 'Forbidden'}), 403
    if user_id == current_user.id and action in ('delete', 'demote', 'revoke'):
        return jsonify({'error': 'Cannot perform this action on yourself'}), 400
    conn = get_db()
    c = conn.cursor()
    if action == 'approve':
        c.execute('UPDATE users SET is_approved = 1 WHERE id = %s', (user_id,))
    elif action == 'revoke':
        c.execute('UPDATE users SET is_approved = 0 WHERE id = %s', (user_id,))
    elif action == 'promote':
        c.execute("UPDATE users SET role = 'admin' WHERE id = %s", (user_id,))
    elif action == 'demote':
        c.execute("UPDATE users SET role = 'user' WHERE id = %s", (user_id,))
    elif action == 'delete':
        c.execute('DELETE FROM downloads WHERE user_id = %s', (user_id,))
        c.execute('DELETE FROM users WHERE id = %s', (user_id,))
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/admin/settings', methods=['GET', 'POST'])
@login_required
def api_admin_settings():
    if not is_admin_user(): return jsonify({'error': 'Forbidden'}), 403
    if request.method == 'POST':
        if not validate_csrf_request():
            return jsonify({'error': 'CSRF token missing'}), 403
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        app_config = load_app_config()
        try:
            app_config['batch_limit'] = max(1, min(500, int(data.get('batch_limit', app_config['batch_limit']))))
            app_config['max_concurrent_downloads'] = max(1, min(20, int(data.get('max_concurrent_downloads', app_config['max_concurrent_downloads']))))
        except (ValueError, TypeError):
            pass
        app_config['require_approval'] = bool(data.get('require_approval', app_config.get('require_approval', True)))
        if 'audio_format' in data:
            app_config['audio_format'] = data['audio_format']
        if 'bitrate' in data:
            app_config['bitrate'] = data['bitrate']
        save_app_config(app_config)
        return jsonify({'ok': True, 'config': app_config})
    return jsonify({'config': load_app_config()})

@app.route('/api/settings', methods=['POST'])
@login_required
@validate_csrf
def api_user_settings():
    data = request.get_json(silent=True) or {}
    action = data.get('action')
    if action == 'update_username':
        new_username = sanitize_username(data.get('new_username', '').strip())
        if len(new_username) < 3:
            return jsonify({'error': 'Username must be at least 3 characters.'}), 400
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT id FROM users WHERE username = %s AND id != %s', (new_username, current_user.id))
        if c.fetchone():
            conn.close()
            return jsonify({'error': 'Username already taken.'}), 409
        c.execute('UPDATE users SET username = %s WHERE id = %s', (new_username, current_user.id))
        conn.close()
        current_user.username = new_username
        return jsonify({'ok': True})
    elif action == 'update_password':
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        if len(new_password) < 6:
            return jsonify({'error': 'New password must be at least 6 characters.'}), 400
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT password FROM users WHERE id = %s', (current_user.id,))
        user = c.fetchone()
        if not user or not check_password(current_password, user['password']):
            conn.close()
            return jsonify({'error': 'Current password is incorrect.'}), 400
        hashed = hash_password(new_password)
        c.execute('UPDATE users SET password = %s WHERE id = %s', (hashed, current_user.id))
        conn.close()
        return jsonify({'ok': True})
    return jsonify({'error': 'Invalid action'}), 400

# Wrapper functions that broadcast SSE events
def run_download_progress(download_id, spotify_url, user_id, title, artist, image_url):
    sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'processing'})
    run_download(download_id, spotify_url, user_id, title, artist, image_url)
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT status, filename FROM downloads WHERE id = %s', (download_id,))
    row = c.fetchone()
    conn.close()
    if row and row['status'] == 'completed':
        sse_broadcast(user_id, 'download_complete', {'id': download_id, 'title': title, 'artist': artist, 'status': 'completed', 'filename': row['filename']})
    elif row and row['status'] == 'failed':
        sse_broadcast(user_id, 'download_failed', {'id': download_id, 'title': title, 'artist': artist, 'status': 'failed'})

def run_batch_download_progress(download_id, spotify_url, user_id, title, artist, image_url, batch_id):
    run_batch_download(download_id, spotify_url, user_id, title, artist, image_url, batch_id)
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT status FROM downloads WHERE id = %s', (download_id,))
    row = c.fetchone()
    conn.close()
    if row and row['status'] == 'completed':
        sse_broadcast(user_id, 'download_complete', {'id': download_id, 'title': title, 'artist': artist, 'status': 'completed'})
    elif row and row['status'] == 'failed':
        sse_broadcast(user_id, 'download_failed', {'id': download_id, 'title': title, 'artist': artist, 'status': 'failed'})

# ──────────────────────────────────────────────
# Error Handlers
# ──────────────────────────────────────────────

@app.errorhandler(403)
def forbidden(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Forbidden'}), 403
    return render_template('error.html', code=403, message='Forbidden'), 403

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Not found'}), 404
    return render_template('error.html', code=404, message='Not Found'), 404

@app.errorhandler(429)
def rate_limited(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Too many requests. Please slow down.'}), 429
    return render_template('error.html', code=429, message='Too many requests. Please slow down.'), 429

@app.errorhandler(500)
def server_error(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Internal server error'}), 500
    return render_template('error.html', code=500, message='Internal Server Error'), 500

# ──────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    app.run(host='127.0.0.1', port=5000, debug=False)
