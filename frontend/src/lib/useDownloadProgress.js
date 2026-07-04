import { useState, useEffect, useCallback, useRef } from 'react'

export function useDownloadProgress() {
  const [downloads, setDownloads] = useState([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef(null)

  useEffect(() => {
    const connect = () => {
      const es = new EventSource('/api/events')
      esRef.current = es

      es.onopen = () => setConnected(true)

      es.addEventListener('download_update', (e) => {
        try {
          const data = JSON.parse(e.data)
          setDownloads(prev => {
            const idx = prev.findIndex(d => d.id === data.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], ...data }
              return next
            }
            return [data, ...prev]
          })
        } catch {}
      })

      es.addEventListener('download_complete', (e) => {
        try {
          const data = JSON.parse(e.data)
          setDownloads(prev => prev.map(d => d.id === data.id ? { ...d, ...data } : d))
        } catch {}
      })

      es.addEventListener('batch_update', (e) => {
        try {
          const data = JSON.parse(e.data)
          setDownloads(prev => {
            const ids = data.download_ids || []
            return prev.map(d => ids.includes(d.id) ? { ...d, status: data.status } : d)
          })
        } catch {}
      })

      es.onerror = () => {
        setConnected(false)
        es.close()
        setTimeout(connect, 3000)
      }
    }

    connect()
    return () => { esRef.current?.close() }
  }, [])

  const addDownload = useCallback((download) => {
    setDownloads(prev => [download, ...prev])
  }, [])

  const clearCompleted = useCallback(() => {
    setDownloads(prev => prev.filter(d => d.status !== 'completed'))
  }, [])

  return { downloads, connected, addDownload, clearCompleted }
}
