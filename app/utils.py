import os
import re
from app.config import BITRATE_MAP, FORMAT_BITRATE_DEFAULTS


def sanitize_filename(name):
    name = os.path.basename(name)
    name = re.sub(r'[^\w\-_. ]', '', name)
    return name.strip()[:200] or 'download'


def sanitize_username(username):
    return re.sub(r'[^a-zA-Z0-9_.-]', '', username)


def estimate_size_mb(duration_ms, audio_format='mp3', bitrate='128k'):
    if not duration_ms or duration_ms <= 0:
        return 0
    duration_s = duration_ms / 1000
    if bitrate == 'disable' or bitrate == 'auto':
        kbps = FORMAT_BITRATE_DEFAULTS.get(audio_format, 128)
    else:
        kbps = BITRATE_MAP.get(bitrate, 128)
    size_bytes = (kbps * 1000 / 8) * duration_s
    return round(size_bytes / (1024 * 1024), 1)
