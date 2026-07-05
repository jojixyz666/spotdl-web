import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '../components/ui/Button'

export default function ServerErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-nb-bg px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-center max-w-md"
      >
        <div className="mb-6 flex justify-center">
          <div className="w-24 h-24 rounded-nb bg-nb-warning/20 border-2 border-nb-border shadow-nb flex items-center justify-center">
            <AlertTriangle size={48} className="text-nb-warning" />
          </div>
        </div>
        <h1 className="text-[100px] font-heading font-bold text-nb-foreground leading-none mb-2">500</h1>
        <h2 className="text-2xl font-heading font-bold text-nb-foreground mb-3">Server Error</h2>
        <p className="text-nb-muted font-heading mb-8">
          Something went wrong on our end. Our team has been notified. Please try again later.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => window.location.reload()} variant="neutral">
            <RefreshCw size={16} /> Try Again
          </Button>
          <Link to="/dashboard">
            <Button>
              <Home size={16} /> Dashboard
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
