import os
import re
import json
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.config import SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
from app.cache import cache_get, cache_set, cache_key
from app.config import load_app_config

SPOTIFY_URL_RE = re.compile(
    r'(?:https?://)?(?:open\.spotify\.com|spotify\.link)/(track|album|playlist|artist)/([a-zA-Z0-9]+)'
)

_spotify_token = None
_spotify_token_expires = 0


def parse_spotify_url(url):
    m = SPOTIFY_URL_RE.search(url)
    if not m:
        return None, None
    return m.group(1), m.group(2)


def get_spotify_token():
    global _spotify_token, _spotify_token_expires
    if _spotify_token and time.time() < _spotify_token_expires - 60:
        return _spotify_token
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        return None
    try:
        r = requests.post('https://accounts.spotify.com/api/token', data={
            'grant_type': 'client_credentials',
            'client_id': SPOTIFY_CLIENT_ID,
            'client_secret': SPOTIFY_CLIENT_SECRET,
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            _spotify_token = data['access_token']
            _spotify_token_expires = time.time() + data.get('expires_in', 3600)
            return _spotify_token
    except Exception:
        pass
    return None


def spotify_api_get(url):
    token = get_spotify_token()
    if not token:
        return None
    r = requests.get(url, headers={'Authorization': f'Bearer {token}'}, timeout=15)
    if r.status_code == 200:
        return r.json()
    return None


def fetch_spotify_metadata(url):
    content_type, track_id = parse_spotify_url(url)
    if not content_type or content_type != 'track':
        return None

    ck = cache_key('track', track_id)
    cached = cache_get(ck)
    if cached:
        return cached

    try:
        embed_url = f'https://open.spotify.com/embed/{content_type}/{track_id}'
        headers = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'}
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


def fetch_track_cover(track_id):
    """Fetch a single track's cover art using oEmbed + embed fallback."""
    ck = cache_key('track_cover', track_id)
    cached = cache_get(ck)
    if cached:
        return cached

    # Strategy 1: oEmbed API (fast, returns thumbnail)
    try:
        oembed_url = f'https://open.spotify.com/oembed?url=https://open.spotify.com/track/{track_id}'
        r = requests.get(oembed_url, timeout=8)
        if r.status_code == 200:
            data = r.json()
            thumbnail = data.get('thumbnail_url', '')
            if thumbnail:
                cache_set(ck, thumbnail, ttl=86400)
                return thumbnail
    except Exception:
        pass

    # Strategy 2: Embed page __NEXT_DATA__
    try:
        embed_url = f'https://open.spotify.com/embed/track/{track_id}'
        headers = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'}
        r = requests.get(embed_url, headers=headers, timeout=8)
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
        image_url = images[0].get('url', '') if images else None
        if image_url:
            cache_set(ck, image_url, ttl=86400)
        return image_url
    except Exception:
        return None


def fetch_tracks_covers_concurrent(track_ids, max_workers=10):
    """Fetch cover art for multiple tracks concurrently."""
    results = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_id = {executor.submit(fetch_track_cover, tid): tid for tid in track_ids}
        for future in as_completed(future_to_id):
            tid = future_to_id[future]
            try:
                results[tid] = future.result()
            except Exception:
                results[tid] = None
    return results


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
            track_images = t.get('visualIdentity', {}).get('image', [])
            track_image = track_images[0].get('url', '') if track_images else image_url
            tracks.append({
                'index': i + 1,
                'id': track_id,
                'uri': t.get('uri', ''),
                'title': t.get('title', 'Unknown'),
                'artist': t.get('subtitle', 'Unknown'),
                'duration_ms': t.get('duration', 0),
                'preview_url': audio.get('url', '') if audio else '',
                'image_url': track_image,
                'url': f'https://open.spotify.com/track/{track_id}',
            })

        # Fetch individual track covers concurrently
        track_ids = [t['id'] for t in tracks]
        covers = fetch_tracks_covers_concurrent(track_ids, max_workers=10)
        for t in tracks:
            cover = covers.get(t['id'])
            if cover:
                t['image_url'] = cover

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
