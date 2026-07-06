# Changelog

All notable changes to SpotDL Web are documented in this file.

## [3.0.0] - 2026-07-06

### Added

- **DuckDNS Dynamic DNS**
  - Domain `spotdl.duckdns.org` configured via DuckDNS
  - Auto-update IP every 5 minutes via cron

- **Let's Encrypt SSL**
  - Full HTTPS support via Certbot
  - Auto-renewal configured via systemd timer
  - HTTP to HTTPS redirect (301)

- **Metadata & Cover Art Embedding**
  - All downloaded MP3/FLAC/M4A files now embed title, artist, and album metadata
  - Cover art downloaded from Spotify and embedded as album art (640x640 JPEG)
  - Applied to all download sources (SoundCloud, YouTube, Spotify Preview)
  - Metadata embedded on cache copy as well (global file cache)

- **Global File Cache**
  - Before downloading, search ALL user directories (root + all batches)
  - If song exists anywhere in user storage, copy to current batch instead of re-downloading
  - Fuzzy matching by title across different batches
  - Applies to both single downloads and batch downloads
  - Message shows "Copied from cache" when using cached file

### Fixed

- **Batch Download Filename Collision (Critical)**
  - `_find_file_in_dir` had a fallback that matched any recently-modified audio file
  - With 20 parallel workers, files from different songs were being matched incorrectly
  - e.g., Black Sabbath "Paranoid" got filename "Avenged Sevenfold - Almost Easy.mp3"
  - Fix: removed fragile fallback, only exact filename match allowed
  - All 75 files now have correct, unique filenames

- **cookies.txt Removed from Git History**
  - Sensitive file was tracked in git history
  - Removed from all commits via `git filter-branch`
  - Added to `.gitignore` (never pushed to remote)

## [2.9.0] - 2026-07-06

### Added

- **YouTube Cookies Support**
  - `cookies.txt` file enables YouTube downloads on previously-banned VPS
  - YouTube with cookies as Strategy 2 (fast & reliable)
  - Auto-detected on startup (`USE_COOKIES` flag)

- **Improved SoundCloud Search**
  - Smart SC search (`_sc_search_best`): `scsearch10` with title-based filtering
  - 3-tier priority: Studio > Modified (slowed/sped/nightcore) > Any (live/remix/cover)
  - Filters out short tracks (<35s), picks longest available
  - Duration-based sorting within each tier

- **Improved Download Strategy**
  - New order: 1) File cache → 2) SoundCloud smart → 3) YouTube with cookies → 4) SoundCloud fallback → 5) Spotify preview
  - YouTube unbanned via cookies, now reliable fallback

- **20 Parallel Workers**
  - Upgraded from 5 to 20 parallel rq workers
  - MySQL `max_connections` increased to 500
  - Database pool size increased to 5

- **ZIP Creation Async Flow**
  - `POST /api/download/batch/<batch_id>/zip` creates ZIP on disk, returns download URL
  - Frontend shows "Creating ZIP, please wait..." toast
  - Success toast with file count and size

- **Download Manager Redesign**
  - Grouped by playlist/album with cover art
  - Expand/collapse per batch
  - Save to Device / Save to ZIP / Cancel Active buttons per batch

### Fixed

- **Download Toast Blank Page**
  - `useCallback` hooks called before `if (!user) return null` in `DownloadToast.jsx`
  - React Rules of Hooks violation was crashing entire app tree after login

- **Re-downloaded Preview Files**
  - All 39 preview files re-downloaded to full versions
  - 0 preview files remaining

## [2.8.0] - 2026-07-05

### Added

- **Admin: Delete All Downloads**
  - New Danger Zone in Admin Settings page
  - Button with confirm/cancel flow to delete all downloads
  - Clears all download records, url_history, and user file directories
  - Backend endpoint: `POST /api/admin/clean-all-downloads`

- **WIB Timezone (UTC+7)**
  - All displayed times now use WIB timezone
  - New utility functions: `formatWIB()`, `formatWIBDate()`
  - Admin users page shows WIB dates

### Changed

- **Dashboard Simplified**
  - Dashboard now only shows search input + track/album/playlist preview
  - Removed "Recent Downloads" list from Dashboard (use Download Manager instead)

### Fixed

- **Icon Visibility Audit**
  - Fixed missing `text-nb-foreground` on DownloadManagerPage expand/collapse button
  - All icons now properly inherit or have explicit color classes

## [2.7.0] - 2026-07-05

### Fixed

- **Preview Detection & Auto-Retry**
  - After download, check file duration with ffprobe
  - If < 35 seconds = preview, delete and retry with next strategy

- **Skip Re-Download (File Cache)**
  - Before downloading, check if file already exists on disk
  - If file exists and is full song (>35s), mark as completed immediately

- **SoundCloud Priority**
  - SoundCloud moved to Strategy 1 (was Strategy 2)
  - Search queries upgraded to `scsearch3` (3 results per query)

## [2.6.0] - 2026-07-05

### Added

- **PO Token Server for YouTube**
  - Installed `bgutil-ytdlp-pot-provider` for YouTube bot detection bypass
  - PO token server running on port 4416 (`spotdl-pot.service`)

- **Download Manager ZIP per Batch**
  - Batches are now grouped in Download Manager
  - Each batch shows progress bar with X/Y completed
  - ZIP download button appears when all batch downloads complete

## [2.5.0] - 2026-07-05

### Added

- **Download Manager Page** (`/downloads`)
  - Dedicated page to track and manage all downloads
  - Real-time SSE updates for live status
  - Progress bar for each active download
  - Cancel individual or Cancel All downloads

- **Batch Cancel Endpoint** (`POST /api/cancel/batch`)
  - Cancels all active downloads at once

- **Concurrent Downloads**
  - 5 concurrent downloads by default (configurable via admin settings)
  - ThreadPoolExecutor with semaphore-based concurrency control

## [2.4.0] - 2026-07-05

### Added

- **NbIcon Component** (`components/ui/NbIcon.jsx`)
  - Reusable neobrutalism icon wrapper with hard shadow, 3px black border
  - 5 color variants: default, danger, warning, info, muted

### Fixed

- **Icon Visibility (Critical)**
  - Icons were invisible due to transparent backgrounds
  - Changed to solid backgrounds with high-contrast text

## [2.3.0] - 2026-07-05

### Added

- **Error Pages** (404, 403, 500, Maintenance)
- **Maintenance Mode**

### Fixed

- Login redirect loop
- Admin route 403 handling

## [2.2.0] - 2026-07-05

### Changed

- **Neobrutalism UI/UX Redesign**
  - Complete visual overhaul using neobrutalism design language
  - Bold 2px borders on all components
  - Space Grotesk font for bold, geometric typography
  - Spotify green as primary accent color

## [2.1.0] - 2026-07-05

### Added

- **Cancel Download**
- **Redis-Backed Rate Limiter**
- **Format/Bitrate Selection**
- **Batch ZIP Download**
- **SSE Hot Reload**

### Security

- Removed hardcoded fallback passwords
- Fixed path traversal probe
- Admin auto-promotion on restart removed

## [1.0.0] - 2026-07-04

### Added

- **Authentication System** with admin approval flow
- **Download Engine** with 3-tier fallback (YouTube → SoundCloud → Spotify preview)
- **History** with automatic URL tracking
- **Admin Panel** for user management
- **Frontend** with React, Tailwind CSS, Framer Motion
- **Backend** with Flask, Redis, MySQL
- **Infrastructure** with nginx, Gunicorn, systemd
