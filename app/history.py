import os
import json
import re
import zipfile
import io

from flask import request, jsonify, send_file, abort
from flask_login import login_required, current_user

from app.config import DOWNLOAD_FOLDER
from app.models import get_db
from app.utils import sanitize_filename


def register_history_routes(app):

    @app.route('/api/history')
    @login_required
    def api_history():
        page = request.args.get('page', 1, type=int)
        per_page = 20
        offset = (page - 1) * per_page

        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT COUNT(*) as cnt FROM url_history WHERE user_id = %s', (current_user.id,))
        total = c.fetchone()['cnt']
        c.execute('SELECT * FROM url_history WHERE user_id = %s ORDER BY id DESC LIMIT %s OFFSET %s',
                  (current_user.id, per_page, offset))
        rows = c.fetchall()
        conn.close()

        for r in rows:
            if r.get('created_at'):
                r['created_at'] = r['created_at'].isoformat() if hasattr(r['created_at'], 'isoformat') else str(r['created_at'])

        return jsonify({
            'history': rows,
            'total': total,
            'page': page,
            'has_more': offset + per_page < total,
        })

    @app.route('/api/history/<int:history_id>')
    @login_required
    def api_history_detail(history_id):
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT * FROM url_history WHERE id = %s AND user_id = %s', (history_id, current_user.id))
        row = c.fetchone()
        conn.close()

        if not row:
            return jsonify({'error': 'Not found'}), 404

        if row.get('created_at'):
            row['created_at'] = row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else str(row['created_at'])

        track_data = row.get('track_data')
        if isinstance(track_data, str):
            try:
                row['track_data'] = json.loads(track_data)
            except (json.JSONDecodeError, TypeError):
                row['track_data'] = []
        elif track_data is None:
            row['track_data'] = []

        if row.get('batch_id'):
            conn = get_db()
            c = conn.cursor(dictionary=True)
            c.execute(
                'SELECT id, title, artist, filename, status, message FROM downloads WHERE user_id = %s AND spotify_url IN (SELECT spotify_url FROM url_history WHERE id = %s)',
                (current_user.id, history_id)
            )
            row['downloads'] = c.fetchall()
            conn.close()

            batch_dir = os.path.join(DOWNLOAD_FOLDER, str(current_user.id), f'batch_{row["batch_id"]}')
            if os.path.isdir(batch_dir):
                mp3_files = [f for f in os.listdir(batch_dir) if f.endswith(('.mp3', '.flac', '.m4a', '.ogg', '.opus', '.wav'))]
                row['zip_available'] = len(mp3_files) > 0
                row['completed_count'] = len(mp3_files)
            else:
                row['zip_available'] = False
                row['completed_count'] = 0
        else:
            conn = get_db()
            c = conn.cursor(dictionary=True)
            c.execute(
                'SELECT id, title, artist, filename, status, message FROM downloads WHERE user_id = %s AND spotify_url = %s',
                (current_user.id, row.get('spotify_url', ''))
            )
            row['downloads'] = c.fetchall()
            conn.close()
            row['zip_available'] = False
            row['completed_count'] = 0

        return jsonify(row)

    @app.route('/api/history/<int:history_id>/download', methods=['POST'])
    @login_required
    def api_history_re_download(history_id):
        from app.auth import validate_csrf
        if not validate_csrf_request():
            abort(403)

        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT * FROM url_history WHERE id = %s AND user_id = %s', (history_id, current_user.id))
        row = c.fetchone()
        conn.close()

        if not row:
            return jsonify({'error': 'Not found'}), 404

        track_data = row.get('track_data')
        if isinstance(track_data, str):
            try:
                track_data = json.loads(track_data)
            except (json.JSONDecodeError, TypeError):
                track_data = []

        if not track_data:
            return jsonify({'error': 'No track data'}), 400

        if row['content_type'] == 'track' and track_data:
            t = track_data[0] if isinstance(track_data, list) else track_data
            from app.downloads import download_queue, bounded_download, run_download_progress, download_executor
            from app.cache import download_queue as rq_queue

            conn = get_db()
            c = conn.cursor(dictionary=True)
            c.execute('INSERT INTO downloads (user_id, spotify_url, title, artist, image_url, status) VALUES (%s, %s, %s, %s, %s, %s)',
                      (current_user.id, t.get('url', ''), t.get('title', ''), t.get('artist', ''), t.get('image_url', ''), 'pending'))
            download_id = c.lastrowid
            conn.close()

            if rq_queue:
                from worker import rq_run_download
                rq_queue.enqueue(rq_run_download, download_id, t.get('url', ''), current_user.id, t.get('title', ''), t.get('artist', ''), t.get('image_url', ''), job_timeout=600)
            else:
                download_executor.submit(bounded_download, run_download_progress, download_id, t.get('url', ''), current_user.id, t.get('title', ''), t.get('artist', ''), t.get('image_url', ''))

            return jsonify({'ok': True, 'download_id': download_id})
        else:
            return jsonify({'error': 'Batch re-download not supported via this endpoint'}), 400

    @app.route('/api/history/<int:history_id>/zip')
    @login_required
    def api_history_zip(history_id):
        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT * FROM url_history WHERE id = %s AND user_id = %s', (history_id, current_user.id))
        row = c.fetchone()
        conn.close()

        if not row or not row.get('batch_id'):
            abort(404)

        batch_dir = os.path.join(DOWNLOAD_FOLDER, str(current_user.id), f'batch_{row["batch_id"]}')
        if not os.path.isdir(batch_dir):
            abort(404)

        audio_files = [f for f in os.listdir(batch_dir) if f.endswith(('.mp3', '.flac', '.m4a', '.ogg', '.opus', '.wav'))]
        if not audio_files:
            abort(404)

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for f in sorted(audio_files):
                filepath = os.path.join(batch_dir, f)
                zf.write(filepath, f)
        zip_buffer.seek(0)

        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'spotdl_{row.get("collection_name", "batch")[:30]}.zip'
        )

    @app.route('/api/history/<int:history_id>', methods=['DELETE'])
    @login_required
    def api_history_delete(history_id):
        from app.auth import validate_csrf_request
        if not validate_csrf_request():
            abort(403)

        conn = get_db()
        c = conn.cursor(dictionary=True)
        c.execute('SELECT * FROM url_history WHERE id = %s AND user_id = %s', (history_id, current_user.id))
        row = c.fetchone()
        if not row:
            conn.close()
            return jsonify({'error': 'Not found'}), 404

        c.execute('DELETE FROM url_history WHERE id = %s', (history_id,))
        conn.close()
        return jsonify({'ok': True})
