# Changelog

## [2.3.0] - 2026-07-05

### Added

- **Error Pages**
  - `NotFoundPage` (404) - Bold "404" with go back and dashboard buttons
  - `ForbiddenPage` (403) - Shield icon with access denied message
  - `ServerErrorPage` (500) - Warning icon with try again button
  - `MaintenancePage` - Construction icon with downtime info

- **Maintenance Mode**
  - `/maintenance` route for scheduled maintenance display

### Fixed

- **Login redirect loop** - Entering wrong password caused infinite redirect loop
  - Excluded `/api/login`, `/api/register`, `/api/csrf`, `/api/me` from 401 redirect logic
  - Only redirects to `/login` for authenticated API calls that fail (session expired)

- **Admin route 403 handling** - Non-admin users now see ForbiddenPage instead of redirect to dashboard

### Changed

- Flask error handlers (403, 404, 500, 501) now serve React app for non-API routes
- LoadingScreen updated with neobrutalism styling

## [2.2.0] - 2026-07-05

### Changed

- **Neobrutalism UI/UX Redesign**
  - Complete visual overhaul using neobrutalism design language
  - Bold 2px borders on all components (cards, inputs, buttons, badges)
  - Solid drop shadows (`4px 4px 0px`) with hover translate effect
  - Space Grotesk font for bold, geometric typography
  - Spotify green as primary accent color

- **New UI Component Library (`components/ui/`)**
  - `Button` - 4 variants (default/neutral/danger/ghost), 5 sizes with shadow hover
  - `Card` - Bold bordered cards with header/content/footer
  - `Input` - Thick border inputs with focus ring
  - `Badge` - 6 variants (default/neutral/danger/warning/info/muted)
  - `Label` - Bold heading font labels
  - `Select` - Styled select dropdowns
  - `Progress` - Bordered progress bars

- **Pages Rewritten**
  - LoginPage - Neobrutalism card with bold login form
  - RegisterPage - Matching neobrutalism registration
  - DashboardPage - Search, preview, download list all neobrutalism
  - HistoryPage - Bold list items with border dividers
  - HistoryDetailPage - Track list with bold UI elements
  - SettingsPage - Cards for username/password changes
  - AdminUsersPage - Bold table with border rows
  - AdminSettingsPage - Settings cards with bold inputs

- **Components Updated**
  - Layout - Clean dark background, removed glassmorphism blobs
  - Navbar - Bold border bottom, hover shadow effects on nav items
  - DownloadToast - Solid bordered toast panel

### Removed

- Glassmorphism design (backdrop-blur, transparent surfaces)
- Animated background blobs
- Inter font (replaced by Space Grotesk)

## [2.1.0] - 2026-07-05

### Added

- **Cancel Download**
  - Cancel button on active downloads (pending/processing/searching)
  - Backend kills yt-dlp subprocess immediately
  - SSE `download_cancelled` event for real-time UI update
  - Works on both Dashboard download list and floating DownloadToast

- **Redis-Backed Rate Limiter**
  - Rate limiter now uses Redis storage (works across all gunicorn workers)
  - Auto-fallback to memory if Redis unavailable

- **requirements.txt**
  - Pinned dependency versions for reproducible builds

- **Format/Bitrate Selection (Fixed)**
  - User-selected audio format (MP3/FLAC/M4A/OPUS/OGG/WAV) now actually used in download
  - User-selected bitrate (128k-320k/auto/disable) now passed to yt-dlp
  - Previously, format/bitrate from frontend were silently ignored (read from config.json)

- **Improved Download Quality**
  - YouTube search now tries 3 query variations x 4 player clients = 12 attempts (was 4)
  - SoundCloud search now tries 2 query variations
  - Better search increases full-track success rate, reduces Spotify preview fallback

- **Batch ZIP Download**
  - New endpoint: `GET /api/download/batch/<batch_id>/zip`
  - Download ZIP button on history detail page works correctly

- **SSE Hot Reload**
  - Dashboard download list updates in real-time via SSE (no page refresh needed)
  - SSE broadcasts active download status on new connection (reconnect recovery)

- **Download History Improvements**
  - History detail page properly merges track metadata with download status
  - Shows completed/processing counts in header
  - Re-download button for failed tracks

### Fixed

- Spotify preview fallback now uses user-selected format (was always MP3)
- Spotify preview fallback saves with correct file extension
- History detail page data structure parsing (was broken)
- DownloadToast SSE reconnection (3s delay, proper cleanup)

### Security

- **CRITICAL**: Removed hardcoded fallback passwords from config.py and main.py
- **CRITICAL**: Fixed path traversal probe in static proxy (added `realpath` validation)
- **CRITICAL**: Admin auto-promotion on restart removed (only creates if no admin exists)
- **CRITICAL**: Removed hardcoded `admin123` password from migration code
- Reduced `MAX_CONTENT_LENGTH` from 500MB to 5MB (only JSON payloads accepted)
- Added `config.json` to `.gitignore`
- Added `cancelled` status to downloads DB enum
- Database migration auto-adds `cancelled` to existing installations

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
