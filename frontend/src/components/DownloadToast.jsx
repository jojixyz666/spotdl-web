import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
import { cn } from '../lib/utils'

export default function DownloadToast() {
  const [items, setItems] = useState([])
  const [expanded, setExpanded] = useState(false)
  const esRef = useRef(null)
  const reconnectRef = useRef(null)

  useEffect(() => {
    let mounted = true

    const connect = () => {
      if (!mounted) return
      const es = new EventSource('/api/events')
      esRef.current = es

      es.addEventListener('download_update', (e) => {
        try {
          const data = JSON.parse(e.data)
          setItems(prev => {
            const idx = prev.findIndex(d => d.id === data.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], ...data }
              return next
            }
            return [{ ...data, _added: Date.now() }, ...prev]
          })
        } catch {}
      })

      es.addEventListener('download_complete', (e) => {
        try {
          const data = JSON.parse(e.data)
          setItems(prev => prev.map(d => d.id === data.id ? { ...d, ...data, status: 'completed' } : d))
          setTimeout(() => {
            setItems(prev => prev.filter(d => d.id !== data.id))
          }, 8000)
        } catch {}
      })

      es.addEventListener('download_failed', (e) => {
        try {
          const data = JSON.parse(e.data)
          setItems(prev => prev.map(d => d.id === data.id ? { ...d, ...data, status: 'failed' } : d))
          setTimeout(() => {
            setItems(prev => prev.filter(d => d.id !== data.id))
          }, 10000)
        } catch {}
      })

      es.addEventListener('download_cancelled', (e) => {
        try {
          const data = JSON.parse(e.data)
          setItems(prev => prev.map(d => d.id === data.id ? { ...d, ...data, status: 'cancelled' } : d))
          setTimeout(() => {
            setItems(prev => prev.filter(d => d.id !== data.id))
          }, 3000)
        } catch {}
      })

      es.onerror = () => {
        es.close()
        if (mounted) {
          reconnectRef.current = setTimeout(connect, 3000)
        }
      }
    }

    connect()
    return () => {
      mounted = false
      esRef.current?.close()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
    }
  }, [])

  const handleCancel = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/cancel/${id}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        setItems(prev => prev.map(d => d.id === id ? { ...d, status: 'cancelled' } : d))
        setTimeout(() => {
          setItems(prev => prev.filter(d => d.id !== id))
        }, 3000)
      }
    } catch {}
  }, [])

  const handleCancelAll = useCallback(async () => {
    try {
      const res = await fetch('/api/cancel/batch', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        setItems(prev => prev.map(d =>
          (d.status === 'pending' || d.status === 'processing' || d.status === 'searching')
            ? { ...d, status: 'cancelled' } : d
        ))
        setTimeout(() => {
          setItems(prev => prev.filter(d =>
            d.status !== 'cancelled'
          ))
        }, 3000)
      }
    } catch {}
  }, [])

  if (items.length === 0) return null

  const processing = items.filter(d => d.status === 'pending' || d.status === 'processing' || d.status === 'searching')
  const completed = items.filter(d => d.status === 'completed')
  const failed = items.filter(d => d.status === 'failed')

  return (
    <div className="fixed bottom-4 left-4 z-[90] w-80 max-w-[calc(100vw-2rem)]">
      <motion.div
        layout
        className="bg-nb-surface rounded-nb shadow-nb-lg overflow-hidden"
        style={{ borderWidth: '3px', borderStyle: 'solid', borderColor: '#000000' }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 bg-nb-secondary hover:bg-nb-surface2 transition-colors"
        >
          <div className="flex items-center gap-3">
            {processing.length > 0 ? (
              <Loader2 size={16} className="text-nb-foreground animate-spin-slow" />
            ) : (
              <Download size={16} className="text-nb-foreground" />
            )}
            <span className="text-sm font-heading font-semibold text-nb-foreground">
              {processing.length > 0
                ? `Downloading ${processing.length} track${processing.length > 1 ? 's' : ''}...`
                : `${items.length} recent download${items.length > 1 ? 's' : ''}`
              }
            </span>
          </div>
          <div className="flex items-center gap-2">
            {processing.length > 0 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCancelAll() }}
                  className="text-[10px] font-heading font-bold text-nb-danger hover:text-nb-danger/80 transition-colors"
                  title="Cancel all active downloads"
                >
                  Cancel All
                </button>
                <span className="w-2 h-2 rounded-full bg-nb-main animate-pulse" />
              </>
            )}
            {expanded ? <ChevronDown size={14} className="text-nb-muted" /> : <ChevronUp size={14} className="text-nb-muted" />}
          </div>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="max-h-60 overflow-y-auto px-2 pb-2">
                {items.map(item => {
                  const isActive = item.status === 'pending' || item.status === 'processing' || item.status === 'searching'
                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center gap-3 px-3 py-2 rounded-nb hover:bg-nb-secondary transition-colors group/item"
                    >
                      {item.status === 'completed' ? (
                        <CheckCircle size={14} className="text-nb-foreground flex-shrink-0" />
                      ) : item.status === 'failed' ? (
                        <XCircle size={14} className="text-nb-danger flex-shrink-0" />
                      ) : item.status === 'cancelled' ? (
                        <XCircle size={14} className="text-nb-muted flex-shrink-0" />
                      ) : (
                        <Loader2 size={14} className="text-nb-foreground animate-spin-slow flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-heading font-semibold text-nb-foreground truncate">{item.title || 'Unknown'}</p>
                        <p className="text-[10px] text-nb-muted2 truncate">{item.artist || ''}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={cn(
                          'text-[10px] font-heading font-semibold',
                          item.status === 'completed' && 'text-nb-foreground',
                          item.status === 'failed' && 'text-nb-danger',
                          (item.status === 'cancelled' || (!['completed', 'failed'].includes(item.status))) && 'text-nb-muted'
                        )}>
                          {item.status === 'completed' ? 'Done' : item.status === 'failed' ? 'Failed' : item.status === 'cancelled' ? 'Cancelled' : item.source ? `Via ${item.source}` : '...'}
                        </span>
                        {isActive && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCancel(item.id) }}
                            className="p-0.5 rounded-nb border-2 border-transparent text-nb-foreground hover:bg-nb-danger hover:text-nb-danger-foreground hover:border-nb-border transition-all"
                            title="Cancel"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
