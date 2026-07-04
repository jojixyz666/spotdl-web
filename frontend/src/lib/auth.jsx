import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me().then(data => {
      if (data.user) setUser(data.user)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password)
    if (data.error) throw new Error(data.error)
    if (data.user) setUser(data.user)
    return data
  }, [])

  const register = useCallback(async (username, password, confirm) => {
    const data = await api.register(username, password, confirm)
    if (data.error) throw new Error(data.error)
    return data
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
