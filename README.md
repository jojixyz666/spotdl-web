# SpotDL Web

Spotify downloader web application with Flask backend and React frontend. Paste a Spotify URL, preview metadata, and download tracks as MP3 files.

## Features

- **Single & Batch Download** - Download individual tracks or entire albums/playlists (up to 500 tracks)
- **ZIP Export** - Batch downloads are packaged into a single ZIP file
- **Real-time Progress** - Server-Sent Events (SSE) push download status to a floating toast panel
- **History** - All submitted URLs are saved; re-download individual tracks or entire batches anytime
- **Admin Panel** - Approve/revoke users, manage batch limits, configure concurrent downloads
- **User Settings** - Change username and password

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, Flask, Gunicorn (gthread) |
| Database | MySQL 8 (connection pooling) |
| Cache/Sessions | Redis |
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion |
| Download | yt-dlp, ffmpeg |
| Metadata | Spotify Embed API (no auth required) |
| Reverse Proxy | nginx (gzip, rate limiting, SSE support) |

## Architecture

```
Browser -> nginx:80 -> React SPA (/)
                     -> Flask API (/api/*)
                     -> Flask SSE (/api/events)
                     -> Redis (sessions + cache)
                     -> MySQL (users, downloads, history)
                     -> yt-dlp + ffmpeg (download workers)
```

## Quick Start

```bash
# Clone
git clone https://github.com/jojixyz666/spotdl-web.git
cd spotdl-web

# Install dependencies
sudo apt install nginx mysql-server ffmpeg redis-server
python3 -m venv venv
source venv/bin/activate
pip install flask flask-login flask-limiter flask-session bcrypt mysql-connector-python redis requests gunicorn

# Build frontend
cd frontend
npm install
npm run build
cd ..

# Configure
cp config.json.example config.json

# Start
gunicorn -c gunicorn.conf.py main:app
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | random | Flask session secret |
| `DB_HOST` | localhost | MySQL host |
| `DB_USER` | spotdl_user | MySQL user |
| `DB_PASSWORD` | SpotDL@Pass123 | MySQL password |
| `DB_NAME` | spotdl_db | MySQL database |
| `REDIS_URL` | redis://localhost:6379/0 | Redis URL |
| `ADMIN_USER` | admin | Default admin username |
| `ADMIN_PASS` | admin123 | Default admin password |
| `HTTPS_ENABLED` | 0 | Set to 1 for secure cookies |

## Configuration

Edit `config.json`:

```json
{
  "batch_limit": 500,
  "max_concurrent_downloads": 5,
  "require_approval": true
}
```

## Default Credentials

- **Admin**: `admin` / `admin123`

> Change these immediately in production.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/csrf` | Get CSRF token |
| POST | `/api/login` | Login |
| POST | `/api/register` | Register (requires admin approval) |
| GET | `/api/me` | Current user info |
| POST | `/api/preview` | Fetch Spotify metadata |
| POST | `/api/download` | Download single track |
| POST | `/api/download/batch` | Download batch (album/playlist) |
| GET | `/api/downloads` | List downloads |
| GET | `/api/events` | SSE stream for progress |
| GET | `/api/history` | Download history |
| GET | `/api/admin/users` | List users (admin) |
| POST | `/api/admin/settings` | Update config (admin) |

## License

MIT
