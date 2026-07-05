import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-nb-bg">
      <Navbar />
      <main className="relative max-w-5xl mx-auto px-4 pt-24 pb-12">
        <Outlet />
      </main>
    </div>
  )
}
