import os
import sys
import json
import secrets
import zipfile
import subprocess
import requests
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('FLASK_KEY', 'key')

from app import app, get_db, sse_broadcast, redis_client

def rq_run_download(download_id, spotify_url, user_id, title, artist, image_url):
    sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'processing'})
    _do_download(download_id, spotify_url, user_id, title, artist, image_url)
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT status, filename FROM downloads WHERE id = %s', (download_id,))
    row = c.fetchone()
    conn.close()
    if row and row['status'] == 'completed':
        sse_broadcast(user_id, 'download_complete', {'id': download_id, 'title': title, 'artist': artist, 'status': 'completed', 'filename': row['filename']})
    elif row and row['status'] == 'failed':
        sse_broadcast(user_id, 'download_failed', {'id': download_id, 'title': title, 'artist': artist, 'status': 'failed'})


def rq_run_batch_download(download_id, spotify_url, user_id, title, artist, image_url, batch_id):
    _do_batch_download(download_id, spotify_url, user_id, title, artist, image_url, batch_id)
    conn = get_db()
    c = conn.cursor(dictionary=True)
    c.execute('SELECT status FROM downloads WHERE id = %s', (download_id,))
    row = c.fetchone()
    conn.close()
    if row and row['status'] == 'completed':
        sse_broadcast(user_id, 'download_complete', {'id': download_id, 'title': title, 'artist': artist, 'status': 'completed'})
    elif row and row['status'] == 'failed':
        sse_broadcast(user_id, 'download_failed', {'id': download_id, 'title': title, 'artist': artist, 'status': 'failed'})


YDL_OPTS = {
    'quiet': True,
    'no_warnings': True,
    'skip_download': True,
    'noplaylist': True,
    'extract_flat': False,
    'no_color': True,
}

def _get_audio_opts(title, artist):
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    config = {}
    if os.path.exists(config_path):
        with open(config_path) as f:
            config = json.load(f)
    audio_format = config.get('audio_format', 'mp3')
    bitrate = config.get('bitrate', '128k')
    bitrate_map = {
        '128k': '128k', '160k': '160k', '192k': '192k', '224k': '224k',
        '256k': '256k', '320k': '320k', 'auto': 'auto', 'disable': 'disable',
    }
    b = bitrate_map.get(bitrate, '128k')
    opts = {
        'outtmpl': f'{title} - {artist}.%(ext)s',
        'writethumbnail': True,
        'postprocessors': [
            {'key': 'FFmpegThumbnailsConvertor', 'format': 'jpg'},
            {'key': 'FFmpegMetadata'},
            {'key': 'EmbedThumbnail'},
        ],
    }
    if audio_format == 'mp3':
        opts['format'] = 'bestaudio/best'
        opts['postprocessors'].insert(0, {
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': b if b not in ('disable', 'auto') else '192k',
        })
    elif audio_format == 'm4a':
        opts['format'] = 'bestaudio/best'
        opts['postprocessors'].insert(0, {
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'm4a',
            'preferredquality': b if b not in ('disable', 'auto') else '192k',
        })
    elif audio_format == 'flac':
        opts['format'] = 'bestaudio/best'
        opts['postprocessors'].insert(0, {
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'flac',
            'preferredquality': b if b not in ('disable', 'auto') else '192k',
        })
    elif audio_format == 'wav':
        opts['format'] = 'bestaudio/best'
        opts['postprocessors'].insert(0, {
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': b if b not in ('disable', 'auto') else '192k',
        })
    elif audio_format == 'ogg':
        opts['format'] = 'bestaudio/best'
        opts['postprocessors'].insert(0, {
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'vorbis',
            'preferredquality': b if b not in ('disable', 'auto') else '192k',
        })
    elif audio_format == 'opus':
        opts['format'] = 'bestaudio/best'
        opts['postprocessors'].insert(0, {
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'opus',
            'preferredquality': b if b not in ('disable', 'auto') else '192k',
        })
    else:
        opts['format'] = 'bestaudio/best'
    return opts

def _download_file(url, filepath):
    yt_dlp_path = os.path.join(os.path.dirname(__file__), 'bin', 'yt-dlp')
    ydl_opts = _get_audio_opts('temp', 'temp')
    ydl_opts['outtmpl'] = filepath
    ydl_opts['quiet'] = True
    ydl_opts['no_warnings'] = True
    ydl_opts['noprogress'] = True
    ydl_opts['progress_hooks'] = []
    ydl_opts['postprocessor_hooks'] = []
    ydl_opts['nooverwrites'] = True
    ydl_opts['ignoreerrors'] = True
    ydl_opts['retries'] = 3
    ydl_opts['fragment_retries'] = 3
    ydl_opts['concurrent_fragment_downloads'] = 4
    ydl_opts['http_chunk_size'] = 10485760
    ydl_opts['socket_timeout'] = 30
    ydl_opts['extractor_retries'] = 3
    ydl_opts['file_access_retries'] = 3
    ydl_opts['no_color'] = True
    ydl_opts['noplaylist'] = True
    ydl_opts['geo_bypass'] = True
    ydl_opts['geo_bypass_country'] = 'US'
    ydl_opts['http_headers'] = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
    }
    ydl_opts['extractor_args'] = {'youtube': {'player_client': ['web', 'android', 'ios']}}
    ydl_opts['socket_connection_retries'] = 5
    ydl_opts['source_address'] = '0.0.0.0'
    ydl_opts['force_ipv4'] = True
    ydl_opts['force_ipv6'] = False
    try:
        import yt_dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        files = []
        for ext in ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'opus', 'webm', 'aac', 'mp4', 'mkv']:
            f = filepath + '.' + ext
            if os.path.exists(f):
                files.append(f)
        if not files:
            for f in os.listdir(os.path.dirname(filepath)):
                fp = os.path.join(os.path.dirname(filepath), f)
                if os.path.isfile(fp) and not f.endswith(('.part', '.ytdl', '.temp')):
                    files.append(fp)
        return files
    except Exception as e:
        print(f"[yt-dlp] Error: {e}")
        return []

def _do_download(download_id, spotify_url, user_id, title, artist, image_url):
    user_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(user_id))
    os.makedirs(user_dir, exist_ok=True)
    safe_filename = re.sub(r'[^\w\s\-]', '', f'{title} - {artist}').strip().replace(' ', '_')
    filepath = os.path.join(user_dir, safe_filename)

    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s WHERE id = %s', ('processing', download_id))
    conn.commit()
    conn.close()
    sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'processing'})

    try:
        results = []

        # Tier 1: YouTube search
        sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'YouTube'})
        youtube_results = _search_youtube(f'{title} {artist}')
        for yt_url in youtube_results[:3]:
            files = _download_file(yt_url, filepath)
            if files:
                results.extend(files)
                break

        # Tier 2: SoundCloud search
        if not results:
            sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'SoundCloud'})
            soundcloud_results = _search_soundcloud(f'{title} {artist}')
            for sc_url in soundcloud_results[:2]:
                files = _download_file(sc_url, filepath)
                if files:
                    results.extend(files)
                    break

        # Tier 3: Spotify preview
        if not results and preview_url:
            sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'Spotify Preview'})
            r = requests.get(preview_url, timeout=30)
            if r.status_code == 200:
                preview_path = filepath + '_preview.mp3'
                with open(preview_path, 'wb') as f:
                    f.write(r.content)
                results.append(preview_path)

        if not results:
            conn = get_db()
            c = conn.cursor()
            c.execute('UPDATE downloads SET status = %s, error = %s WHERE id = %s', ('failed', 'Could not find audio source', download_id))
            conn.commit()
            conn.close()
            return

        if len(results) > 1:
            zip_path = filepath + '.zip'
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for f in results:
                    zf.write(f, os.path.basename(f))
            output_file = zip_path
        else:
            output_file = results[0]

        filename = os.path.basename(output_file)
        file_size = os.path.getsize(output_file)
        conn = get_db()
        c = conn.cursor()
        c.execute('UPDATE downloads SET status = %s, filename = %s, filepath = %s, file_size = %s, completed_at = %s WHERE id = %s',
                  ('completed', filename, output_file, file_size, datetime.now(), download_id))
        conn.commit()
        conn.close()
    except Exception as e:
        import traceback
        traceback.print_exc()
        conn = get_db()
        c = conn.cursor()
        c.execute('UPDATE downloads SET status = %s, error = %s WHERE id = %s', ('failed', str(e)[:1000], download_id))
        conn.commit()
        conn.close()

def _do_batch_download(download_id, spotify_url, user_id, title, artist, image_url, batch_id):
    batch_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], str(user_id), f'batch_{batch_id}')
    os.makedirs(batch_dir, exist_ok=True)
    safe_filename = re.sub(r'[^\w\s\-]', '', f'{title} - {artist}').strip().replace(' ', '_')
    filepath = os.path.join(batch_dir, safe_filename)

    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE downloads SET status = %s WHERE id = %s', ('processing', download_id))
    conn.commit()
    conn.close()

    try:
        results = []

        # Tier 1: YouTube search
        sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'YouTube'})
        youtube_results = _search_youtube(f'{title} {artist}')
        for yt_url in youtube_results[:3]:
            files = _download_file(yt_url, filepath)
            if files:
                results.extend(files)
                break

        # Tier 2: SoundCloud search
        if not results:
            sse_broadcast(user_id, 'download_update', {'id': download_id, 'title': title, 'artist': artist, 'status': 'searching', 'source': 'SoundCloud'})
            soundcloud_results = _search_soundcloud(f'{title} {artist}')
            for sc_url in soundcloud_results[:2]:
                files = _download_file(sc_url, filepath)
                if files:
                    results.extend(files)
                    break

        if not results:
            conn = get_db()
            c = conn.cursor()
            c.execute('UPDATE downloads SET status = %s, error = %s WHERE id = %s', ('failed', 'Could not find audio source', download_id))
            conn.commit()
            conn.close()
            return

        if len(results) > 1:
            zip_path = filepath + '.zip'
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for f in results:
                    zf.write(f, os.path.basename(f))
            output_file = zip_path
        else:
            output_file = results[0]

        filename = os.path.basename(output_file)
        file_size = os.path.getsize(output_file)
        conn = get_db()
        c = conn.cursor()
        c.execute('UPDATE downloads SET status = %s, filename = %s, filepath = %s, file_size = %s, completed_at = %s WHERE id = %s',
                  ('completed', filename, output_file, file_size, datetime.now(), download_id))
        conn.commit()
        conn.close()
    except Exception as e:
        import traceback
        traceback.print_exc()
        conn = get_db()
        c = conn.cursor()
        c.execute('UPDATE downloads SET status = %s, error = %s WHERE id = %s', ('failed', str(e)[:1000], download_id))
        conn.commit()
        conn.close()

def _search_youtube(query):
    try:
        yt_dlp_path = os.path.join(os.path.dirname(__file__), 'bin', 'yt-dlp')
        result = subprocess.run([yt_dlp_path, f'ytsearch5:{query}', '--flat-playlist', '--dump-json', '--no-warnings', '--ignore-errors'],
            capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return []
        urls = []
        for line in result.stdout.strip().split('\n'):
            if line:
                try:
                    d = json.loads(line)
                    url = d.get('url') or d.get('webpage_url')
                    if url:
                        urls.append(url)
                except:
                    pass
        return urls
    except:
        return []

def _search_soundcloud(query):
    try:
        yt_dlp_path = os.path.join(os.path.dirname(__file__), 'bin', 'yt-dlp')
        result = subprocess.run([yt_dlp_path, f'scsearch5:{query}', '--flat-playlist', '--dump-json', '--no-warnings', '--ignore-errors'],
            capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return []
        urls = []
        for line in result.stdout.strip().split('\n'):
            if line:
                try:
                    d = json.loads(line)
                    url = d.get('url') or d.get('webpage_url')
                    if url:
                        urls.append(url)
                except:
                    pass
        return urls
    except:
        return []

import re
