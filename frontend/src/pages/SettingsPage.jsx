import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { api } from '../lib/api'
import { motion } from 'framer-motion'
import { User, Lock, Save, Loader2 } from 'lucide-react'

export default function SettingsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [username, setUsername] = useState(user?.username || '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading] = useState(false)

  const updateUsername = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.updateUsername(username)
      if (res.error) toast.error(res.error)
      else toast.success('Username updated!')
    } catch { toast.error('Failed') }
    setLoading(false)
  }

  const updatePassword = async (e) => {
    e.preventDefault()
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return }
    setLoading(true)
    try {
      const res = await api.updatePassword(currentPw, newPw)
      if (res.error) toast.error(res.error)
      else { toast.success('Password updated!'); setCurrentPw(''); setNewPw(''); setConfirmPw('') }
    } catch { toast.error('Failed') }
    setLoading(false)
  }

  return (
    <div className="max-w-lg space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-bold text-text-primary">Account Settings</h2>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-spotify-green/10 flex items-center justify-center"><User size={18} className="text-spotify-green" /></div>
          <h3 className="font-bold text-text-primary">Username</h3>
        </div>
        <form onSubmit={updateUsername} className="flex gap-3">
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="input flex-1" minLength={3} />
          <motion.button type="submit" disabled={loading || username === user?.username} whileTap={{ scale: 0.97 }} className="btn-primary">
            {loading ? <Loader2 size={16} className="animate-spin-slow" /> : <><Save size={16} /> Save</>}
          </motion.button>
        </form>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-spotify-green/10 flex items-center justify-center"><Lock size={18} className="text-spotify-green" /></div>
          <h3 className="font-bold text-text-primary">Password</h3>
        </div>
        <form onSubmit={updatePassword} className="space-y-3">
          <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="input" placeholder="Current password" required />
          <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="input" placeholder="New password (min 6 chars)" required minLength={6} />
          <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="input" placeholder="Confirm new password" required />
          <motion.button type="submit" disabled={loading || !currentPw || !newPw} whileTap={{ scale: 0.97 }} className="btn-primary">
            {loading ? <Loader2 size={16} className="animate-spin-slow" /> : <><Save size={16} /> Update Password</>}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
