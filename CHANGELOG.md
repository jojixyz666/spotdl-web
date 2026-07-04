# Changelog

## [1.0.0] - 2026-07-04

### Added

- **Authentication System**
  - User registration with admin approval flow
  - Login/logout with session management
  - Role-based access control (admin/user)
  - Account settings (change username/password)

- **Download Engine**
  - Single track download via Spotify URL
  - Batch download for albums and playlists (up to 500 tracks)
  - 3-tier fallback: YouTube -> SoundCloud -> Spotify preview
  - ZIP packaging for batch downloads
  - Real-time progress via Server-Sent Events (SSE)

- **History**
  - Automatic URL history tracking
  - Re-download individual tracks from history
  - Re-download entire batches from history
  - Delete history entries

- **Admin Panel**
  - User management (approve/revoke/delete/promote/demote)
  - Configurable batch limit (up to 500)
  - Configurable concurrent download limit
  - Toggle admin approval requirement

- **Frontend (React)**
  - Modern SPA with Tailwind CSS
  - Animated glass morphism design
  - Framer Motion page transitions
  - Responsive mobile layout
  - Floating download progress toast
  - Protected and admin-only routes

- **Backend (Flask)**
  - JSON API for all operations
  - CSRF protection with constant-time comparison
  - Rate limiting on sensitive endpoints
  - Security headers (XSS, nosniff, DENY, CSP)
  - Input validation and sanitization
  - Path traversal protection

- **Performance**
  - Gunicorn with gthread workers (4 workers x 4 threads)
  - Redis session backend
  - Redis caching for Spotify metadata (24h tracks, 1h playlists)
  - MySQL connection pooling (size=10)
  - ThreadPoolExecutor for download workers
  - nginx gzip compression
  - nginx rate limiting (30r/s API, 5r/m login)
  - Database indexes on frequently queried columns

- **Infrastructure**
  - nginx reverse proxy with SPA fallback
  - Systemd service with auto-restart
  - Environment variable configuration
  - Admin credentials configurable via env vars

### Security

- bcrypt password hashing (no plaintext fallback)
- CSRF tokens with `hmac.compare_digest` (timing-safe)
- Redis sessions with `HttpOnly`, `SameSite=Lax` flags
- Configurable `Secure` cookie flag via `HTTPS_ENABLED`
- Parameterized SQL queries (no injection)
- Subprocess calls with list args (no shell injection)
- Domain whitelist for external requests
- Rate limiting on login (5r/m) and API (30r/s)
