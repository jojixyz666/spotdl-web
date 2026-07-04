import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, CheckCircle, XCircle, ArrowUp, ArrowDown, Trash2, Loader2, UserCheck, UserX } from 'lucide-react'

export default function AdminUsersPage() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState(null)

  const load = () => {
    api.getAdminUsers().then(data => setUsers(data.users || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const action = async (act, userId, label) => {
    setActingId(userId)
    try {
      const res = await api.adminAction(act, userId)
      if (res.error) toast.error(res.error)
      else { toast.success(label); load() }
    } catch { toast.error('Action failed') }
    setActingId(null)
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-bold text-text-primary">User Management</h2>
      </motion.div>

      <div className="card">
        {loading ? (
          <div className="py-16 text-center"><div className="w-8 h-8 border-2 border-surface-5 border-t-spotify-green rounded-full animate-spin-slow mx-auto" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-text-muted">
                  <th className="text-left px-6 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-medium text-text-primary">{u.username}</p>
                      <p className="text-xs text-text-muted">{new Date(u.created_at).toLocaleDateString()}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={u.role === 'admin' ? 'badge-green' : 'badge-gray'}>{u.role}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={u.is_approved ? 'badge-green' : 'badge-yellow'}>
                        {u.is_approved ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {actingId === u.id ? (
                          <Loader2 size={16} className="animate-spin-slow text-text-muted" />
                        ) : (
                          <>
                            {!u.is_approved && (
                              <button onClick={() => action('approve', u.id, 'User approved')} className="p-2 rounded-lg hover:bg-emerald-500/10 text-emerald-400 transition-colors" title="Approve">
                                <UserCheck size={16} />
                              </button>
                            )}
                            {u.is_approved && (
                              <button onClick={() => action('revoke', u.id, 'Access revoked')} className="p-2 rounded-lg hover:bg-amber-500/10 text-amber-400 transition-colors" title="Revoke">
                                <UserX size={16} />
                              </button>
                            )}
                            {u.role !== 'admin' && (
                              <button onClick={() => action('promote', u.id, 'Promoted to admin')} className="p-2 rounded-lg hover:bg-blue-500/10 text-blue-400 transition-colors" title="Promote">
                                <ArrowUp size={16} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
