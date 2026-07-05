import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, ArrowLeft, ShieldX } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { NbIcon } from '../components/ui/NbIcon'

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-nb-bg px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-center max-w-md"
      >
        <div className="mb-6 flex justify-center">
          <NbIcon icon={ShieldX} size="lg" variant="danger" />
        </div>
        <h1 className="text-[100px] font-heading font-bold text-nb-foreground leading-none mb-2">403</h1>
        <h2 className="text-2xl font-heading font-bold text-nb-foreground mb-3">Access Forbidden</h2>
        <p className="text-nb-muted font-heading mb-8">
          You don't have permission to access this page. Contact an administrator if you believe this is a mistake.
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
