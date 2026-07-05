import { motion } from 'framer-motion'
import { Construction } from 'lucide-react'

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-nb-bg px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-center max-w-md"
      >
        <div className="mb-6 flex justify-center">
          <div className="w-24 h-24 rounded-nb bg-nb-main/20 border-2 border-nb-border shadow-nb flex items-center justify-center">
            <Construction size={48} className="text-nb-main" />
          </div>
        </div>
        <h1 className="text-3xl font-heading font-bold text-nb-foreground mb-3">Under Maintenance</h1>
        <p className="text-nb-muted font-heading mb-6">
          We're currently performing scheduled maintenance. We'll be back soon!
        </p>
        <div className="nb-card-flat max-w-sm mx-auto">
          <p className="text-sm text-nb-muted2 font-heading">
            Expected downtime: <span className="text-nb-foreground font-semibold">30-60 minutes</span>
          </p>
          <p className="text-xs text-nb-muted2 font-heading mt-2">
            Follow updates on our status page or contact support.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
