# Changelog

## [2.6.0] - 2026-07-05

### Added

- **PO Token Server for YouTube**
  - Installed `bgutil-ytdlp-pot-provider` for YouTube bot detection bypass
  - Deno 2.9.1 installed for yt-dlp JS runtime support
  - PO token server running on port 4416 (`spotdl-pot.service`)
  - yt-dlp upgraded to v2026.07.04
  - `web` player client added to YouTube search strategy

- **Download Manager ZIP per Batch**
  - Batches (playlists/albums) are now grouped in Download Manager
  - Each batch shows progress bar with X/Y completed
  - ZIP download button appears when all batch downloads complete
  - Expand/collapse individual tracks within a batch
  - `batch_complete` SSE event refreshes batch status immediately

- **Batch-aware Downloads API**
  - `/api/downloads` now returns `batch_id` and `collection_name` via JOIN with `url_history`

### Fixed

- **Download subprocess environment** - Added deno to PATH in `_run_cmd` for PO token script execution
- **PO token server systemd service** - Auto-starts on boot, auto-restarts on failure

## [2.5.1] - 2026-07-05

### Fixed

- **Delete History**
  - Added delete button to HistoryPage (hover reveal with confirm/cancel)
  - Added delete button to HistoryDetailPage header
  - Added `api.deleteHistory(id)` method
  - Backend DELETE endpoint already existed

- **Improved Download Quality (30s Preview Fix)**
  - YouTube search upgraded: `ytsearch1:` → `ytsearch3:` (3 results per query) with 4 clients × 4 queries = up to 48 attempts
  - Added `--retries 3`, `--sleep-requests 1`, `--socket-timeout 30` to YouTube search
  - YouTube timeout increased 120s → 180s
  - Added `ytsearch` default-search fallback with 240s timeout, 5 retries, fragment retries
  - SoundCloud search upgraded: 3 query variations with `--retries 3`, timeout 60s → 90s
  - Added `_find_downloaded_file()` helper: checks expected name → prefix match → recent mtime

- **Cancel Button Not Stopping Downloads**
  - Added `_kill_process()` helper: `os.killpg(SIGTERM)` + `proc.terminate()` + `SIGKILL` + `proc.kill()`
  - Kills entire yt-dlp process group, not just parent process
  - Applied to both single and batch cancel

- **Robust File Detection**
  - `_find_downloaded_file()` checks: exact expected name → prefix match → recent mtime (180s)
  - Fixes race condition where wrong file was returned from output directory

### Changed

- DownloadToast border upgraded from 2px to 3px
- DownloadToast: "Cancel All" button in header
- DownloadToast: All status icons use `text-nb-foreground`/`text-nb-muted` for contrast

## [2.5.0] - 2026-07-05

### Added

- **Download Manager Page** (`/downloads`)
  - Dedicated page to track and manage all downloads
  - Real-time SSE updates for live status
  - Progress bar for each active download
  - Batch progress summary (X of Y completed with percentage)
  - Stats cards: Active, Completed, Failed, Total
  - Cancel individual or Cancel All downloads
  - Refresh button to reload download list
  - Expand/collapse download list
  - Direct file download button for completed downloads
  - Delete with confirmation for completed downloads

- **Batch Cancel Endpoint** (`POST /api/cancel/batch`)
  - Cancels all active (pending/processing/searching) downloads at once
  - Kills subprocesses and updates DB status
  - SSE broadcast for each cancelled download

- **Batch Status Endpoint** (`GET /api/batch/<batch_id>/status`)
  - Returns all downloads in a batch with individual status
  - Provides progress percentage, zip availability
  - Used by Download Manager for batch tracking

- **Auto-Zip on Batch Complete**
  - Backend sends `batch_complete` SSE event when all batch downloads finish
  - Frontend can auto-trigger zip download when batch is done

- **Concurrent Downloads**
  - 5 concurrent downloads by default (configurable via admin settings)
  - ThreadPoolExecutor with semaphore-based concurrency control
  - Each batch download runs in parallel, not sequential

### Fixed

- **Cancel Button Visibility**
  - DashboardPage: removed `sm:opacity-0 sm:group-hover:opacity-100` so cancel button always visible
  - DownloadToast: removed opacity hiding on cancel button
  - Changed `text-nb-muted2` to `text-nb-foreground` for better contrast

### Changed

- **Navbar** - Added "Downloads" nav item with Download icon between Dashboard and History

## [2.4.0] - 2026-07-05

### Added

- **NbIcon Component** (`components/ui/NbIcon.jsx`)
  - Reusable neobrutalism icon wrapper with hard shadow, 3px black border
  - 5 color variants: default (mint), danger (red), warning (yellow), info (purple), muted (gray)
  - 3 sizes: sm (40px), md (64px), lg (96px)
  - `strokeWidth={2.5}` for bold icon strokes

### Fixed

- **Icon Visibility (CRITICAL)**
  - Icons were invisible because `bg-nb-main/20` + `text-nb-main` blended into cream background
  - Changed to solid backgrounds (`bg-nb-main`, `bg-nb-danger`, etc.) with `text-nb-foreground` (black)
  - All placeholder/fallback icons now use `bg-nb-surface2` + `text-nb-foreground` for high contrast
  - Ghost button icons changed from `text-nb-muted` to `text-nb-foreground`

- **Mobile CRUD Button Visibility**
  - Delete/cancel buttons used `opacity-0 group-hover:opacity-100` = invisible on mobile (no hover)
  - Changed to `sm:opacity-0 sm:group-hover:opacity-100` so buttons are always visible on mobile
  - Applies to DashboardPage delete/cancel and DownloadToast cancel buttons

- **Navbar Icon Visibility**
  - Inactive nav items changed from `text-nb-muted` to `text-nb-foreground` for better contrast
  - Desktop Settings/Logout icons changed to `text-nb-foreground`

- **Toast Notifications**
  - Completed status icon changed from `text-nb-main` to `text-nb-foreground`
  - Cancelled status icon changed from `text-nb-muted2` to `text-nb-muted`
  - Header spinner/icon changed from `text-nb-main` to `text-nb-foreground`
  - Status text colors darkened for better readability

- **Form Input Icons**
  - Password toggle Eye/EyeOff icon changed from `text-nb-muted2` to `text-nb-foreground`
  - Added `hover:text-nb-main` for interactive feedback

### Changed

- **Button Component**
  - Ghost variant: `text-nb-muted` → `text-nb-foreground`, added `hover:border-nb-border` for visible hover state
  - Ghost buttons no longer use inline `borderColor: transparent`, relying on Tailwind classes instead

- **DownloadToast**
  - Border upgraded from `2px` to `3px` for consistency with other components

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
