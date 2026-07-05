import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { formatDuration, timeAgo } from '../lib/utils'
import { motion } from 'framer-motion'
import { ArrowLeft, Download, Play, Pause, Loader2, Disc3, List, Music, PackageOpen, Trash2, X, Check } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Card, CardContent, CardHeader } from '../components/ui/Card'

export default function HistoryDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const [item, setItem] = useState(null)
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [zipAvailable, setZipAvailable] = useState(false)
  const [playingId, setPlayingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
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

  const handleDelete = async () => {
    try {
      const res = await api.deleteHistory(id)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('History deleted')
        window.location.href = '/history'
      }
    } catch {
      toast.error('Delete failed')
    }
  }

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
        <div className="w-8 h-8 border-2 border-nb-border border-t-nb-main rounded-full animate-spin-slow mx-auto" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="py-20 text-center text-nb-muted">
        <p className="font-heading font-semibold">History entry not found</p>
        <Link to="/history"><Button variant="ghost" className="mt-4"><ArrowLeft size={16} /> Back</Button></Link>
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
      <div className="flex items-center justify-between">
        <Link to="/history" className="inline-flex items-center gap-2 text-nb-muted hover:text-nb-foreground transition-colors text-sm font-heading font-semibold">
          <ArrowLeft size={16} /> Back to History
        </Link>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <Button variant="danger" size="sm" onClick={handleDelete}><Check size={14} /> Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}><X size={14} /> Cancel</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-nb-foreground hover:text-nb-danger">
            <Trash2 size={14} /> Delete
          </Button>
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-center gap-5">
              {item.image_url ? (
                <img src={item.image_url} className="w-24 h-24 rounded-nb object-cover border-2 border-nb-border shadow-nb flex-shrink-0" alt="" />
              ) : (
                <div className="w-24 h-24 rounded-nb bg-nb-surface2 border-2 border-nb-border flex items-center justify-center flex-shrink-0">
                  <Icon size={32} className="text-nb-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <Badge className="mb-2">{typeLabel}</Badge>
                <h2 className="text-2xl font-heading font-bold text-nb-foreground">{item.collection_name}</h2>
                <p className="text-nb-muted text-sm mt-1 font-heading">
                  {tracks.length} tracks &middot; {timeAgo(item.created_at)}
                  {completedCount > 0 && <span className="text-nb-main ml-2">| {completedCount} downloaded</span>}
                  {processingCount > 0 && <span className="text-nb-info ml-2">| {processingCount} processing</span>}
                </p>
              </div>
            </div>
          </CardHeader>

          {isMultiTrack && (
            <div className="px-6 py-3 border-t-2 border-nb-border flex items-center gap-3 flex-wrap bg-nb-secondary">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-nb-muted font-heading font-semibold select-none">
                <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected }} onChange={toggleAll} className="w-4 h-4 accent-nb-main rounded" />
                Select all
              </label>
              <span className="text-xs text-nb-muted2 font-heading">{selected.size} selected</span>
              <div className="flex-1" />
              {selected.size > 0 && (
                <Button size="sm" onClick={downloadSelected}>
                  <Download size={14} /> Download Selected ({selected.size})
                </Button>
              )}
              {zipAvailable && item.batch_id && (
                <a href={`/api/download/batch/${item.batch_id}/zip`}>
                  <Button size="sm"><PackageOpen size={14} /> Download ZIP</Button>
                </a>
              )}
              <Button variant="ghost" size="sm" onClick={downloadAll}>Download All</Button>
            </div>
          )}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <div className="divide-y-2 divide-nb-border">
            {tracks.map((t, i) => (
              <motion.div
                key={t.dl_id || t.id || i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`flex items-center gap-3 px-6 py-3 transition-colors hover:bg-nb-secondary/50 ${selected.has(i) ? 'bg-nb-main/5' : ''}`}
              >
                {isMultiTrack && (
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)} className="w-4 h-4 accent-nb-main rounded flex-shrink-0" />
                )}
                <span className="w-7 text-right text-xs text-nb-muted2 font-heading flex-shrink-0">{t.index || i + 1}</span>
                {t.image_url ? (
                  <img src={t.image_url} className="w-10 h-10 rounded-nb object-cover border-2 border-nb-border flex-shrink-0" alt="" />
                ) : item.image_url ? (
                  <img src={item.image_url} className="w-10 h-10 rounded-nb object-cover border-2 border-nb-border flex-shrink-0" alt="" />
                ) : (
                  <div className="w-10 h-10 rounded-nb bg-nb-surface2 border-2 border-nb-border flex items-center justify-center flex-shrink-0">
                    <Music size={14} className="text-nb-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-heading font-semibold text-nb-foreground truncate">{t.title}</p>
                  <p className="text-xs text-nb-muted truncate">{t.artist}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {t.preview_url && (
                    <Button variant="ghost" size="icon-sm" onClick={() => togglePreview(i, t.preview_url)}>
                      {playingId === i ? <Pause size={14} /> : <Play size={14} />}
                    </Button>
                  )}
                  {t.dl_status === 'completed' && t.dl_id ? (
                    <a href={`/api/download/file/${t.dl_id}`}>
                      <Button size="sm"><Download size={14} /> {t.dl_filename?.split('.').pop()?.toUpperCase() || 'File'}</Button>
                    </a>
                  ) : t.dl_status === 'processing' || t.dl_status === 'pending' ? (
                    <Badge variant="info"><Loader2 size={12} className="animate-spin-slow" /> {t.dl_status}</Badge>
                  ) : t.dl_status === 'failed' ? (
                    <Button variant="ghost" size="icon-sm" onClick={() => downloadSingle(t)} title="Retry download">
                      <Download size={14} />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon-sm" onClick={() => downloadSingle(t)} title="Download">
                      <Download size={14} />
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
