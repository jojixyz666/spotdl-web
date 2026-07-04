import os
import json
import secrets
from datetime import timedelta

SECRET_KEY = os.environ.get('SECRET_KEY', secrets.token_hex(32))
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
HTTPS_ENABLED = os.environ.get('HTTPS_ENABLED', '0') == '1'

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

ADMIN_USER = os.environ.get('ADMIN_USER', 'admin')
ADMIN_PASS = os.environ.get('ADMIN_PASS', 'admin123')

SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID', '')
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', '')

BASE_DIR = '/opt/spotdl-web'
DOWNLOAD_FOLDER = os.path.join(BASE_DIR, 'downloads')
YTDLP_BIN = os.path.join(BASE_DIR, 'bin', 'yt-dlp')
FFMPEG_BIN = '/usr/bin/ffmpeg'
APP_CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')

DEFAULT_APP_CONFIG = {
    'batch_limit': 500,
    'max_concurrent_downloads': 5,
    'require_approval': True,
    'audio_format': 'mp3',
    'bitrate': '128k',
}

BITRATE_MAP = {
    '8k': 8, '16k': 16, '24k': 24, '32k': 32, '40k': 40, '48k': 48,
    '64k': 64, '80k': 80, '96k': 96, '112k': 112, '128k': 128,
    '160k': 160, '192k': 192, '224k': 224, '256k': 256, '320k': 320,
}

FORMAT_BITRATE_DEFAULTS = {
    'mp3': 128, 'm4a': 128, 'ogg': 96, 'opus': 96, 'flac': 800, 'wav': 1411,
}

SESSION_LIFETIME = timedelta(hours=2)


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
