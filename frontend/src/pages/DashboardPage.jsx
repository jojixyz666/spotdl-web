import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { api } from '../lib/api'
import { formatDuration, timeAgo } from '../lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Play, Pause, Download, Music, ExternalLink, Check, Loader2, Trash2, X, XCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Select } from '../components/ui/Select'

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
  const esRef = useRef(null)

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

  useEffect(() => { loadDownloads() }, [loadDownloads])

  useEffect(() => {
    const connect = () => {
      const es = new EventSource('/api/events')
      esRef.current = es

      const handleUpdate = (e) => {
        try {
          const data = JSON.parse(e.data)
          setDownloads(prev => {
            const idx = prev.findIndex(d => d.id === data.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], status: data.status, source: data.source }
              return next
            }
            return [{ id: data.id, title: data.title, artist: data.artist, status: data.status, image_url: null, created_at: new Date().toISOString() }, ...prev]
          })
        } catch {}
      }

      const handleComplete = (e) => {
        try {
          const data = JSON.parse(e.data)
          setDownloads(prev => {
            const idx = prev.findIndex(d => d.id === data.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], status: 'completed', filename: data.filename }
              return next
            }
            return [{ id: data.id, title: data.title, artist: data.artist, status: 'completed', filename: data.filename, created_at: new Date().toISOString() }, ...prev]
          })
        } catch {}
      }

      const handleFailed = (e) => {
        try {
          const data = JSON.parse(e.data)
          setDownloads(prev => {
            const idx = prev.findIndex(d => d.id === data.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], status: 'failed' }
              return next
            }
            return prev
          })
        } catch {}
      }

      const handleCancelled = (e) => {
        try {
          const data = JSON.parse(e.data)
          setDownloads(prev => {
            const idx = prev.findIndex(d => d.id === data.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], status: 'cancelled' }
              return next
            }
            return prev
          })
        } catch {}
      }

      es.addEventListener('download_update', handleUpdate)
      es.addEventListener('download_complete', handleComplete)
      es.addEventListener('download_failed', handleFailed)
      es.addEventListener('download_cancelled', handleCancelled)

      es.onerror = () => {
        es.close()
        setTimeout(connect, 5000)
      }
    }

    connect()
    return () => esRef.current?.close()
  }, [])

  const handleSearch = async () => {
    if (!url.trim()) return
    setLoading(true)
    setPreview(null)
    try {
      const data = await api.preview(url, audioFormat, bitrate)
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
      const res = await api.downloadTrack({ ...track, audio_format: audioFormat, bitrate })
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
      const res = await api.downloadBatch(tracks, name, type, false, audioFormat, bitrate)
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

  const handleCancel = async (id) => {
    try {
      const res = await api.cancelDownload(id)
      if (res.error) {
        toast.error(res.error)
      } else {
        setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'cancelled' } : d))
        toast.success('Download cancelled')
      }
    } catch {
      toast.error('Cancel failed')
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
        <h2 className="text-2xl font-heading font-bold text-nb-foreground">Welcome back, {user?.username}</h2>
        <p className="text-nb-muted mt-1 font-heading">Paste a Spotify link to download tracks, albums, or playlists</p>
      </motion.div>

      {/* Search */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <CardContent>
            <div className="flex gap-3">
              <Input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="flex-1"
                placeholder="https://open.spotify.com/track/... or /album/... or /playlist/..."
              />
              <Button onClick={handleSearch} disabled={loading || !url.trim()}>
                {loading ? <Loader2 size={18} className="animate-spin-slow" /> : <><Search size={18} /> Search</>}
              </Button>
            </div>
            <div className="flex gap-4 mt-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-nb-muted2 font-heading font-semibold uppercase tracking-wider">Format</label>
                <Select value={audioFormat} onChange={e => setAudioFormat(e.target.value)} className="w-auto py-1.5 px-3 text-sm">
                  <option value="mp3">MP3</option>
                  <option value="flac">FLAC</option>
                  <option value="m4a">M4A</option>
                  <option value="opus">OPUS</option>
                  <option value="ogg">OGG</option>
                  <option value="wav">WAV</option>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-nb-muted2 font-heading font-semibold uppercase tracking-wider">Bitrate</label>
                <Select value={bitrate} onChange={e => setBitrate(e.target.value)} className="w-auto py-1.5 px-3 text-sm">
                  <option value="disable">Original (No Convert)</option>
                  <option value="auto">Auto</option>
                  <option value="128k">128 kbps</option>
                  <option value="192k">192 kbps</option>
                  <option value="256k">256 kbps</option>
                  <option value="320k">320 kbps</option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Downloads</CardTitle>
              {downloads.length > 0 && (
                <Badge variant="neutral">{downloads.length}</Badge>
              )}
            </div>
          </CardHeader>
          <div className="divide-y-2 divide-nb-border">
            {downloads.length === 0 && !downloadsLoading && (
              <div className="py-16 text-center">
                <Music size={40} className="mx-auto text-nb-foreground mb-3" />
                <p className="text-nb-muted font-heading font-semibold">No downloads yet</p>
              </div>
            )}
            {downloads.map(d => (
              <DownloadItem key={d.id} data={d} onDelete={handleDelete} onCancel={handleCancel} />
            ))}
            {hasMore && (
              <div className="py-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => loadDownloads(page + 1, true)} className="text-nb-main">
                  Load more
                </Button>
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

function TrackPreview({ data, onDownload, playingId, togglePreview, audioFormat, bitrate }) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-5">
          {data.image_url && (
            <img src={data.image_url} className="w-28 h-28 rounded-nb object-cover border-2 border-nb-border shadow-nb flex-shrink-0" alt="" />
          )}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <Badge className="mb-2">Track</Badge>
            <h3 className="text-xl font-heading font-bold text-nb-foreground truncate">{data.name}</h3>
            <p className="text-nb-muted mt-0.5 font-heading">{data.artist}</p>
            {data.duration_ms > 0 && (
              <p className="text-nb-muted2 text-sm mt-1 font-heading">{formatDuration(data.duration_ms)}</p>
            )}
            <p className="text-nb-muted2 text-xs mt-1 font-heading">Format: {audioFormat.toUpperCase()} | Bitrate: {bitrate === 'disable' ? 'Original' : bitrate === 'auto' ? 'Auto' : bitrate} | Est: {data.estimated_size_mb ? `~${data.estimated_size_mb} MB` : '...'}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {data.preview_url && (
              <Button variant="ghost" size="sm" onClick={() => togglePreview('track', data.preview_url)}>
                {playingId === 'track' ? <Pause size={16} /> : <Play size={16} />}
                {playingId === 'track' ? 'Pause' : 'Preview'}
              </Button>
            )}
            <Button onClick={() => onDownload(data)}>
              <Download size={16} /> Download {audioFormat.toUpperCase()}
            </Button>
          </div>
        </div>
        {data.url && (
          <div className="mt-4">
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-xs text-nb-muted2 hover:text-nb-foreground inline-flex items-center gap-1 transition-colors font-heading">
              Open in Spotify <ExternalLink size={12} />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
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
    <Card>
      {/* Header */}
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-center gap-5">
          {data.image_url && (
            <img src={data.image_url} className="w-24 h-24 rounded-nb object-cover border-2 border-nb-border shadow-nb flex-shrink-0" alt="" />
          )}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <Badge className="mb-2">{typeLabel}</Badge>
            <h3 className="text-xl font-heading font-bold text-nb-foreground truncate">{data.name}</h3>
            <p className="text-nb-muted text-sm mt-0.5 font-heading">
              {tracks.length} tracks
              {tracks.length > limit && <span className="text-nb-warning ml-2">(limit: {limit})</span>}
              <span className="text-nb-muted2 ml-2">| {audioFormat.toUpperCase()} / {bitrate === 'disable' ? 'Original' : bitrate}</span>
              {data.estimated_size_mb > 0 && <span className="text-nb-muted2 ml-2">| ~{data.estimated_size_mb} MB total</span>}
            </p>
          </div>
        </div>
      </CardHeader>

      {/* Toolbar */}
      <div className="px-6 py-3 border-t-2 border-b-2 border-nb-border flex items-center gap-3 flex-wrap bg-nb-secondary">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-nb-muted font-heading font-semibold select-none">
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected }}
            onChange={toggleAll}
            className="w-4 h-4 accent-nb-main rounded"
          />
          Select all
        </label>
        <span className="text-xs text-nb-muted2 font-heading">{selected.size} selected</span>
        <div className="flex-1" />
        <Button
          size="sm"
          disabled={selected.size === 0}
          onClick={() => {
            const sel = [...selected].map(i => tracks[i])
            onBatch(sel, data.name, data.type)
          }}
        >
          <Download size={14} /> Download Selected ({audioFormat.toUpperCase()})
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onBatch(tracks.slice(0, limit), data.name, data.type)}
        >
          Download All
        </Button>
      </div>

      {/* Tracks */}
      <div className="max-h-[480px] overflow-y-auto divide-y divide-nb-border/50">
        {tracks.map((t, i) => (
          <div
            key={t.id || i}
            className={`flex items-center gap-3 px-6 py-2.5 transition-colors hover:bg-nb-secondary/50 ${selected.has(i) ? 'bg-nb-main/5' : ''}`}
          >
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => toggle(i)}
              className="w-4 h-4 accent-nb-main rounded flex-shrink-0"
            />
            <span className="w-7 text-right text-xs text-nb-muted2 font-heading flex-shrink-0">{i + 1}</span>
            {t.image_url && <img src={t.image_url} className="w-9 h-9 rounded-nb object-cover border border-nb-border flex-shrink-0" alt="" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-heading font-semibold text-nb-foreground truncate">{t.title}</p>
              <p className="text-xs text-nb-muted truncate">{t.artist}</p>
            </div>
            <span className="text-xs text-nb-muted2 font-heading flex-shrink-0">{formatDuration(t.duration_ms)}</span>
            {t.estimated_size_mb > 0 && <span className="text-xs text-nb-muted2 font-heading flex-shrink-0">~{t.estimated_size_mb}MB</span>}
            {t.preview_url && (
              <Button variant="ghost" size="icon-sm" onClick={() => togglePreview(`pl-${i}`, t.preview_url)}>
                {playingId === `pl-${i}` ? <Pause size={14} /> : <Play size={14} />}
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => onDownload(t)}>
              <Download size={14} />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}

function DownloadItem({ data, onDelete, onCancel }) {
  const [confirming, setConfirming] = useState(false)

  const statusConfig = {
    pending: { badge: 'warning', label: 'Queued' },
    processing: { badge: 'info', label: 'Processing...' },
    searching: { badge: 'info', label: `Searching ${data.source || ''}...` },
    completed: { badge: 'default', label: 'Completed' },
    failed: { badge: 'danger', label: 'Failed' },
    cancelled: { badge: 'muted', label: 'Cancelled' },
  }

  const config = statusConfig[data.status] || statusConfig.muted
  const isActive = data.status === 'pending' || data.status === 'processing' || data.status === 'searching'

  return (
    <div className="flex items-center gap-4 px-6 py-3 hover:bg-nb-secondary/30 transition-colors group">
      {data.image_url ? (
        <img src={data.image_url} className="w-11 h-11 rounded-nb object-cover border-2 border-nb-border flex-shrink-0" alt="" />
      ) : (
        <div className="w-11 h-11 rounded-nb bg-nb-surface2 border-2 border-nb-border flex items-center justify-center flex-shrink-0">
          <Music size={18} className="text-nb-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-heading font-semibold text-nb-foreground truncate">{data.title || 'Processing...'}</p>
        <p className="text-xs text-nb-muted truncate">{data.artist}</p>
        <p className="text-[11px] text-nb-muted2 mt-0.5 font-heading">{timeAgo(data.created_at)}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {data.status === 'completed' && data.filename ? (
          <>
            <a href={`/api/download/file/${data.id}`}>
              <Button size="sm"><Download size={14} /> {data.filename?.split('.').pop()?.toUpperCase() || 'File'}</Button>
            </a>
            {confirming ? (
              <div className="flex items-center gap-1">
                <Button variant="danger" size="icon-sm" onClick={() => onDelete(data.id)}><Check size={14} /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setConfirming(false)}><X size={14} /></Button>
              </div>
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={() => setConfirming(true)} className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <Trash2 size={14} />
              </Button>
            )}
          </>
        ) : data.status === 'cancelled' ? (
          <Badge variant="muted">Cancelled</Badge>
        ) : data.status === 'failed' ? (
          <Badge variant="danger">Failed</Badge>
        ) : (
          <>
            <Badge variant={config.badge} className="flex items-center gap-1.5">
              {isActive && <Loader2 size={12} className="animate-spin-slow" />}
              {config.label}
            </Badge>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onCancel(data.id)}
              className="text-nb-muted2 hover:text-nb-danger sm:opacity-0 sm:group-hover:opacity-100"
              title="Cancel download"
            >
              <XCircle size={14} />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
