import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

export default function DownloadToast() {
  const [items, setItems] = useState([])
  const [expanded, setExpanded] = useState(false)
  const esRef = useRef(null)

  useEffect(() => {
    const connect = () => {
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
          }, 5000)
        } catch {}
      })

      es.addEventListener('download_failed', (e) => {
        try {
          const data = JSON.parse(e.data)
          setItems(prev => prev.map(d => d.id === data.id ? { ...d, ...data, status: 'failed' } : d))
          setTimeout(() => {
            setItems(prev => prev.filter(d => d.id !== data.id))
          }, 8000)
        } catch {}
      })

      es.onerror = () => {
        es.close()
        setTimeout(connect, 5000)
      }
    }

    connect()
    return () => esRef.current?.close()
  }, [])

  if (items.length === 0) return null

  const processing = items.filter(d => d.status === 'pending' || d.status === 'processing')
  const completed = items.filter(d => d.status === 'completed')
  const failed = items.filter(d => d.status === 'failed')

  return (
    <div className="fixed bottom-4 left-4 z-[90] w-80 max-w-[calc(100vw-2rem)]">
      <motion.div
        layout
        className="glass rounded-2xl shadow-2xl border border-white/5 overflow-hidden"
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            {processing.length > 0 ? (
              <Loader2 size={16} className="text-spotify-green animate-spin-slow" />
            ) : (
              <Download size={16} className="text-text-muted" />
            )}
            <span className="text-sm font-medium text-text-primary">
              {processing.length > 0
                ? `Downloading ${processing.length} track${processing.length > 1 ? 's' : ''}...`
                : `${items.length} recent download${items.length > 1 ? 's' : ''}`
              }
            </span>
          </div>
          <div className="flex items-center gap-2">
            {processing.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-spotify-green animate-pulse" />
            )}
            {expanded ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronUp size={14} className="text-text-muted" />}
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
                {items.map(item => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors"
                  >
                    {item.status === 'completed' ? (
                      <CheckCircle size={14} className="text-spotify-green flex-shrink-0" />
                    ) : item.status === 'failed' ? (
                      <XCircle size={14} className="text-red-400 flex-shrink-0" />
                    ) : (
                      <Loader2 size={14} className="text-spotify-green animate-spin-slow flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-text-primary truncate">{item.title || 'Unknown'}</p>
                      <p className="text-[10px] text-text-muted truncate">{item.artist || ''}</p>
                    </div>
                    <span className={`text-[10px] font-medium flex-shrink-0 ${
                      item.status === 'completed' ? 'text-spotify-green' :
                      item.status === 'failed' ? 'text-red-400' :
                      'text-text-muted'
                    }`}>
                      {item.status === 'completed' ? 'Done' : item.status === 'failed' ? 'Failed' : '...'}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
