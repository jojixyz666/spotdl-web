import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { formatDuration, timeAgo } from '../lib/utils'
import { motion } from 'framer-motion'
import { ArrowLeft, Download, Play, Pause, Loader2, Disc3, List, Music, PackageOpen } from 'lucide-react'

export default function HistoryDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const [item, setItem] = useState(null)
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [zipAvailable, setZipAvailable] = useState(false)
  const [playingId, setPlayingId] = useState(null)
  const audioRef = useRef(null)

  const loadDetail = () => {
    setLoading(true)
    api.getHistoryDetail(id).then(data => {
      setItem(data)
      const trackData = Array.isArray(data.track_data) ? data.track_data : []
      const downloads = Array.isArray(data.downloads) ? data.downloads : []
      const merged = trackData.map((t, i) => {
        const dl = downloads.find(d =>
          d.spotify_url === t.url || d.title === t.title
        )
        return {
          ...t,
          dl_status: dl?.status || null,
          dl_id: dl?.id || null,
          dl_filename: dl?.filename || null,
        }
      })
      setTracks(merged.length > 0 ? merged : downloads.map(d => ({
        title: d.title,
        artist: d.artist,
        url: d.spotify_url,
        dl_status: d.status,
        dl_id: d.id,
        dl_filename: d.filename,
      })))
      setZipAvailable(data.zip_available || false)
    }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false))
  }

  useEffect(() => { loadDetail() }, [id])

  const togglePreview = (idx, src) => {
    if (audioRef.current) {
      audioRef.current.pause()
      if (playingId === idx) { setPlayingId(null); return }
    }
    const audio = new Audio(src)
    audio.play()
    audio.onended = () => setPlayingId(null)
    audioRef.current = audio
    setPlayingId(idx)
  }

  const toggleSelect = (idx) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === tracks.length) setSelected(new Set())
    else setSelected(new Set(tracks.map((_, i) => i)))
  }

  const downloadSingle = (t) => {
    api.downloadTrack({
      url: t.url,
      name: t.title,
      artist: t.artist,
      image_url: t.image_url,
      preview_url: t.preview_url,
    }).then(res => {
      if (res.error) toast.error(res.error)
      else toast.success(`Downloading: ${t.artist} - ${t.title}`)
    }).catch(() => toast.error('Download failed'))
  }

  const downloadSelected = () => {
    const sel = [...selected].map(i => tracks[i])
    if (sel.length === 0) return
    api.downloadBatch(sel, item.collection_name, item.content_type, true).then(res => {
      if (res.error) toast.error(res.error)
      else toast.success(`Downloading ${sel.length} tracks...`)
    }).catch(() => toast.error('Batch download failed'))
  }

  const downloadAll = () => {
    api.downloadBatch(tracks, item.collection_name, item.content_type, true).then(res => {
      if (res.error) toast.error(res.error)
      else toast.success(`Downloading all ${tracks.length} tracks...`)
    }).catch(() => toast.error('Batch download failed'))
  }

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-2 border-surface-5 border-t-spotify-green rounded-full animate-spin-slow mx-auto" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="py-20 text-center text-text-muted">
        <p>History entry not found</p>
        <Link to="/history" className="btn-ghost mt-4 inline-flex"><ArrowLeft size={16} /> Back</Link>
      </div>
    )
  }

  const typeLabel = item.content_type === 'album' ? 'Album' : item.content_type === 'playlist' ? 'Playlist' : 'Track'
  const Icon = item.content_type === 'album' ? Disc3 : item.content_type === 'playlist' ? List : Music
  const isMultiTrack = item.content_type !== 'track' && tracks.length > 1
  const allSelected = selected.size === tracks.length && tracks.length > 0
  const someSelected = selected.size > 0 && !allSelected
  const completedCount = tracks.filter(t => t.dl_status === 'completed').length
  const processingCount = tracks.filter(t => t.dl_status === 'pending' || t.dl_status === 'processing').length

  return (
    <div className="space-y-6">
      <Link to="/history" className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors text-sm">
        <ArrowLeft size={16} /> Back to History
      </Link>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center gap-5 p-6">
          {item.image_url ? (
            <img src={item.image_url} className="w-24 h-24 rounded-xl object-cover shadow-xl flex-shrink-0" alt="" />
          ) : (
            <div className="w-24 h-24 rounded-xl bg-surface-4 flex items-center justify-center flex-shrink-0">
              <Icon size={32} className="text-text-muted" />
            </div>
          )}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <p className="text-xs uppercase tracking-wider text-spotify-green font-medium mb-1">{typeLabel}</p>
            <h2 className="text-2xl font-bold text-text-primary">{item.collection_name}</h2>
            <p className="text-text-secondary text-sm mt-1">
              {tracks.length} tracks &middot; {timeAgo(item.created_at)}
              {completedCount > 0 && <span className="text-spotify-green ml-2">| {completedCount} downloaded</span>}
              {processingCount > 0 && <span className="text-blue-400 ml-2">| {processingCount} processing</span>}
            </p>
          </div>
        </div>

        {isMultiTrack && (
          <div className="px-6 py-3 border-t border-white/5 flex items-center gap-3 flex-wrap bg-surface-3/30">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary select-none">
              <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected }} onChange={toggleAll} className="w-4 h-4 accent-spotify-green rounded" />
              Select all
            </label>
            <span className="text-xs text-text-muted">{selected.size} selected</span>
            <div className="flex-1" />
            {selected.size > 0 && (
              <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} onClick={downloadSelected} className="btn-primary btn-sm">
                <Download size={14} /> Download Selected ({selected.size})
              </motion.button>
            )}
            {zipAvailable && item.batch_id && (
              <a href={`/api/download/batch/${item.batch_id}/zip`} className="btn-primary btn-sm">
                <PackageOpen size={14} /> Download ZIP
              </a>
            )}
            <button onClick={downloadAll} className="btn-ghost btn-sm">Download All</button>
          </div>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card">
        <div className="divide-y divide-white/3">
          {tracks.map((t, i) => (
            <motion.div
              key={t.dl_id || t.id || i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className={`flex items-center gap-3 px-6 py-3 transition-colors hover:bg-white/[0.02] ${selected.has(i) ? 'bg-spotify-green/[0.04]' : ''}`}
            >
              {isMultiTrack && (
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)} className="w-4 h-4 accent-spotify-green rounded flex-shrink-0" />
              )}
              <span className="w-7 text-right text-xs text-text-muted flex-shrink-0">{t.index || i + 1}</span>
              {t.image_url ? (
                <img src={t.image_url} className="w-10 h-10 rounded object-cover flex-shrink-0" alt="" />
              ) : item.image_url ? (
                <img src={item.image_url} className="w-10 h-10 rounded object-cover flex-shrink-0" alt="" />
              ) : (
                <div className="w-10 h-10 rounded bg-surface-4 flex items-center justify-center flex-shrink-0">
                  <Music size={14} className="text-text-muted" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{t.title}</p>
                <p className="text-xs text-text-secondary truncate">{t.artist}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {t.preview_url && (
                  <button onClick={() => togglePreview(i, t.preview_url)} className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors">
                    {playingId === i ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                )}
                {t.dl_status === 'completed' && t.dl_id ? (
                  <a href={`/api/download/file/${t.dl_id}`} className="btn-primary btn-sm">
                    <Download size={14} /> {t.dl_filename?.split('.').pop()?.toUpperCase() || 'File'}
                  </a>
                ) : t.dl_status === 'processing' || t.dl_status === 'pending' ? (
                  <span className="badge-blue"><Loader2 size={12} className="animate-spin-slow" /> {t.dl_status}</span>
                ) : t.dl_status === 'failed' ? (
                  <button onClick={() => downloadSingle(t)} className="btn-ghost btn-sm !px-2 text-red-400" title="Retry download">
                    <Download size={14} />
                  </button>
                ) : (
                  <button onClick={() => downloadSingle(t)} className="btn-ghost btn-sm !px-2" title="Download">
                    <Download size={14} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
