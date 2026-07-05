import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { motion } from 'framer-motion'
import { Shield, ArrowUp, Loader2, UserCheck, UserX } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'

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
        <h2 className="text-2xl font-heading font-bold text-nb-foreground">User Management</h2>
      </motion.div>

      <Card>
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-2 border-nb-border border-t-nb-main rounded-full animate-spin-slow mx-auto" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-nb-border text-nb-muted">
                  <th className="text-left px-6 py-3 font-heading font-semibold">User</th>
                  <th className="text-left px-4 py-3 font-heading font-semibold">Role</th>
                  <th className="text-left px-4 py-3 font-heading font-semibold">Status</th>
                  <th className="text-right px-6 py-3 font-heading font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-nb-border">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-nb-secondary/50 transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-heading font-semibold text-nb-foreground">{u.username}</p>
                      <p className="text-xs text-nb-muted2">{new Date(u.created_at).toLocaleDateString()}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === 'admin' ? 'default' : 'neutral'}>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.is_approved ? 'default' : 'warning'}>
                        {u.is_approved ? 'Approved' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {actingId === u.id ? (
                          <Loader2 size={16} className="animate-spin-slow text-nb-foreground" />
                        ) : (
                          <>
                            {!u.is_approved && (
                              <Button variant="ghost" size="icon-sm" onClick={() => action('approve', u.id, 'User approved')} title="Approve">
                                <UserCheck size={16} />
                              </Button>
                            )}
                            {u.is_approved && (
                              <Button variant="ghost" size="icon-sm" onClick={() => action('revoke', u.id, 'Access revoked')} title="Revoke">
                                <UserX size={16} />
                              </Button>
                            )}
                            {u.role !== 'admin' && (
                              <Button variant="ghost" size="icon-sm" onClick={() => action('promote', u.id, 'Promoted to admin')} title="Promote">
                                <ArrowUp size={16} />
                              </Button>
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
      </Card>
    </div>
  )
}
