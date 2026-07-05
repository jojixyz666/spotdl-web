import { useState, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { api } from '../lib/api'
import { formatDuration } from '../lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Play, Pause, Download, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { Select } from '../components/ui/Select'

export default function DashboardPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const previewAudio = useRef(null)
  const [playingId, setPlayingId] = useState(null)
  const [audioFormat, setAudioFormat] = useState('mp3')
  const [bitrate, setBitrate] = useState('128k')

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
      }
    } catch {
      toast.error('Batch download failed')
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
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-heading font-bold text-nb-foreground">Welcome back, {user?.username}</h2>
        <p className="text-nb-muted mt-1 font-heading">Paste a Spotify link to preview and download tracks, albums, or playlists</p>
      </motion.div>

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
