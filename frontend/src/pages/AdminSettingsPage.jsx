import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { motion } from 'framer-motion'
import { Sliders, Save, Loader2, Users, Download, Shield, Music } from 'lucide-react'

export default function AdminSettingsPage() {
  const toast = useToast()
  const [config, setConfig] = useState({ batch_limit: 500, max_concurrent_downloads: 5, require_approval: true, audio_format: 'mp3', bitrate: '128k' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getAdminSettings().then(data => setConfig(data.config || config)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.saveAdminSettings(config)
      if (res.error) toast.error(res.error)
      else toast.success('Settings saved!')
    } catch { toast.error('Failed') }
    setSaving(false)
  }

  if (loading) return <div className="py-20 text-center"><div className="w-8 h-8 border-2 border-surface-5 border-t-spotify-green rounded-full animate-spin-slow mx-auto" /></div>

  return (
    <div className="max-w-lg space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-bold text-text-primary">App Settings</h2>
        <p className="text-text-secondary mt-1">Configure download limits and behavior</p>
      </motion.div>

      <form onSubmit={save} className="space-y-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-spotify-green/10 flex items-center justify-center"><Download size={18} className="text-spotify-green" /></div>
            <h3 className="font-bold text-text-primary">Batch Download</h3>
          </div>
          <label className="block text-sm text-text-secondary mb-2">Batch Limit (max tracks per download)</label>
          <input type="number" value={config.batch_limit} onChange={e => setConfig({ ...config, batch_limit: parseInt(e.target.value) || 50 })} className="input" min={1} max={500} />
          <p className="text-xs text-text-muted mt-2">How many tracks a user can download at once. Default: 500</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-spotify-green/10 flex items-center justify-center"><Sliders size={18} className="text-spotify-green" /></div>
            <h3 className="font-bold text-text-primary">Concurrency</h3>
          </div>
          <label className="block text-sm text-text-secondary mb-2">Max Concurrent Downloads</label>
          <input type="number" value={config.max_concurrent_downloads} onChange={e => setConfig({ ...config, max_concurrent_downloads: parseInt(e.target.value) || 5 })} className="input" min={1} max={20} />
          <p className="text-xs text-text-muted mt-2">How many tracks download simultaneously per batch. Default: 5</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-spotify-green/10 flex items-center justify-center"><Music size={18} className="text-spotify-green" /></div>
            <h3 className="font-bold text-text-primary">Audio Format & Quality</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-2">Default Format</label>
              <select value={config.audio_format} onChange={e => setConfig({ ...config, audio_format: e.target.value })} className="input">
                <option value="mp3">MP3 (best compatibility)</option>
                <option value="flac">FLAC (lossless)</option>
                <option value="m4a">M4A (AAC)</option>
                <option value="opus">OPUS (small size)</option>
                <option value="ogg">OGG Vorbis</option>
                <option value="wav">WAV (uncompressed)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-2">Default Bitrate</label>
              <select value={config.bitrate} onChange={e => setConfig({ ...config, bitrate: e.target.value })} className="input">
                <option value="disable">Original (No Convert)</option>
                <option value="auto">Auto</option>
                <option value="128k">128 kbps</option>
                <option value="192k">192 kbps</option>
                <option value="256k">256 kbps</option>
                <option value="320k">320 kbps</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-2">Users can override these per-download. "Original" skips conversion for best quality.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-spotify-green/10 flex items-center justify-center"><Shield size={18} className="text-spotify-green" /></div>
            <h3 className="font-bold text-text-primary">User Registration</h3>
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={config.require_approval} onChange={e => setConfig({ ...config, require_approval: e.target.checked })} className="w-5 h-5 accent-spotify-green rounded" />
            <div>
              <p className="text-sm text-text-primary">Require admin approval for new registrations</p>
              <p className="text-xs text-text-muted mt-0.5">New users must be approved before they can login</p>
            </div>
          </label>
        </motion.div>

        <motion.button type="submit" disabled={saving} whileTap={{ scale: 0.97 }} className="btn-primary py-3 px-6 text-base">
          {saving ? <Loader2 size={18} className="animate-spin-slow" /> : <><Save size={18} /> Save Settings</>}
        </motion.button>
      </form>
    </div>
  )
}
