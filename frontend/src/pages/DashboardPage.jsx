import { useState, useCallback, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { api } from '../lib/api'
import { formatDuration, timeAgo } from '../lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Play, Pause, Download, Music, ExternalLink, Check, Loader2, Trash2, X, ChevronRight } from 'lucide-react'

export default function DashboardPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloads, setDownloads] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [downloadsLoading, setDownloadsLoading] = useState(false)
  const previewAudio = useRef(null)
  const [playingId, setPlayingId] = useState(null)
  const [audioFormat, setAudioFormat] = useState('mp3')
  const [bitrate, setBitrate] = useState('128k')

  const loadDownloads = useCallback(async (p = 1, append = false) => {
    setDownloadsLoading(true)
    try {
      const data = await api.getDownloads(p)
      if (append) {
        setDownloads(prev => [...prev, ...data.downloads])
      } else {
        setDownloads(data.downloads || [])
      }
      setHasMore(data.has_more || false)
      setPage(p)
    } catch {}
    setDownloadsLoading(false)
  }, [])

  useState(() => { loadDownloads() }, [loadDownloads])

  const handleSearch = async () => {
    if (!url.trim()) return
    setLoading(true)
    setPreview(null)
    try {
      const data = await api.preview(url)
      if (data.error) {
        toast.error(data.error)
      } else {
        setPreview(data)
      }
    } catch {
      toast.error('Failed to fetch preview')
    }
    setLoading(false)
  }

  const handleDownload = async (track) => {
    try {
      const res = await api.downloadTrack(track)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(`Downloading: ${track.artist} - ${track.name || track.title}`)
        loadDownloads()
      }
    } catch {
      toast.error('Download failed')
    }
  }

  const handleBatchDownload = async (tracks, name, type) => {
    try {
      const res = await api.downloadBatch(tracks, name, type)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(`Batch downloading ${tracks.length} tracks...`)
        loadDownloads()
      }
    } catch {
      toast.error('Batch download failed')
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteDownload(id)
      setDownloads(prev => prev.filter(d => d.id !== id))
      toast.success('Deleted')
    } catch {
      toast.error('Delete failed')
    }
  }

  const togglePreview = (id, src) => {
    if (previewAudio.current) {
      previewAudio.current.pause()
      if (playingId === id) { setPlayingId(null); return }
    }
    const audio = new Audio(src)
    audio.play()
    audio.onended = () => setPlayingId(null)
    previewAudio.current = audio
    setPlayingId(id)
  }

  const isTrack = preview?.type === 'track'
  const isPlaylist = preview?.type === 'album' || preview?.type === 'playlist'

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-bold text-text-primary">Welcome back, {user?.username}</h2>
        <p className="text-text-secondary mt-1">Paste a Spotify link to download tracks, albums, or playlists</p>
      </motion.div>

      {/* Search */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="card p-6">
          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="input flex-1"
              placeholder="https://open.spotify.com/track/... or /album/... or /playlist/..."
            />
            <motion.button
              onClick={handleSearch}
              disabled={loading || !url.trim()}
              whileTap={{ scale: 0.97 }}
              className="btn-primary px-6"
            >
              {loading ? <Loader2 size={18} className="animate-spin-slow" /> : <><Search size={18} /> Search</>}
            </motion.button>
          </div>
          <div className="flex gap-4 mt-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted font-medium uppercase tracking-wider">Format</label>
              <select value={audioFormat} onChange={e => setAudioFormat(e.target.value)} className="input py-1.5 px-3 text-sm">
                <option value="mp3">MP3</option>
                <option value="flac">FLAC</option>
                <option value="m4a">M4A</option>
                <option value="opus">OPUS</option>
                <option value="ogg">OGG</option>
                <option value="wav">WAV</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted font-medium uppercase tracking-wider">Bitrate</label>
              <select value={bitrate} onChange={e => setBitrate(e.target.value)} className="input py-1.5 px-3 text-sm">
                <option value="disable">Original (No Convert)</option>
                <option value="auto">Auto</option>
                <option value="128k">128 kbps</option>
                <option value="192k">192 kbps</option>
                <option value="256k">256 kbps</option>
                <option value="320k">320 kbps</option>
              </select>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Preview */}
      <AnimatePresence mode="wait">
        {preview && (
          <motion.div
            key={preview.type + preview.id}
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {isTrack && (
              <TrackPreview data={preview} onDownload={handleDownload} playingId={playingId} togglePreview={togglePreview} audioFormat={audioFormat} bitrate={bitrate} />
            )}
            {isPlaylist && (
              <PlaylistPreview data={preview} onDownload={handleDownload} onBatch={handleBatchDownload} playingId={playingId} togglePreview={togglePreview} audioFormat={audioFormat} bitrate={bitrate} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Downloads */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="card">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold text-text-primary">Recent Downloads</h3>
            {downloads.length > 0 && (
              <span className="badge-gray">{downloads.length}</span>
            )}
          </div>
          <div className="divide-y divide-white/5">
            {downloads.length === 0 && !downloadsLoading && (
              <div className="py-16 text-center">
                <Music size={40} className="mx-auto text-text-muted mb-3 opacity-30" />
                <p className="text-text-muted">No downloads yet</p>
              </div>
            )}
            {downloads.map(d => (
              <DownloadItem key={d.id} data={d} onDelete={handleDelete} />
            ))}
            {hasMore && (
              <div className="py-3 text-center">
                <button onClick={() => loadDownloads(page + 1, true)} className="btn-ghost btn-sm text-spotify-green">
                  Load more
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function TrackPreview({ data, onDownload, playingId, togglePreview, audioFormat, bitrate }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col sm:flex-row items-center gap-5 p-6">
        {data.image_url && (
          <img src={data.image_url} className="w-28 h-28 rounded-xl object-cover shadow-xl flex-shrink-0" alt="" />
        )}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="text-xs uppercase tracking-wider text-spotify-green font-medium mb-1">Track</p>
          <h3 className="text-xl font-bold text-text-primary truncate">{data.name}</h3>
          <p className="text-text-secondary mt-0.5">{data.artist}</p>
          {data.duration_ms > 0 && (
            <p className="text-text-muted text-sm mt-1">{formatDuration(data.duration_ms)}</p>
          )}
          <p className="text-text-muted text-xs mt-1">Format: {audioFormat.toUpperCase()} | Bitrate: {bitrate === 'disable' ? 'Original' : bitrate === 'auto' ? 'Auto' : bitrate}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {data.preview_url && (
            <button onClick={() => togglePreview('track', data.preview_url)} className="btn-ghost btn-sm">
              {playingId === 'track' ? <Pause size={16} /> : <Play size={16} />}
              {playingId === 'track' ? 'Pause' : 'Preview'}
            </button>
          )}
          <motion.button onClick={() => onDownload(data)} whileTap={{ scale: 0.95 }} className="btn-primary">
            <Download size={16} /> Download {audioFormat.toUpperCase()}
          </motion.button>
        </div>
      </div>
      {data.url && (
        <div className="px-6 pb-4">
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-xs text-text-muted hover:text-text-secondary inline-flex items-center gap-1 transition-colors">
            Open in Spotify <ExternalLink size={12} />
          </a>
        </div>
      )}
    </div>
  )
}

function PlaylistPreview({ data, onDownload, onBatch, playingId, togglePreview, audioFormat, bitrate }) {
  const [selected, setSelected] = useState(new Set())
  const tracks = data.tracks || []
  const limit = data.batch_limit || 500
  const allSelected = selected.size === tracks.length
  const someSelected = selected.size > 0 && !allSelected

  const toggle = (idx) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(tracks.map((_, i) => i)))
  }

  const typeLabel = data.type === 'album' ? 'Album' : 'Playlist'

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center gap-5 p-6 border-b border-white/5">
        {data.image_url && (
          <img src={data.image_url} className="w-24 h-24 rounded-xl object-cover shadow-xl flex-shrink-0" alt="" />
        )}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="text-xs uppercase tracking-wider text-spotify-green font-medium mb-1">{typeLabel}</p>
          <h3 className="text-xl font-bold text-text-primary truncate">{data.name}</h3>
          <p className="text-text-secondary text-sm mt-0.5">
            {tracks.length} tracks
            {tracks.length > limit && <span className="text-amber-400 ml-2">(limit: {limit})</span>}
            <span className="text-text-muted ml-2">| {audioFormat.toUpperCase()} / {bitrate === 'disable' ? 'Original' : bitrate}</span>
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-white/5 flex items-center gap-3 flex-wrap bg-surface-3/30">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary select-none">
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected }}
            onChange={toggleAll}
            className="w-4 h-4 accent-spotify-green rounded"
          />
          Select all
        </label>
        <span className="text-xs text-text-muted">{selected.size} selected</span>
        <div className="flex-1" />
        <motion.button
          whileTap={{ scale: 0.95 }}
          disabled={selected.size === 0}
          onClick={() => {
            const sel = [...selected].map(i => tracks[i])
            onBatch(sel, data.name, data.type)
          }}
          className="btn-primary btn-sm"
        >
          <Download size={14} /> Download Selected ({audioFormat.toUpperCase()})
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => onBatch(tracks.slice(0, limit), data.name, data.type)}
          className="btn-ghost btn-sm"
        >
          Download All
        </motion.button>
      </div>

      {/* Tracks */}
      <div className="max-h-[480px] overflow-y-auto">
        {tracks.map((t, i) => (
          <div
            key={t.id || i}
            className={`flex items-center gap-3 px-6 py-2.5 border-b border-white/3 transition-colors hover:bg-white/[0.02] ${selected.has(i) ? 'bg-spotify-green/[0.04]' : ''}`}
          >
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => toggle(i)}
              className="w-4 h-4 accent-spotify-green rounded flex-shrink-0"
            />
            <span className="w-7 text-right text-xs text-text-muted flex-shrink-0">{i + 1}</span>
            {t.image_url && <img src={t.image_url} className="w-9 h-9 rounded object-cover flex-shrink-0" alt="" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary truncate">{t.title}</p>
              <p className="text-xs text-text-secondary truncate">{t.artist}</p>
            </div>
            <span className="text-xs text-text-muted flex-shrink-0">{formatDuration(t.duration_ms)}</span>
            {t.preview_url && (
              <button onClick={() => togglePreview(`pl-${i}`, t.preview_url)} className="p-1.5 rounded-lg hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors flex-shrink-0">
                {playingId === `pl-${i}` ? <Pause size={14} /> : <Play size={14} />}
              </button>
            )}
            <button onClick={() => onDownload(t)} className="p-1.5 rounded-lg hover:bg-white/5 text-text-muted hover:text-spotify-green transition-colors flex-shrink-0">
              <Download size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function DownloadItem({ data, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  const statusColors = {
    pending: 'badge-yellow',
    processing: 'badge-blue',
    completed: 'badge-green',
    failed: 'badge-red',
  }

  return (
    <div className="flex items-center gap-4 px-6 py-3 hover:bg-white/[0.02] transition-colors group">
      {data.image_url ? (
        <img src={data.image_url} className="w-11 h-11 rounded-lg object-cover flex-shrink-0" alt="" />
      ) : (
        <div className="w-11 h-11 rounded-lg bg-surface-4 flex items-center justify-center flex-shrink-0">
          <Music size={18} className="text-text-muted" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{data.title || 'Processing...'}</p>
        <p className="text-xs text-text-secondary truncate">{data.artist}</p>
        <p className="text-[11px] text-text-muted mt-0.5">{timeAgo(data.created_at)}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {data.status === 'completed' && data.filename ? (
          <>
            <a href={`/api/download/file/${data.id}`} className="btn-primary btn-sm">
              <Download size={14} /> MP3
            </a>
            {confirming ? (
              <div className="flex items-center gap-1">
                <button onClick={() => onDelete(data.id)} className="btn-danger btn-sm !px-2"><Check size={14} /></button>
                <button onClick={() => setConfirming(false)} className="btn-ghost btn-sm !px-2"><X size={14} /></button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} className="btn-ghost btn-sm !px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={14} />
              </button>
            )}
          </>
        ) : data.status === 'failed' ? (
          <span className="badge-red">Failed</span>
        ) : (
          <span className={statusColors[data.status] || 'badge-gray'}>
            <Loader2 size={12} className="animate-spin-slow" />
            {data.status}
          </span>
        )}
      </div>
    </div>
  )
}
