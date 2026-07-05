import { clsx } from 'clsx'

const WIB_OFFSET = 7 * 60 * 60 * 1000

function toWIB(date) {
  const d = new Date(date)
  return new Date(d.getTime() + WIB_OFFSET)
}

export function cn(...inputs) {
  return clsx(inputs)
}

export function formatDuration(ms) {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function formatWIB(dateStr) {
  if (!dateStr) return ''
  const d = toWIB(dateStr)
  return d.toLocaleString('en-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })
}

export function formatWIBDate(dateStr) {
  if (!dateStr) return ''
  const d = toWIB(dateStr)
  return d.toLocaleDateString('en-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
}

export function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = new Date()
  const d = new Date(dateStr)
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago'
  return formatWIBDate(dateStr)
}
