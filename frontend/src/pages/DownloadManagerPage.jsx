import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { formatDuration, timeAgo } from '../lib/utils'
import {
  Download, Music, Loader2, CheckCircle, XCircle, Ban,
  Trash2, X, PackageOpen, RefreshCw, ArrowLeft, ChevronDown, ChevronUp, Check
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Progress } from '../components/ui/Progress'

export default function DownloadManagerPage() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const esRef = useRef(null)

  const loadDownloads = useCallback(async (p = 1, append = false) => {
    try {
      const data = await api.getDownloads(p)
      if (append) {
        setItems(prev => [...prev, ...data.downloads])
      } else {
        setItems(data.downloads || [])
      }
      setHasMore(data.has_more || false)
      setPage(p)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadDownloads() }, [loadDownloads])

  useEffect(() => {
    const connect = () => {
      const es = new EventSource('/api/events')
      esRef.current = es

      const handleUpdate = (e) => {
        try {
          const data = JSON.parse(e.data)
          setItems(prev => {
            const idx = prev.findIndex(d => d.id === data.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], ...data }
              return next
            }
            return [{ id: data.id, title: data.title, artist: data.artist, status: data.status, image_url: null, created_at: new Date().toISOString() }, ...prev]
          })
        } catch {}
      }

      const handleComplete = (e) => {
        try {
          const data = JSON.parse(e.data)
          setItems(prev => {
            const idx = prev.findIndex(d => d.id === data.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], status: 'completed', filename: data.filename }
              return next
            }
            return prev
          })
        } catch {}
      }

      const handleFailed = (e) => {
        try {
          const data = JSON.parse(e.data)
          setItems(prev => {
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
          setItems(prev => {
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

  const handleDelete = async (id) => {
    try {
      await api.deleteDownload(id)
      setItems(prev => prev.filter(d => d.id !== id))
      toast.success('Deleted')
    } catch {
      toast.error('Delete failed')
    }
  }

  const handleCancel = async (id) => {
    try {
      const res = await api.cancelDownload(id)
      if (res.error) toast.error(res.error)
      else {
        setItems(prev => prev.map(d => d.id === id ? { ...d, status: 'cancelled' } : d))
        toast.success('Download cancelled')
      }
    } catch {
      toast.error('Cancel failed')
    }
  }

  const handleCancelAll = async () => {
    try {
      const res = await api.cancelAllDownloads()
      if (res.error) toast.error(res.error)
      else {
        setItems(prev => prev.map(d =>
          (d.status === 'pending' || d.status === 'processing' || d.status === 'searching')
            ? { ...d, status: 'cancelled' } : d
        ))
        toast.success(res.message || 'All downloads cancelled')
      }
    } catch {
      toast.error('Cancel failed')
    }
  }

  const active = items.filter(d => d.status === 'pending' || d.status === 'processing' || d.status === 'searching')
  const completed = items.filter(d => d.status === 'completed')
  const failed = items.filter(d => d.status === 'failed')
  const cancelled = items.filter(d => d.status === 'cancelled')

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-heading font-bold text-nb-foreground">Download Manager</h2>
        <p className="text-nb-muted mt-1 font-heading">Track and manage all your downloads</p>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatsCard label="Active" value={active.length} color="bg-nb-main" />
          <StatsCard label="Completed" value={completed.length} color="bg-nb-foreground" />
          <StatsCard label="Failed" value={failed.length} color="bg-nb-danger" />
          <StatsCard label="Total" value={items.length} color="bg-nb-info" />
        </div>
      </motion.div>

      {/* Batch Progress */}
      {active.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Loader2 size={18} className="text-nb-foreground animate-spin-slow" />
                  <CardTitle>Active Downloads</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={handleCancelAll} className="text-nb-danger hover:bg-nb-danger/10">
                  <Ban size={14} /> Cancel All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Progress value={items.length > 0 ? (completed.length / items.length * 100) : 0} />
                <p className="text-xs text-nb-muted font-heading text-center">
                  {completed.length} of {items.length} completed ({items.length > 0 ? Math.round(completed.length / items.length * 100) : 0}%)
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Download List */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2"
              >
                <CardTitle>All Downloads</CardTitle>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => loadDownloads()} className="text-nb-foreground">
                  <RefreshCw size={14} /> Refresh
                </Button>
              </div>
            </div>
          </CardHeader>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="divide-y-2 divide-nb-border">
                  {loading && items.length === 0 ? (
                    <div className="py-16 text-center">
                      <div className="w-8 h-8 border-2 border-nb-border border-t-nb-main rounded-full animate-spin-slow mx-auto" />
                    </div>
                  ) : items.length === 0 ? (
                    <div className="py-16 text-center">
                      <Download size={40} className="mx-auto text-nb-foreground mb-3" />
                      <p className="text-nb-muted font-heading font-semibold">No downloads yet</p>
                      <p className="text-nb-muted2 text-sm mt-1 font-heading">Start a download from the dashboard</p>
                    </div>
                  ) : (
                    items.map((d, i) => (
                      <DownloadRow
                        key={d.id}
                        data={d}
                        index={i}
                        onDelete={handleDelete}
                        onCancel={handleCancel}
                      />
                    ))
                  )}
                </div>

                {hasMore && (
                  <div className="py-3 text-center border-t-2 border-nb-border">
                    <Button variant="ghost" size="sm" onClick={() => loadDownloads(page + 1, true)}>
                      Load more
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>
    </div>
  )
}

function StatsCard({ label, value, color }) {
  return (
    <div
      className="rounded-nb p-4 flex flex-col items-center justify-center"
      style={{ borderWidth: '3px', borderStyle: 'solid', borderColor: '#000000' }}
    >
      <span className="text-2xl font-heading font-bold text-nb-foreground">{value}</span>
      <span className="text-xs text-nb-muted font-heading font-semibold mt-1">{label}</span>
    </div>
  )
}

function DownloadRow({ data, index, onDelete, onCancel }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isActive = data.status === 'pending' || data.status === 'processing' || data.status === 'searching'

  const statusConfig = {
    pending: { badge: 'warning', label: 'Queued' },
    processing: { badge: 'info', label: 'Processing' },
    searching: { badge: 'info', label: `Searching ${data.source || ''}` },
    completed: { badge: 'default', label: 'Done' },
    failed: { badge: 'danger', label: 'Failed' },
    cancelled: { badge: 'muted', label: 'Cancelled' },
  }
  const config = statusConfig[data.status] || statusConfig.muted

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className="flex items-center gap-3 px-4 py-3 hover:bg-nb-secondary/30 transition-colors group"
    >
      {data.image_url ? (
        <img src={data.image_url} className="w-10 h-10 rounded-nb object-cover border-2 border-nb-border flex-shrink-0" alt="" />
      ) : (
        <div className="w-10 h-10 rounded-nb bg-nb-surface2 border-2 border-nb-border flex items-center justify-center flex-shrink-0">
          <Music size={14} className="text-nb-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-heading font-semibold text-nb-foreground truncate">{data.title || 'Processing...'}</p>
        <p className="text-xs text-nb-muted truncate">{data.artist}</p>
        {isActive && (
          <div className="mt-1.5">
            <Progress value={0} className="h-2" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {data.status === 'completed' && data.filename ? (
          <>
            <a href={`/api/download/file/${data.id}`}>
              <Button size="sm"><Download size={14} /> {data.filename?.split('.').pop()?.toUpperCase() || 'File'}</Button>
            </a>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button variant="danger" size="icon-sm" onClick={() => { onDelete(data.id); setConfirmDelete(false) }}><Check size={14} /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(false)}><X size={14} /></Button>
              </div>
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(true)} className="text-nb-foreground hover:text-nb-danger">
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
              className="text-nb-foreground hover:text-nb-danger hover:bg-nb-danger/10"
              title="Cancel"
            >
              <XCircle size={14} />
            </Button>
          </>
        )}
      </div>
    </motion.div>
  )
}
