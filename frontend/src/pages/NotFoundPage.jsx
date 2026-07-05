import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, ArrowLeft } from 'lucide-react'
import { Button } from '../components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-nb-bg px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-center max-w-md"
      >
        <div className="mb-6">
          <span className="text-[120px] font-heading font-bold text-nb-main leading-none">404</span>
        </div>
        <h1 className="text-3xl font-heading font-bold text-nb-foreground mb-3">Page Not Found</h1>
        <p className="text-nb-muted font-heading mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => window.history.back()} variant="neutral">
            <ArrowLeft size={16} /> Go Back
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
