# SpotDL Web

A Spotify downloader web application with a Flask backend and React frontend. Paste a Spotify URL, preview metadata, and download tracks as MP3 files with full metadata and cover art.

## Features

- **Single & Batch Download** - Download individual tracks or entire albums/playlists (up to 500 tracks)
- **Metadata & Cover Art** - All downloads embed title, artist, album, and Spotify cover art (640x640)
- **Global File Cache** - If a song already exists anywhere in your storage, it is copied instantly instead of re-downloaded
- **ZIP Export** - Batch downloads are packaged into a single ZIP file
- **Real-time Progress** - Server-Sent Events (SSE) push download status to a floating toast panel
- **History** - All submitted URLs are saved; re-download individual tracks or entire batches anytime
- **Admin Panel** - Approve/revoke users, manage batch limits, configure concurrent downloads
- **User Settings** - Change username and password
- **HTTPS** - Let's Encrypt SSL with auto-renewal

## Tech Stack

| Layer            | Technology                                      |
|------------------|------------------------------------------------|
| Backend          | Python 3.12, Flask, Gunicorn (gthread)         |
| Database         | MySQL 8 (connection pooling)                   |
| Cache/Sessions   | Redis                                          |
| Frontend         | React 18, Vite, Tailwind CSS, Framer Motion    |
| Download         | yt-dlp, ffmpeg                                 |
| Metadata         | Spotify API (album art, track info)            |
| DDNS             | DuckDNS (`spotdl.duckdns.org`)                 |
| SSL              | Let's Encrypt (Certbot)                        |
| Reverse Proxy    | nginx (gzip, rate limiting, SSE support)        |

## Architecture

```
Browser
  |
  v
nginx:443 (HTTPS)
  |-- /              --> React SPA (static/)
  |-- /api/*         --> Flask API (127.0.0.1:5000)
  |-- /api/events    --> Flask SSE (long-poll)
  |
  v
Flask API
  |-- Redis          (sessions, cache, rate limiting)
  |-- MySQL          (users, downloads, history)
  |-- rq workers     (20 parallel download workers)
       |-- yt-dlp + ffmpeg (download & convert)
       |-- ffmpeg         (metadata & cover art embedding)
```

## Download Strategy

1. **File Cache** - Skip if file exists on disk (>35s, not preview)
2. **SoundCloud Smart Search** - `scsearch10`, filters by duration, picks studio > modified > any
3. **YouTube with Cookies** - Uses `cookies.txt` for reliable downloads
4. **SoundCloud Fallback** - Broader `scsearch3` query
5. **Spotify Preview** - Last resort (30-second preview)

## Environment Variables

| Variable         | Default                          | Description                     |
|------------------|----------------------------------|---------------------------------|
| `SECRET_KEY`     | random                           | Flask session secret            |
| `DB_HOST`        | localhost                        | MySQL host                      |
| `DB_USER`        | spotdl_user                      | MySQL user                      |
| `DB_PASSWORD`    | SpotDL@Pass123                   | MySQL password                  |
| `DB_NAME`        | spotdl_db                        | MySQL database                  |
| `REDIS_URL`      | redis://localhost:6379/0         | Redis URL                       |
| `ADMIN_USER`     | admin                            | Default admin username          |
| `ADMIN_PASS`     | admin123                         | Default admin password          |
| `HTTPS_ENABLED`  | 0                                | Set to 1 for secure cookies     |

## Default Credentials

- **Admin**: `admin` / `admin123`

> Change these immediately in production.

## API Endpoints

| Method | Endpoint                              | Description                         |
|--------|---------------------------------------|-------------------------------------|
| GET    | `/api/csrf`                           | Get CSRF token                      |
| POST   | `/api/login`                          | Login                               |
| POST   | `/api/register`                       | Register (requires admin approval)  |
| GET    | `/api/me`                             | Current user info                   |
| POST   | `/api/preview`                        | Fetch Spotify metadata              |
| POST   | `/api/download`                       | Download single track               |
| POST   | `/api/download/batch`                 | Download batch (album/playlist)     |
| POST   | `/api/download/batch/<id>/zip/create` | Create ZIP for batch                |
| GET    | `/api/download/batch/<id>/zip`        | Download batch ZIP                  |
| GET    | `/api/downloads`                      | List downloads                      |
| GET    | `/api/events`                         | SSE stream for progress             |
| GET    | `/api/history`                        | Download history                    |
| DELETE | `/api/history/<id>`                   | Delete history entry                |
| GET    | `/api/admin/users`                    | List users (admin)                  |
| POST   | `/api/admin/settings`                 | Update config (admin)               |
| POST   | `/api/admin/clean-all-downloads`      | Delete all downloads (admin)        |

## License

MIT License. See [LICENSE](LICENSE) for details.
