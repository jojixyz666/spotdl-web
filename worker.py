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

COOKIE_FILE = '/opt/spotdl-web/cookies.txt'
USE_COOKIES = os.path.isfile(COOKIE_FILE)

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


def _sc_search_best(artist, title, ytdlp_bin, timeout=30):
    """Search SoundCloud for best full track (not preview, not live/remix). Returns URL or None."""
    hard_skip = ['live', 'remix', 'cover', 'karaoke', 'acoustic', 'unplugged',
                 'instrumental', 'session', 'rehearsal', 'bootleg', 'demo']
    soft_skip = ['slowed', 'sped', 'nightcore', 'raw', 'alternate version']
    queries = [
        f'scsearch10:{artist} - {title}',
        f'scsearch10:{title} {artist}',
        f'scsearch10:{title}',
    ]
    for query in queries:
        try:
            cmd = [
                ytdlp_bin, query,
                '--flat-playlist', '--print', '%(url)s %(duration)s %(title)s',
                '--no-warnings', '--quiet',
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            if result.returncode != 0:
                continue
            studio = []
            modified = []
            all_valid = []
            for line in result.stdout.strip().split('\n'):
                if not line.strip():
                    continue
                parts = line.rsplit(' ', 2)
                if len(parts) >= 3:
                    url, dur_str = parts[0], parts[1]
                    track_title = parts[2].lower()
                    try:
                        dur = float(dur_str)
                    except ValueError:
                        continue
                    if dur <= 35:
                        continue
                    is_hard = any(w in track_title for w in hard_skip)
                    is_soft = any(w in track_title for w in soft_skip)
                    all_valid.append((url, dur, is_hard, is_soft))
                    if not is_hard and not is_soft:
                        studio.append((url, dur))
                    elif not is_hard:
                        modified.append((url, dur))
            # Priority: studio > modified > any
            if studio:
                studio.sort(key=lambda x: x[1], reverse=True)
                return studio[0][0]
            if modified:
                modified.sort(key=lambda x: x[1], reverse=True)
                return modified[0][0]
            if all_valid:
                all_valid.sort(key=lambda x: x[1], reverse=True)
                return all_valid[0][0]
        except Exception:
            continue
    return None


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

    def _is_cancelled():
        conn = get_db()
        c2 = conn.cursor(dictionary=True)
        c2.execute('SELECT status FROM downloads WHERE id = %s', (download_id,))
        row = c2.fetchone()
        conn.close()
        return row and row['status'] == 'cancelled'

    # ── Check if file already exists on disk (global cache) ──
    from app.downloads import _find_file_in_dir, _find_file_globally, _is_preview_file
    existing = _find_file_in_dir(output_dir, safe_name, audio_format)
    if not existing:
        # Search across all user batches
        found_name, found_dir = _find_file_globally(user_id, safe_name, audio_format)
        if found_name and found_dir and found_dir != output_dir:
            import shutil
            src = os.path.join(found_dir, found_name)
            dst = os.path.join(output_dir, safe_name + '.' + audio_format)
            shutil.copy2(src, dst)
            existing = safe_name + '.' + audio_format
            is_short, duration = _is_preview_file(dst)
            if not is_short:
                conn = get_db()
                c3 = conn.cursor()
                c3.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                           ('completed', existing, f'Copied from cache ({int(duration)}s).', download_id))
                conn.close()
                return
            else:
                os.remove(dst)
    if existing:
        is_short, duration = _is_preview_file(os.path.join(output_dir, existing))
        if not is_short:
            conn = get_db()
            c3 = conn.cursor()
            c3.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                       ('completed', existing, f'File already exists ({int(duration)}s).', download_id))
            conn.close()
            return
        else:
            os.remove(os.path.join(output_dir, existing))

    # ── Strategy 1: SoundCloud (smart search - pick longest full track) ──
    sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'SoundCloud'})
    sc_url = _sc_search_best(artist, title, YTDLP_BIN)
    if sc_url and not _is_cancelled():
        try:
            cmd = [
                YTDLP_BIN, sc_url,
                '--extract-audio', '--audio-format', audio_format,
                *bitrate_args,
                '--output', output_template, '--no-playlist',
                '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
                '--retries', '3',
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                found = _find_file_in_dir(output_dir, safe_name, audio_format)
                if found:
                    fpath = os.path.join(output_dir, found)
                    is_short, duration = _is_preview_file(fpath)
                    if not is_short:
                        conn = get_db()
                        c4 = conn.cursor()
                        c4.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                                   ('completed', found, f'Downloaded from SoundCloud ({int(duration)}s).', download_id))
                        conn.close()
                        return
                    else:
                        os.remove(fpath)
        except Exception:
            pass

    # ── Strategy 2: YouTube with cookies (fast & reliable) ──
    if USE_COOKIES:
        yt_queries = [
            f'ytsearch3:{artist} - {title}',
            f'ytsearch3:{artist} {title}',
            f'ytsearch3:{title} {artist}',
            f'ytsearch3:{title}',
        ]
        for query in yt_queries:
            if _is_cancelled():
                return
            try:
                sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'YouTube'})
                cmd = [
                    YTDLP_BIN, query,
                    '--extract-audio', '--audio-format', audio_format,
                    *bitrate_args,
                    '--output', output_template, '--no-playlist', '--no-overwrites',
                    '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
                    '--cookies', COOKIE_FILE,
                    '--retries', '3',
                ]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
                if result.returncode == 0:
                    found = _find_file_in_dir(output_dir, safe_name, audio_format)
                    if found:
                        fpath = os.path.join(output_dir, found)
                        is_short, duration = _is_preview_file(fpath)
                        if not is_short:
                            conn = get_db()
                            c6 = conn.cursor()
                            c6.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                                       ('completed', found, f'Downloaded from YouTube ({int(duration)}s).', download_id))
                            conn.close()
                            return
                        else:
                            os.remove(fpath)
            except Exception:
                continue

    # ── Strategy 3: SoundCloud fallback ──
    sc_queries = [
        f'scsearch3:{artist} - {title}',
        f'scsearch3:{title} {artist}',
        f'scsearch3:{title}',
    ]
    for sc_query in sc_queries:
        if _is_cancelled():
            return
        try:
            sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'SoundCloud'})
            sc_template = os.path.join(output_dir, f'{safe_name}.%(ext)s')
            cmd = [
                YTDLP_BIN, sc_query,
                '--extract-audio', '--audio-format', audio_format,
                *bitrate_args,
                '--output', sc_template, '--no-playlist',
                '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
                '--retries', '3',
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                found = _find_file_in_dir(output_dir, safe_name, audio_format)
                if found:
                    fpath = os.path.join(output_dir, found)
                    is_short, duration = _is_preview_file(fpath)
                    if not is_short:
                        conn = get_db()
                        c5 = conn.cursor()
                        c5.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                                   ('completed', found, f'Downloaded from SoundCloud ({int(duration)}s).', download_id))
                        conn.close()
                        return
                    else:
                        os.remove(fpath)
        except Exception:
            continue

    # ── Strategy 4: Spotify preview (last resort) ──
    if _is_cancelled():
        return
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
                c7 = conn.cursor()
                c7.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                           ('completed', f'{safe_name}.{audio_format}', 'Spotify preview only (30s) - full track unavailable.', download_id))
                conn.close()
                return
        except Exception:
            pass

    if _is_cancelled():
        return

    conn = get_db()
    c8 = conn.cursor()
    c8.execute('UPDATE downloads SET status = %s, message = %s WHERE id = %s',
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

    def _is_cancelled():
        conn = get_db()
        c2 = conn.cursor(dictionary=True)
        c2.execute('SELECT status FROM downloads WHERE id = %s', (download_id,))
        row = c2.fetchone()
        conn.close()
        return row and row['status'] == 'cancelled'

    # ── Check if file already exists on disk (global cache) ──
    from app.downloads import _find_file_in_dir, _find_file_globally, _is_preview_file
    existing = _find_file_in_dir(batch_dir, safe_name, audio_format)
    if not existing:
        # Search across all user batches and root directory
        found_name, found_dir = _find_file_globally(user_id, safe_name, audio_format, exclude_batch=batch_id)
        if found_name and found_dir and found_dir != batch_dir:
            # Copy from cache to current batch
            import shutil
            src = os.path.join(found_dir, found_name)
            dst = os.path.join(batch_dir, safe_name + '.' + audio_format)
            shutil.copy2(src, dst)
            existing = safe_name + '.' + audio_format
            is_short, duration = _is_preview_file(dst)
            if not is_short:
                conn = get_db()
                c3 = conn.cursor()
                c3.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                           ('completed', existing, f'Copied from cache ({int(duration)}s).', download_id))
                conn.close()
                return
            else:
                os.remove(dst)
    if existing:
        is_short, duration = _is_preview_file(os.path.join(batch_dir, existing))
        if not is_short:
            conn = get_db()
            c3 = conn.cursor()
            c3.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                       ('completed', existing, f'File already exists ({int(duration)}s).', download_id))
            conn.close()
            return
        else:
            os.remove(os.path.join(batch_dir, existing))

    # ── Strategy 1: SoundCloud (smart search - pick longest full track) ──
    sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'SoundCloud'})
    sc_url = _sc_search_best(artist, title, YTDLP_BIN)
    if sc_url and not _is_cancelled():
        try:
            cmd = [
                YTDLP_BIN, sc_url,
                '--extract-audio', '--audio-format', audio_format,
                *bitrate_args,
                '--output', output_template, '--no-playlist',
                '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
                '--retries', '3',
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                found = _find_file_in_dir(batch_dir, safe_name, audio_format)
                if found:
                    fpath = os.path.join(batch_dir, found)
                    is_short, duration = _is_preview_file(fpath)
                    if not is_short:
                        conn = get_db()
                        c4 = conn.cursor()
                        c4.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                                   ('completed', found, f'Downloaded from SoundCloud ({int(duration)}s).', download_id))
                        conn.close()
                        return
                    else:
                        os.remove(fpath)
        except Exception:
            pass

    # ── Strategy 2: YouTube with cookies (fast & reliable) ──
    if USE_COOKIES:
        yt_queries = [
            f'ytsearch3:{artist} - {title}',
            f'ytsearch3:{artist} {title}',
            f'ytsearch3:{title} {artist}',
            f'ytsearch3:{title}',
        ]
        for query in yt_queries:
            if _is_cancelled():
                return
            try:
                sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'YouTube'})
                cmd = [
                    YTDLP_BIN, query,
                    '--extract-audio', '--audio-format', audio_format,
                    *bitrate_args,
                    '--output', output_template, '--no-playlist', '--no-overwrites',
                    '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
                    '--cookies', COOKIE_FILE,
                    '--retries', '3',
                ]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
                if result.returncode == 0:
                    found = _find_file_in_dir(batch_dir, safe_name, audio_format)
                    if found:
                        fpath = os.path.join(batch_dir, found)
                        is_short, duration = _is_preview_file(fpath)
                        if not is_short:
                            conn = get_db()
                            c6 = conn.cursor()
                            c6.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                                       ('completed', found, f'Downloaded from YouTube ({int(duration)}s).', download_id))
                            conn.close()
                            return
                        else:
                            os.remove(fpath)
            except Exception:
                continue

    # ── Strategy 3: SoundCloud fallback ──
    sc_queries = [
        f'scsearch3:{artist} - {title}',
        f'scsearch3:{title} {artist}',
        f'scsearch3:{title}',
    ]
    for sc_query in sc_queries:
        if _is_cancelled():
            return
        try:
            sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'SoundCloud'})
            sc_template = os.path.join(batch_dir, f'{safe_name}.%(ext)s')
            cmd = [
                YTDLP_BIN, sc_query,
                '--extract-audio', '--audio-format', audio_format,
                *bitrate_args,
                '--output', sc_template, '--no-playlist',
                '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
                '--retries', '3',
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                found = _find_file_in_dir(batch_dir, safe_name, audio_format)
                if found:
                    fpath = os.path.join(batch_dir, found)
                    is_short, duration = _is_preview_file(fpath)
                    if not is_short:
                        conn = get_db()
                        c5 = conn.cursor()
                        c5.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                                   ('completed', found, f'Downloaded from SoundCloud ({int(duration)}s).', download_id))
                        conn.close()
                        return
                    else:
                        os.remove(fpath)
        except Exception:
            continue

    # ── Strategy 4: Spotify preview (last resort) ──
    if _is_cancelled():
        return
    metadata = fetch_spotify_metadata(spotify_url)
    if metadata and metadata.get('preview_url'):
        try:
            sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'Spotify Preview'})
            r = requests.get(metadata['preview_url'], timeout=15)
            if r.status_code == 200 and len(r.content) > 10000:
                with open(final_output, 'wb') as f:
                    f.write(r.content)
                conn = get_db()
                c7 = conn.cursor()
                c7.execute('UPDATE downloads SET status = %s, filename = %s, message = %s WHERE id = %s',
                           ('completed', f'{safe_name}.{audio_format}', 'Spotify preview only (30s) - full track unavailable.', download_id))
                conn.close()
                return
        except Exception:
            pass

    if _is_cancelled():
        return

    conn = get_db()
    c8 = conn.cursor()
    c8.execute('UPDATE downloads SET status = %s, message = %s WHERE id = %s',
               ('failed', 'Download failed.', download_id))
    conn.close()
