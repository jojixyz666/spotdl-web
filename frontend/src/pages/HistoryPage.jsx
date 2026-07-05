import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { timeAgo } from '../lib/utils'
import { motion } from 'framer-motion'
import { Clock, Music, Disc3, List, ChevronRight, ChevronLeft } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

const TYPE_ICONS = { track: Music, album: Disc3, playlist: List }
const TYPE_LABELS = { track: 'Track', album: 'Album', playlist: 'Playlist' }

export default function HistoryPage() {
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p) => {
    setLoading(true)
    try {
      const data = await api.getHistory(p)
      setItems(data.items || [])
      setHasMore(data.has_more || false)
      setPage(p)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load(1) }, [load])

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-heading font-bold text-nb-foreground">Download History</h2>
        <p className="text-nb-muted mt-1 font-heading">All tracks, albums, and playlists you've submitted</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <div className="divide-y-2 divide-nb-border">
            {loading && items.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-8 h-8 border-2 border-nb-border border-t-nb-main rounded-full animate-spin-slow mx-auto" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center">
                <Clock size={40} className="mx-auto text-nb-foreground mb-3" />
                <p className="text-nb-muted font-heading font-semibold">No history yet</p>
                <p className="text-nb-muted2 text-sm mt-1 font-heading">Your download history will appear here</p>
              </div>
            ) : (
              items.map((item, i) => {
                const Icon = TYPE_ICONS[item.content_type] || Music
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Link
                      to={`/history/${item.id}`}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-nb-secondary/50 transition-all group"
                    >
                      {item.image_url ? (
                        <img src={item.image_url} className="w-12 h-12 rounded-nb object-cover border-2 border-nb-border shadow-nb-sm flex-shrink-0" alt="" />
                      ) : (
                        <div className="w-12 h-12 rounded-nb bg-nb-surface2 border-2 border-nb-border flex items-center justify-center flex-shrink-0">
                          <Icon size={20} className="text-nb-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-heading font-semibold text-nb-foreground truncate group-hover:text-nb-main transition-colors">
                          {item.collection_name || 'Unknown'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="neutral" className="text-[10px]">{TYPE_LABELS[item.content_type] || item.content_type}</Badge>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-nb-muted2 font-heading">{timeAgo(item.created_at)}</p>
                      </div>
                      <ChevronRight size={16} className="text-nb-muted2 group-hover:text-nb-foreground transition-colors flex-shrink-0" />
                    </Link>
                  </motion.div>
                )
              })
            )}
          </div>

          {page > 1 && (
            <div className="px-6 py-3 border-t-2 border-nb-border flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => load(page - 1)}>
                <ChevronLeft size={14} /> Previous
              </Button>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
