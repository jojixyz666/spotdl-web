import re
import json
import hashlib
import redis as redis_lib
import rq
from redis import Redis as RedisConnection

from app.config import REDIS_URL

# ──────────────────────────────────────────────
# Redis Client
# ──────────────────────────────────────────────

redis_client = None
try:
    redis_client = redis_lib.Redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=3)
    redis_client.ping()
except Exception:
    redis_client = None

# ──────────────────────────────────────────────
# Redis Queue for persistent downloads
# ──────────────────────────────────────────────

download_queue = None
if redis_client:
    try:
        _rq_conn = RedisConnection.from_url(REDIS_URL)
        download_queue = rq.Queue('spotdl-downloads', connection=_rq_conn)
    except Exception:
        download_queue = None

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
