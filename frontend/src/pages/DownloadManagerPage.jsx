import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { formatDuration, timeAgo } from '../lib/utils'
import {
  Download, Music, Loader2, XCircle, Ban,
  Trash2, X,
  RefreshCw, ChevronDown, ChevronUp, Check,
  Archive, Folder, HardDrive, ListMusic,
  Pause, CheckCircle, AlertCircle
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
      es.addEventListener('batch_complete', () => { loadDownloads() })

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

  const batches = useMemo(() => {
    const batchMap = {}
    const singles = []

    items.forEach(d => {
      if (d.batch_id) {
        if (!batchMap[d.batch_id]) {
          batchMap[d.batch_id] = {
            batch_id: d.batch_id,
            collection_name: d.collection_name || 'Batch Download',
            downloads: [],
          }
        }
        batchMap[d.batch_id].downloads.push(d)
      } else {
        singles.push(d)
      }
    })

    const batchList = Object.values(batchMap).map(b => {
      const total = b.downloads.length
      const completedCount = b.downloads.filter(d => d.status === 'completed').length
      const failedCount = b.downloads.filter(d => d.status === 'failed').length
      const activeCount = b.downloads.filter(d => ['pending', 'processing', 'searching'].includes(d.status)).length
      const firstImage = b.downloads.find(d => d.image_url)?.image_url
      return {
        ...b,
        total,
        completed: completedCount,
        failed: failedCount,
        active: activeCount,
        allDone: completedCount + failedCount >= total && total > 0,
        progress: total > 0 ? (completedCount / total) * 100 : 0,
        coverImage: firstImage,
      }
    })

    batchList.sort((a, b) => {
      const aActive = a.downloads.some(d => ['pending', 'processing', 'searching'].includes(d.status))
      const bActive = b.downloads.some(d => ['pending', 'processing', 'searching'].includes(d.status))
      if (aActive && !bActive) return -1
      if (!aActive && bActive) return 1
      return 0
    })

    return { batchList, singles }
  }, [items])

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-heading font-bold text-nb-foreground">Download Manager</h2>
        <p className="text-nb-muted mt-1 font-heading">Track and manage all your downloads</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatsCard label="Active" value={active.length} color="bg-nb-main" icon={<Loader2 size={16} className="animate-spin-slow" />} />
          <StatsCard label="Completed" value={completed.length} color="bg-green-500" icon={<CheckCircle size={16} />} />
          <StatsCard label="Failed" value={failed.length} color="bg-nb-danger" icon={<AlertCircle size={16} />} />
          <StatsCard label="Total" value={items.length} color="bg-nb-info" icon={<Music size={16} />} />
        </div>
      </motion.div>

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

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>All Downloads</CardTitle>
                <Badge variant="neutral" className="text-xs">{items.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => loadDownloads()} className="text-nb-foreground">
                <RefreshCw size={14} /> Refresh
              </Button>
            </div>
          </CardHeader>

          <CardContent>
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
              <div className="space-y-4">
                {batches.batchList.map((batch) => (
                  <BatchGroup
                    key={batch.batch_id}
                    batch={batch}
                    onDelete={handleDelete}
                    onCancel={handleCancel}
                  />
                ))}

                {batches.singles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Music size={14} className="text-nb-muted" />
                      <span className="text-xs font-heading font-semibold text-nb-muted uppercase tracking-wider">Single Downloads</span>
                    </div>
                    <div className="space-y-2">
                      {batches.singles.map((d, i) => (
                        <DownloadRow
                          key={d.id}
                          data={d}
                          index={i}
                          onDelete={handleDelete}
                          onCancel={handleCancel}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {hasMore && (
              <div className="py-3 text-center border-t-2 border-nb-border mt-4">
                <Button variant="ghost" size="sm" onClick={() => loadDownloads(page + 1, true)}>
                  Load more
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

function StatsCard({ label, value, color, icon }) {
  return (
    <div
      className="rounded-nb p-4 flex flex-col items-center justify-center"
      style={{ borderWidth: '3px', borderStyle: 'solid', borderColor: '#000000' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-nb-foreground">{icon}</span>
        <span className="text-2xl font-heading font-bold text-nb-foreground">{value}</span>
      </div>
      <span className="text-xs text-nb-muted font-heading font-semibold">{label}</span>
    </div>
  )
}

function BatchGroup({ batch, onDelete, onCancel }) {
  const [expanded, setExpanded] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const toast = useToast()

  const handleDownloadZip = async () => {
    setDownloading(true)
    try {
      window.open(`/api/download/batch/${batch.batch_id}/zip`, '_blank')
      toast.success('ZIP download started')
    } catch {
      toast.error('ZIP download failed')
    }
    setDownloading(false)
  }

  const handleDownloadAll = async () => {
    setDownloadingAll(true)
    try {
      const completedTracks = batch.downloads.filter(d => d.status === 'completed' && d.filename)
      for (const track of completedTracks) {
        window.open(`/api/download/file/${track.id}`, '_blank')
        await new Promise(r => setTimeout(r, 300))
      }
      toast.success(`Downloading ${completedTracks.length} files`)
    } catch {
      toast.error('Download failed')
    }
    setDownloadingAll(false)
  }

  const activeCount = batch.downloads.filter(d => ['pending', 'processing', 'searching'].includes(d.status)).length
  const completedTracks = batch.downloads.filter(d => d.status === 'completed' && d.filename)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-nb border-2 border-nb-border overflow-hidden"
      style={{ boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 hover:bg-nb-secondary/20 transition-colors text-left"
      >
        {batch.coverImage ? (
          <img src={batch.coverImage} alt="" className="w-14 h-14 rounded-nb object-cover border-2 border-nb-border flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-nb bg-nb-surface2 border-2 border-nb-border flex items-center justify-center flex-shrink-0">
            <ListMusic size={20} className="text-nb-foreground" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-heading font-bold text-nb-foreground truncate">{batch.collection_name}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-nb-muted font-heading">{batch.total} tracks</span>
            {activeCount > 0 && (
              <span className="text-xs text-nb-main font-heading flex items-center gap-1">
                <Loader2 size={10} className="animate-spin-slow" />
                {activeCount} downloading
              </span>
            )}
          </div>
          <div className="mt-2">
            <Progress value={batch.progress} className="h-2" />
          </div>
          <p className="text-[10px] text-nb-muted font-heading mt-1">
            {batch.completed}/{batch.total} completed
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {batch.allDone ? (
            <Badge variant="default" className="flex items-center gap-1">
              <Check size={10} /> Done
            </Badge>
          ) : activeCount > 0 ? (
            <Badge variant="info" className="flex items-center gap-1">
              <Loader2 size={10} className="animate-spin-slow" /> Active
            </Badge>
          ) : null}

          {expanded ? (
            <ChevronUp size={18} className="text-nb-muted" />
          ) : (
            <ChevronDown size={18} className="text-nb-muted" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t-2 border-nb-border bg-nb-surface/50">
              <div className="p-3 flex flex-wrap gap-2 border-b border-nb-border/50">
                {completedTracks.length > 0 && (
                  <>
                    <Button size="sm" onClick={handleDownloadAll} disabled={downloadingAll}>
                      {downloadingAll ? <Loader2 size={14} className="animate-spin-slow" /> : <HardDrive size={14} />}
                      Save to Device
                    </Button>
                    <Button size="sm" variant="secondary" onClick={handleDownloadZip} disabled={downloading}>
                      {downloading ? <Loader2 size={14} className="animate-spin-slow" /> : <Archive size={14} />}
                      Save to ZIP
                    </Button>
                  </>
                )}
                {!batch.allDone && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    batch.downloads.filter(d => ['pending', 'processing', 'searching'].includes(d.status))
                      .forEach(d => onCancel(d.id))
                  }} className="text-nb-danger hover:bg-nb-danger/10">
                    <XCircle size={14} /> Cancel Active
                  </Button>
                )}
              </div>

              <div className="divide-y divide-nb-border/30">
                {batch.downloads.map((d, i) => (
                  <DownloadRow key={d.id} data={d} index={i} onDelete={onDelete} onCancel={onCancel} nested />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function DownloadRow({ data, index, onDelete, onCancel, nested }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isActive = data.status === 'pending' || data.status === 'processing' || data.status === 'searching'

  const statusConfig = {
    pending: { badge: 'warning', label: 'Queued', icon: <Pause size={12} /> },
    processing: { badge: 'info', label: 'Processing', icon: <Loader2 size={12} className="animate-spin-slow" /> },
    searching: { badge: 'info', label: `Searching`, icon: <Loader2 size={12} className="animate-spin-slow" /> },
    completed: { badge: 'default', label: 'Done', icon: <CheckCircle size={12} /> },
    failed: { badge: 'danger', label: 'Failed', icon: <AlertCircle size={12} /> },
    cancelled: { badge: 'muted', label: 'Cancelled', icon: <XCircle size={12} /> },
  }
  const config = statusConfig[data.status] || statusConfig.muted

  const padding = nested ? 'px-4 py-2.5' : 'px-4 py-3'

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className={`flex items-center gap-3 ${padding} hover:bg-nb-secondary/30 transition-colors group`}
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
              <Button size="sm">
                <Download size={14} />
                {data.filename?.split('.').pop()?.toUpperCase() || 'File'}
              </Button>
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
              {config.icon}
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
