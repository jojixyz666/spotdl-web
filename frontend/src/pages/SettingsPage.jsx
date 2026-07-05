import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { api } from '../lib/api'
import { motion } from 'framer-motion'
import { User, Lock, Save, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'

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
        <h2 className="text-2xl font-heading font-bold text-nb-foreground">Account Settings</h2>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-nb bg-nb-main/20 border-2 border-nb-border flex items-center justify-center">
                <User size={18} className="text-nb-main" />
              </div>
              <CardTitle>Username</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={updateUsername} className="flex gap-3">
              <Input type="text" value={username} onChange={e => setUsername(e.target.value)} className="flex-1" minLength={3} />
              <Button type="submit" disabled={loading || username === user?.username}>
                {loading ? <Loader2 size={16} className="animate-spin-slow" /> : <><Save size={16} /> Save</>}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-nb bg-nb-main/20 border-2 border-nb-border flex items-center justify-center">
                <Lock size={18} className="text-nb-main" />
              </div>
              <CardTitle>Password</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={updatePassword} className="space-y-3">
              <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password" required />
              <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password (min 6 chars)" required minLength={6} />
              <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm new password" required />
              <Button type="submit" disabled={loading || !currentPw || !newPw}>
                {loading ? <Loader2 size={16} className="animate-spin-slow" /> : <><Save size={16} /> Update Password</>}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
