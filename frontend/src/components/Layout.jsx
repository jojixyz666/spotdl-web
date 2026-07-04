import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-surface-0 relative overflow-hidden">
      <div className="blob-1" />
      <div className="blob-2" />
      <Navbar />
      <main className="relative z-10 max-w-5xl mx-auto px-4 pt-24 pb-12">
        <Outlet />
      </main>
    </div>
  )
}
