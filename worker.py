import os
import sys
import json
import secrets
import zipfile
import subprocess
import requests
from datetime import datetime

sys.path.insert(0, '/opt/spotdl-web')

os.environ.setdefault('FLASK_KEY', 'key')

from app import create_app
from app.models import get_db
from app.sse import sse_broadcast
from app.config import (
    YTDLP_BIN, FFMPEG_BIN, DOWNLOAD_FOLDER, load_app_config
)
from app.utils import sanitize_filename
from app.spotify import fetch_spotify_metadata

flask_app = create_app()


def rq_run_download(download_id, spotify_url, user_id, title, artist, image_url, audio_format=None, bitrate=None):
    with flask_app.app_context():
        sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'processing'})
        _do_download(download_id, spotify_url, user_id, title, artist, image_url, audio_format, bitrate)
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT status, filename FROM downloads WHERE id = %s', (download_id,))
        row = c.fetchone()
        conn.close()
        if row and row['status'] == 'completed':
            sse_broadcast(user_id, 'download_complete', {'id': download_id, 'title': title, 'artist': artist, 'status': 'completed', 'filename': row['filename']})
        elif row and row['status'] == 'failed':
            sse_broadcast(user_id, 'download_failed', {'id': download_id, 'title': title, 'artist': artist, 'status': 'failed'})


def rq_run_batch_download(download_id, spotify_url, user_id, title, artist, image_url, batch_id, audio_format=None, bitrate=None):
    with flask_app.app_context():
        _do_batch_download(download_id, spotify_url, user_id, title, artist, image_url, batch_id, audio_format, bitrate)
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT status FROM downloads WHERE id = %s', (download_id,))
        row = c.fetchone()
        conn.close()
        if row and row['status'] == 'completed':
            sse_broadcast(user_id, 'download_complete', {'id': download_id, 'title': title, 'artist': artist, 'status': 'completed'})
        elif row and row['status'] == 'failed':
            sse_broadcast(user_id, 'download_failed', {'id': download_id, 'title': title, 'artist': artist, 'status': 'failed'})


def _get_bitrate_args(bitrate):
    if bitrate == 'disable':
        return ['--bitrate', 'disable']
    elif bitrate == 'auto':
        return ['--bitrate', 'auto']
    else:
        return ['--audio-quality', bitrate.replace('k', '')]


def _do_download(download_id, spotify_url, user_id, title, artist, image_url, audio_format=None, bitrate=None):
    if not audio_format or not bitrate:
        cfg = load_app_config()
        audio_format = audio_format or cfg.get('audio_format', 'mp3')
        bitrate = bitrate or cfg.get('bitrate', '128k')

    output_dir = os.path.join(DOWNLOAD_FOLDER, str(user_id))
    os.makedirs(output_dir, exist_ok=True)

    safe_name = f'{sanitize_filename(artist)} - {sanitize_filename(title)}'
    output_template = os.path.join(output_dir, f'{safe_name}.%(ext)s')
    bitrate_args = _get_bitrate_args(bitrate)

    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s WHERE id = %s', ('processing', download_id))
    conn.close()
    sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'processing'})

    # Strategy 1: YouTube with multiple search variations
    clients = ['web_creator', 'ios', 'mweb', 'tv']
    search_queries = [
        f'ytsearch1:{artist} - {title}',
        f'ytsearch1:{artist} {title}',
        f'ytsearch1:{title} {artist}',
    ]
    for query in search_queries:
        for client in clients:
            try:
                sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'YouTube'})
                cmd = [
                    YTDLP_BIN,
                    query,
                    '--extract-audio', '--audio-format', audio_format,
                    *bitrate_args,
                    '--output', output_template, '--no-playlist', '--no-overwrites',
                    '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
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
            except Exception:
                continue

    # Strategy 2: SoundCloud
    sc_queries = [
        f'scsearch1:{artist} - {title}',
        f'scsearch1:{title} {artist}',
    ]
    for sc_query in sc_queries:
        try:
            sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'SoundCloud'})
            sc_template = os.path.join(output_dir, f'{safe_name}.%(ext)s')
            cmd = [
                YTDLP_BIN, sc_query,
                '--extract-audio', '--audio-format', audio_format,
                *bitrate_args,
                '--output', sc_template, '--no-playlist',
                '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
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

    # Strategy 3: Spotify preview
    metadata = fetch_spotify_metadata(spotify_url)
    if metadata and metadata.get('preview_url'):
        try:
            sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'Spotify Preview'})
            preview_path = os.path.join(output_dir, f'{safe_name}.{audio_format}')
            r = requests.get(metadata['preview_url'], timeout=15)
            if r.status_code == 200 and len(r.content) > 10000:
                with open(preview_path, 'wb') as f:
                    f.write(r.content)
                conn = get_db()
                c = conn.cursor()
                c.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                          ('completed', f'{safe_name}.{audio_format}', 'Spotify preview only (30s) - full track unavailable.', download_id))
                conn.close()
                return
        except Exception:
            pass

    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s, message = %s WHERE id = %s',
              ('failed', 'Download failed.', download_id))
    conn.close()


def _do_batch_download(download_id, spotify_url, user_id, title, artist, image_url, batch_id, audio_format=None, bitrate=None):
    if not audio_format or not bitrate:
        cfg = load_app_config()
        audio_format = audio_format or cfg.get('audio_format', 'mp3')
        bitrate = bitrate or cfg.get('bitrate', '128k')

    batch_dir = os.path.join(DOWNLOAD_FOLDER, str(user_id), f'batch_{batch_id}')
    os.makedirs(batch_dir, exist_ok=True)

    safe_name = f'{sanitize_filename(artist)} - {sanitize_filename(title)}'
    output_template = os.path.join(batch_dir, f'{safe_name}.%(ext)s')
    final_output = os.path.join(batch_dir, f'{safe_name}.{audio_format}')
    bitrate_args = _get_bitrate_args(bitrate)

    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s WHERE id = %s', ('processing', download_id))
    conn.close()

    # Strategy 1: YouTube with multiple search variations
    clients = ['web_creator', 'ios', 'mweb', 'tv']
    search_queries = [
        f'ytsearch1:{artist} - {title}',
        f'ytsearch1:{artist} {title}',
        f'ytsearch1:{title} {artist}',
    ]
    for query in search_queries:
        for client in clients:
            try:
                sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'YouTube'})
                cmd = [
                    YTDLP_BIN,
                    query,
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
    sc_queries = [
        f'scsearch1:{artist} - {title}',
        f'scsearch1:{title} {artist}',
    ]
    for sc_query in sc_queries:
        try:
            sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'SoundCloud'})
            cmd = [
                YTDLP_BIN, sc_query,
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
            sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'Spotify Preview'})
            r = requests.get(metadata['preview_url'], timeout=15)
            if r.status_code == 200 and len(r.content) > 10000:
                with open(final_output, 'wb') as f:
                    f.write(r.content)
                conn = get_db()
                c = conn.cursor()
                c.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                          ('completed', f'{safe_name}.{audio_format}', 'Spotify preview only (30s) - full track unavailable.', download_id))
                conn.close()
                return
        except Exception:
            pass

    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s, message = %s WHERE id = %s',
              ('failed', 'Download failed.', download_id))
    conn.close()
