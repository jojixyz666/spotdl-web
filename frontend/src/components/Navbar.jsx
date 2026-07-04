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
  { to: '/admin/settings', label: 'App Settings', icon: Sliders },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const allItems = [...NAV_ITEMS, ...(user?.is_admin ? ADMIN_ITEMS : [])]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-spotify-green flex items-center justify-center shadow-lg shadow-spotify-green/20 group-hover:shadow-spotify-green/40 transition-shadow">
            <Music size={18} className="text-black" />
          </div>
          <span className="font-bold text-lg text-text-primary hidden sm:block">SpotDL</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {allItems.map(item => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-white/10 text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <span className="text-sm text-text-secondary">{user?.username}</span>
          <Link to="/settings" className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all">
            <Settings size={18} />
          </Link>
          <button onClick={logout} className="p-2 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut size={18} />
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg text-text-secondary hover:bg-white/5"
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
            className="md:hidden overflow-hidden glass border-b border-white/5"
          >
            <div className="px-4 py-3 flex flex-col gap-1">
              {allItems.map(item => {
                const active = location.pathname === item.to
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:bg-white/5'
                    }`}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </Link>
                )
              })}
              <hr className="border-white/5 my-2" />
              <Link to="/settings" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:bg-white/5">
                <Settings size={18} /> Settings
              </Link>
              <button onClick={() => { setMobileOpen(false); logout() }} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10">
                <LogOut size={18} /> Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
