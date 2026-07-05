import os
import re
import json
import secrets
import zipfile
import io
import subprocess
import threading
import requests
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from flask import request, jsonify, send_from_directory, send_file, abort, current_app
from flask_login import login_required, current_user
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from app.config import (
    YTDLP_BIN, FFMPEG_BIN, DOWNLOAD_FOLDER, load_app_config
)
from app.models import get_db
from app.utils import sanitize_filename
from app.spotify import parse_spotify_url, fetch_spotify_metadata
from app.sse import sse_broadcast
from app.cache import download_queue
from app.csrf import validate_csrf

# ──────────────────────────────────────────────
# Thread pool & semaphore
# ──────────────────────────────────────────────

download_executor = ThreadPoolExecutor(max_workers=10)
download_semaphore = threading.Semaphore(5)

# Track active subprocesses for cancellation
active_processes = {}
active_processes_lock = threading.Lock()


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
# Core download logic
# ──────────────────────────────────────────────

def run_download(download_id, spotify_url, user_id, title, artist, image_url, audio_format=None, bitrate=None):
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s WHERE id = %s', ('processing', download_id))
    conn.close()

    if not audio_format or not bitrate:
        cfg = load_app_config()
        audio_format = audio_format or cfg.get('audio_format', 'mp3')
        bitrate = bitrate or cfg.get('bitrate', '128k')

    output_dir = os.path.join(DOWNLOAD_FOLDER, str(user_id))
    os.makedirs(output_dir, exist_ok=True)

    safe_name = f'{sanitize_filename(artist)} - {sanitize_filename(title)}'
    output_template = os.path.join(output_dir, f'{safe_name}.%(ext)s')

    bitrate_args = _get_bitrate_args(bitrate)

    def _is_cancelled():
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT status FROM downloads WHERE id = %s', (download_id,))
        row = c.fetchone()
        conn.close()
        return row and row['status'] == 'cancelled'

    def _run_cmd(cmd, timeout):
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        with active_processes_lock:
            active_processes[download_id] = proc
        try:
            result = proc.communicate(timeout=timeout)
            return subprocess.CompletedProcess(cmd, proc.returncode, result[0], result[1])
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            raise
        finally:
            with active_processes_lock:
                active_processes.pop(download_id, None)

    # Strategy 1: YouTube with multiple player clients and search variations
    clients = ['web_creator', 'ios', 'mweb', 'tv']
    search_queries = [
        f'ytsearch1:{artist} - {title}',
        f'ytsearch1:{artist} {title}',
        f'ytsearch1:{title} {artist}',
    ]
    for query in search_queries:
        if _is_cancelled():
            return
        for client in clients:
            if _is_cancelled():
                return
            try:
                cmd = [
                    YTDLP_BIN,
                    query,
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
                result = _run_cmd(cmd, 120)

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

    # Strategy 2: SoundCloud
    if _is_cancelled():
        return
    sc_queries = [
        f'scsearch1:{artist} - {title}',
        f'scsearch1:{title} {artist}',
    ]
    for sc_query in sc_queries:
        if _is_cancelled():
            return
        try:
            sc_template = os.path.join(output_dir, f'{safe_name}.%(ext)s')
            cmd = [
                YTDLP_BIN,
                sc_query,
                '--extract-audio',
                '--audio-format', audio_format,
                *bitrate_args,
                '--output', sc_template,
                '--no-playlist',
                '--ffmpeg-location', FFMPEG_BIN,
                '--quiet',
                '--no-warnings',
            ]
            result = _run_cmd(cmd, 60)
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

    # Strategy 3: Spotify preview fallback (30s preview)
    if _is_cancelled():
        return
    metadata = fetch_spotify_metadata(spotify_url)
    if metadata and metadata.get('preview_url'):
        try:
            preview_path = os.path.join(output_dir, f'{safe_name}.{audio_format}')
            r = requests.get(metadata['preview_url'], timeout=15)
            if r.status_code == 200 and len(r.content) > 10000:
                if _is_cancelled():
                    return
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

    if _is_cancelled():
        return

    # All failed
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s, message = %s WHERE id = %s',
              ('failed', 'Download failed. Try again later.', download_id))
    conn.close()


def run_batch_download(download_id, spotify_url, user_id, title, artist, image_url, batch_id, audio_format=None, bitrate=None):
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s WHERE id = %s', ('processing', download_id))
    conn.close()

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

    def _is_cancelled():
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT status FROM downloads WHERE id = %s', (download_id,))
        row = c.fetchone()
        conn.close()
        return row and row['status'] == 'cancelled'

    def _run_cmd(cmd, timeout):
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        with active_processes_lock:
            active_processes[download_id] = proc
        try:
            result = proc.communicate(timeout=timeout)
            return subprocess.CompletedProcess(cmd, proc.returncode, result[0], result[1])
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            raise
        finally:
            with active_processes_lock:
                active_processes.pop(download_id, None)

    # Strategy 1: YouTube with multiple search variations
    clients = ['web_creator', 'ios', 'mweb', 'tv']
    search_queries = [
        f'ytsearch1:{artist} - {title}',
        f'ytsearch1:{artist} {title}',
        f'ytsearch1:{title} {artist}',
    ]
    for query in search_queries:
        if _is_cancelled():
            return
        for client in clients:
            if _is_cancelled():
                return
            try:
                cmd = [
                    YTDLP_BIN,
                    query,
                    '--extract-audio', '--audio-format', audio_format,
                    *bitrate_args,
                    '--output', output_template, '--no-playlist', '--no-overwrites',
                    '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
                    '--extractor-args', f'youtube:player_client={client}',
                ]
                result = _run_cmd(cmd, 120)
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
    if _is_cancelled():
        return
    sc_queries = [
        f'scsearch1:{artist} - {title}',
        f'scsearch1:{title} {artist}',
    ]
    for sc_query in sc_queries:
        if _is_cancelled():
            return
        try:
            cmd = [
                YTDLP_BIN, sc_query,
                '--extract-audio', '--audio-format', audio_format,
                *bitrate_args,
                '--output', output_template, '--no-playlist',
                '--ffmpeg-location', FFMPEG_BIN, '--quiet', '--no-warnings',
            ]
            result = _run_cmd(cmd, 60)
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
    if _is_cancelled():
        return
    metadata = fetch_spotify_metadata(spotify_url)
    if metadata and metadata.get('preview_url'):
        try:
            r = requests.get(metadata['preview_url'], timeout=15)
            if r.status_code == 200 and len(r.content) > 10000:
                if _is_cancelled():
                    return
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

    if _is_cancelled():
        return

    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s, message = %s WHERE id = %s',
              ('failed', 'Download failed.', download_id))
    conn.close()


def run_download_progress(download_id, spotify_url, user_id, title, artist, image_url, audio_format=None, bitrate=None):
    sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'processing'})
    run_download(download_id, spotify_url, user_id, title, artist, image_url, audio_format, bitrate)
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT status, filename FROM downloads WHERE id = %s', (download_id,))
    row = c.fetchone()
    conn.close()
    if row and row['status'] == 'completed':
        sse_broadcast(user_id, 'download_complete', {'id': download_id, 'title': title, 'artist': artist, 'status': 'completed', 'filename': row['filename']})
    elif row and row['status'] == 'failed':
        sse_broadcast(user_id, 'download_failed', {'id': download_id, 'title': title, 'artist': artist, 'status': 'failed'})
    elif row and row['status'] == 'cancelled':
        sse_broadcast(user_id, 'download_cancelled', {'id': download_id, 'title': title, 'artist': artist, 'status': 'cancelled'})


def run_batch_download_progress(download_id, spotify_url, user_id, title, artist, image_url, batch_id, audio_format=None, bitrate=None):
    run_batch_download(download_id, spotify_url, user_id, title, artist, image_url, batch_id, audio_format, bitrate)
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT status FROM downloads WHERE id = %s', (download_id,))
    row = c.fetchone()
    conn.close()
    if row and row['status'] == 'completed':
        sse_broadcast(user_id, 'download_complete', {'id': download_id, 'title': title, 'artist': artist, 'status': 'completed'})
    elif row and row['status'] == 'failed':
        sse_broadcast(user_id, 'download_failed', {'id': download_id, 'title': title, 'artist': artist, 'status': 'failed'})
    elif row and row['status'] == 'cancelled':
        sse_broadcast(user_id, 'download_cancelled', {'id': download_id, 'title': title, 'artist': artist, 'status': 'cancelled'})


def _get_bitrate_args(bitrate):
    if bitrate == 'disable':
        return ['--bitrate', 'disable']
    elif bitrate == 'auto':
        return ['--bitrate', 'auto']
    else:
        return ['--audio-quality', bitrate.replace('k', '')]


def register_download_routes(app, limiter):

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
        audio_format = data.get('audio_format', 'mp3')
        bitrate = data.get('bitrate', '128k')

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
        if download_queue:
            from worker import rq_run_download
            download_queue.enqueue(rq_run_download, download_id, url, current_user.id, title, artist, image_url, audio_format, bitrate, job_timeout=600)
        else:
            download_executor.submit(bounded_download, run_download_progress, download_id, url, current_user.id, title, artist, image_url, audio_format, bitrate)

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
        audio_format = data.get('audio_format', 'mp3')
        bitrate = data.get('bitrate', '128k')

        if not tracks:
            return jsonify({'error': 'No tracks selected.'}), 400

        app_config = load_app_config()
        batch_limit = app_config.get('batch_limit', 500)
        if len(tracks) > batch_limit:
            return jsonify({'error': f'Maximum {batch_limit} tracks per batch.'}), 400

        batch_id = secrets.token_hex(8)
        batch_dir = os.path.join(DOWNLOAD_FOLDER, str(current_user.id), f'batch_{batch_id}')
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

            if download_queue:
                from worker import rq_run_batch_download
                download_queue.enqueue(rq_run_batch_download, did, t_url, current_user.id, t_title, t_artist, t_image, batch_id, audio_format, bitrate, job_timeout=600)
            else:
                download_executor.submit(bounded_download, run_batch_download_progress, did, t_url, current_user.id, t_title, t_artist, t_image, batch_id, audio_format, bitrate)

        return jsonify({'ok': True, 'batch_id': batch_id, 'count': len(tracks), 'message': f'Batch downloading {len(tracks)} tracks...'})

    @app.route('/api/downloads')
    @login_required
    def api_downloads():
        page = request.args.get('page', 1, type=int)
        per_page = 20
        offset = (page - 1) * per_page

        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT COUNT(*) as cnt FROM downloads WHERE user_id = %s', (current_user.id,))
        total = c.fetchone()['cnt']
        c.execute('SELECT * FROM downloads WHERE user_id = %s ORDER BY id DESC LIMIT %s OFFSET %s',
                  (current_user.id, per_page, offset))
        downloads = c.fetchall()
        conn.close()

        for d in downloads:
            if d.get('created_at'):
                d['created_at'] = d['created_at'].isoformat() if hasattr(d['created_at'], 'isoformat') else str(d['created_at'])

        return jsonify({
            'downloads': downloads,
            'total': total,
            'page': page,
            'has_more': offset + per_page < total,
        })

    @app.route('/api/download/file/<int:download_id>')
    @login_required
    def api_download_file(download_id):
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT id, filename, status, user_id FROM downloads WHERE id = %s AND user_id = %s',
                  (download_id, current_user.id))
        d = c.fetchone()
        conn.close()

        if not d or d['status'] != 'completed' or not d['filename']:
            abort(404)

        user_dir = os.path.join(DOWNLOAD_FOLDER, str(current_user.id))
        filename = sanitize_filename(d['filename'])
        if not filename:
            abort(404)

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

        abort(404)

    @app.route('/api/delete/<int:download_id>', methods=['POST'])
    @login_required
    @validate_csrf
    def api_delete_download(download_id):
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT id, filename, user_id FROM downloads WHERE id = %s AND user_id = %s',
                  (download_id, current_user.id))
        d = c.fetchone()
        if d and d['filename']:
            output_dir = os.path.join(DOWNLOAD_FOLDER, str(current_user.id))
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
        return jsonify({'ok': True})

    @app.route('/api/cancel/<int:download_id>', methods=['POST'])
    @login_required
    @validate_csrf
    def api_cancel_download(download_id):
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT id, status, title, artist, user_id FROM downloads WHERE id = %s AND user_id = %s',
                  (download_id, current_user.id))
        d = c.fetchone()
        conn.close()

        if not d:
            return jsonify({'error': 'Download not found'}), 404

        if d['status'] not in ('pending', 'processing'):
            return jsonify({'error': 'Download is not active'}), 400

        with active_processes_lock:
            proc = active_processes.get(download_id)

        if proc and proc.poll() is None:
            try:
                proc.kill()
                proc.wait(timeout=5)
            except Exception:
                pass

        conn = get_db()
        c = conn.cursor()
        c.execute('UPDATE downloads SET status = %s, message = %s WHERE id = %s',
                  ('cancelled', 'Cancelled by user.', download_id))
        conn.close()

        with active_processes_lock:
            active_processes.pop(download_id, None)

        sse_broadcast(current_user.id, 'download_cancelled', {
            'id': download_id,
            'title': d['title'],
            'artist': d['artist'],
            'status': 'cancelled',
        })

        return jsonify({'ok': True, 'message': 'Download cancelled'})

    @app.route('/api/queue/status')
    @login_required
    def api_queue_status():
        if not download_queue:
            return jsonify({'queue_enabled': False})
        try:
            q = rq.Queue('spotdl-downloads', connection=download_queue.connection)
            jobs = q.jobs
            return jsonify({
                'queue_enabled': True,
                'queued': len(jobs),
                'job_ids': [j.id for j in jobs[:10]],
            })
        except Exception:
            return jsonify({'queue_enabled': True, 'queued': 0})

    @app.route('/api/download/batch/<batch_id>/zip')
    @login_required
    def api_batch_zip(batch_id):
        import re as _re
        batch_id = _re.sub(r'[^a-f0-9]', '', batch_id)
        if not batch_id or len(batch_id) > 32:
            abort(404)

        batch_dir = os.path.join(DOWNLOAD_FOLDER, str(current_user.id), f'batch_{batch_id}')
        if not os.path.isdir(batch_dir):
            abort(404)

        audio_files = sorted([
            f for f in os.listdir(batch_dir)
            if f.endswith(('.mp3', '.flac', '.m4a', '.ogg', '.opus', '.wav'))
        ])
        if not audio_files:
            abort(404)

        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT collection_name FROM url_history WHERE batch_id = %s AND user_id = %s LIMIT 1',
                  (batch_id, current_user.id))
        row = c.fetchone()
        conn.close()
        collection_name = row['collection_name'] if row else 'batch'

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for f in audio_files:
                filepath = os.path.join(batch_dir, f)
                zf.write(filepath, f)
        zip_buffer.seek(0)

        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'spotdl_{collection_name[:30]}.zip'
        )
