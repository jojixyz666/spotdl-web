import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { motion } from 'framer-motion'
import { Sliders, Save, Loader2, Download, Shield, Music, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Select } from '../components/ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { NbIcon } from '../components/ui/NbIcon'

export default function AdminSettingsPage() {
  const toast = useToast()
  const [config, setConfig] = useState({ batch_limit: 500, max_concurrent_downloads: 5, require_approval: true, audio_format: 'mp3', bitrate: '128k' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [confirmClean, setConfirmClean] = useState(false)

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

  const handleCleanAll = async () => {
    setCleaning(true)
    try {
      const res = await api.deleteAllDownloads()
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(res.message || 'All downloads cleared')
        setConfirmClean(false)
      }
    } catch {
      toast.error('Failed to clear downloads')
    }
    setCleaning(false)
  }

  if (loading) return <div className="py-20 text-center"><div className="w-8 h-8 border-2 border-nb-border border-t-nb-main rounded-full animate-spin-slow mx-auto" /></div>

  return (
    <div className="max-w-lg space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-heading font-bold text-nb-foreground">App Settings</h2>
        <p className="text-nb-muted mt-1 font-heading">Configure download limits and behavior</p>
      </motion.div>

      <form onSubmit={save} className="space-y-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <NbIcon icon={Download} />
                <CardTitle>Batch Download</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label>Batch Limit (max tracks per download)</Label>
              <Input type="number" value={config.batch_limit} onChange={e => setConfig({ ...config, batch_limit: parseInt(e.target.value) || 50 })} min={1} max={500} />
              <p className="text-xs text-nb-muted2 font-heading">How many tracks a user can download at once. Default: 500</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <NbIcon icon={Sliders} />
                <CardTitle>Concurrency</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label>Max Concurrent Downloads</Label>
              <Input type="number" value={config.max_concurrent_downloads} onChange={e => setConfig({ ...config, max_concurrent_downloads: parseInt(e.target.value) || 5 })} min={1} max={20} />
              <p className="text-xs text-nb-muted2 font-heading">How many tracks download simultaneously per batch. Default: 5</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <NbIcon icon={Music} />
                <CardTitle>Audio Format & Quality</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Default Format</Label>
                  <Select value={config.audio_format} onChange={e => setConfig({ ...config, audio_format: e.target.value })}>
                    <option value="mp3">MP3 (best compatibility)</option>
                    <option value="flac">FLAC (lossless)</option>
                    <option value="m4a">M4A (AAC)</option>
                    <option value="opus">OPUS (small size)</option>
                    <option value="ogg">OGG Vorbis</option>
                    <option value="wav">WAV (uncompressed)</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Default Bitrate</Label>
                  <Select value={config.bitrate} onChange={e => setConfig({ ...config, bitrate: e.target.value })}>
                    <option value="disable">Original (No Convert)</option>
                    <option value="auto">Auto</option>
                    <option value="128k">128 kbps</option>
                    <option value="192k">192 kbps</option>
                    <option value="256k">256 kbps</option>
                    <option value="320k">320 kbps</option>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-nb-muted2 font-heading">Users can override these per-download. "Original" skips conversion for best quality.</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <NbIcon icon={Shield} />
                <CardTitle>User Registration</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.require_approval}
                  onChange={e => setConfig({ ...config, require_approval: e.target.checked })}
                  className="w-5 h-5 accent-nb-main rounded"
                />
                <div>
                  <p className="text-sm font-heading font-semibold text-nb-foreground">Require admin approval for new registrations</p>
                  <p className="text-xs text-nb-muted2 mt-0.5">New users must be approved before they can login</p>
                </div>
              </label>
            </CardContent>
          </Card>
        </motion.div>

        <Button type="submit" disabled={saving} className="py-3 px-6 text-base">
          {saving ? <Loader2 size={18} className="animate-spin-slow" /> : <><Save size={18} /> Save Settings</>}
        </Button>
      </form>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <NbIcon icon={Trash2} variant="danger" />
              <CardTitle>Danger Zone</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-nb border-2 border-nb-danger/30 bg-nb-danger/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-nb-danger mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-heading font-semibold text-nb-foreground">Delete All Downloads</p>
                  <p className="text-xs text-nb-muted2 mt-1 font-heading">
                    This will permanently delete all downloaded files, download history, and URL history from the server.
                    This action cannot be undone.
                  </p>
                  <div className="mt-3">
                    {confirmClean ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={handleCleanAll}
                          disabled={cleaning}
                        >
                          {cleaning ? <Loader2 size={14} className="animate-spin-slow" /> : <><Trash2 size={14} /> Confirm Delete All</>}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmClean(false)}
                          disabled={cleaning}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmClean(true)}
                      >
                        <Trash2 size={14} /> Delete All Downloads
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
