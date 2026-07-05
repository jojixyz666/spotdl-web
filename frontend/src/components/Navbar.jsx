import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { motion, AnimatePresence } from 'framer-motion'
import { Music, LayoutDashboard, Clock, Settings, Shield, LogOut, Menu, X, Sliders } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/history', label: 'History', icon: Clock },
]

const ADMIN_ITEMS = [
  { to: '/admin/users', label: 'Users', icon: Shield },
  { to: '/admin/settings', label: 'Settings', icon: Sliders },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const allItems = [...NAV_ITEMS, ...(user?.is_admin ? ADMIN_ITEMS : [])]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-nb-bg border-b-2 border-nb-border">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-nb bg-nb-main border-2 border-nb-border shadow-nb-sm flex items-center justify-center group-hover:translate-x-nb-sm group-hover:translate-y-nb-sm group-hover:shadow-none transition-all">
            <Music size={18} className="text-nb-main-foreground" />
          </div>
          <span className="font-heading font-bold text-lg text-nb-foreground hidden sm:block">SpotDL</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {allItems.map(item => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 px-3 py-2 rounded-nb border-2 text-sm font-heading font-semibold transition-all duration-150 ${
                  active
                    ? 'bg-nb-main text-nb-main-foreground border-nb-border shadow-nb-sm'
                    : 'bg-transparent text-nb-muted border-transparent hover:bg-nb-secondary hover:text-nb-foreground hover:border-nb-border hover:shadow-nb-sm'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <span className="text-sm font-heading font-semibold text-nb-muted">{user?.username}</span>
          <Link to="/settings" className="p-2 rounded-nb border-2 border-transparent text-nb-muted hover:bg-nb-secondary hover:text-nb-foreground hover:border-nb-border hover:shadow-nb-sm transition-all">
            <Settings size={18} />
          </Link>
          <button onClick={logout} className="p-2 rounded-nb border-2 border-transparent text-nb-muted hover:bg-nb-danger hover:text-white hover:border-nb-border hover:shadow-nb-sm transition-all">
            <LogOut size={18} />
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-nb border-2 border-nb-border bg-nb-secondary text-nb-foreground"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden bg-nb-bg border-b-2 border-nb-border"
          >
            <div className="px-4 py-3 flex flex-col gap-1">
              {allItems.map(item => {
                const active = location.pathname === item.to
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-nb border-2 text-sm font-heading font-semibold transition-all ${
                      active
                        ? 'bg-nb-main text-nb-main-foreground border-nb-border shadow-nb-sm'
                        : 'bg-transparent text-nb-muted border-transparent hover:bg-nb-secondary hover:text-nb-foreground hover:border-nb-border'
                    }`}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </Link>
                )
              })}
              <hr className="border-nb-border my-2" />
              <Link to="/settings" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-nb border-2 border-transparent text-sm font-heading font-semibold text-nb-muted hover:bg-nb-secondary hover:text-nb-foreground hover:border-nb-border">
                <Settings size={18} /> Settings
              </Link>
              <button onClick={() => { setMobileOpen(false); logout() }} className="flex items-center gap-3 px-3 py-2.5 rounded-nb border-2 border-transparent text-sm font-heading font-semibold text-nb-danger hover:bg-nb-danger hover:text-white hover:border-nb-border">
                <LogOut size={18} /> Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
