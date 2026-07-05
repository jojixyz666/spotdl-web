import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { motion } from 'framer-motion'
import { Music, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    try {
      await login(username, password)
      toast.success('Welcome back!')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-nb-bg px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="text-center mb-8"
        >
          <div className="w-16 h-16 rounded-nb bg-nb-main border-2 border-nb-border shadow-nb flex items-center justify-center mx-auto mb-4">
            <Music size={32} className="text-nb-main-foreground" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-nb-foreground">SpotDL</h1>
          <p className="text-nb-muted mt-1 font-heading">Spotify Music Downloader</p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="nb-card"
        >
          <div className="px-6 pt-6">
            <h2 className="text-xl font-heading font-bold text-nb-foreground">Sign In</h2>
          </div>

          <form onSubmit={handleSubmit} className="px-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-nb-foreground hover:text-nb-main transition-colors"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-3"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-nb-main-foreground/30 border-t-nb-main-foreground rounded-full animate-spin-slow" />
              ) : (
                <>Sign In <ArrowRight size={18} /></>
              )}
            </Button>
          </form>

          <div className="px-6 pb-6 pt-2">
            <p className="text-center text-sm text-nb-muted font-heading">
              Don't have an account?{' '}
              <Link to="/register" className="text-nb-main hover:underline font-semibold">
                Create one
              </Link>
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
