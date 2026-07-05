const API_BASE = ''
const isBrowser = typeof window !== 'undefined'

async function request(url, options = {}) {
  const res = await fetch(API_BASE + url, {
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json', ...options.headers },
    ...options,
  })
  if (res.status === 401 || res.status === 403) {
    const text = await res.text()
    const isLoginOrMe = url === '/api/login' || url === '/api/register' || url === '/api/csrf' || url === '/api/me'
    if (!isLoginOrMe && isBrowser && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
  }
  return res
}

export const api = {
  async getCsrf() {
    const res = await request('/api/csrf')
    const data = await res.json()
    return data.csrf_token
  },

  async login(username, password) {
    const csrf = await this.getCsrf()
    const res = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, _csrf_token: csrf }),
    })
    return res.json()
  },

  async register(username, password, confirmPassword) {
    const csrf = await this.getCsrf()
    const res = await request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, confirm_password: confirmPassword, _csrf_token: csrf }),
    })
    return res.json()
  },

  async logout() {
    const csrf = await this.getCsrf()
    await request('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _csrf_token: csrf }),
    })
  },

  async me() {
    const res = await request('/api/me')
    return res.json()
  },

  async preview(url, audioFormat = 'mp3', bitrate = '128k') {
    const csrf = await this.getCsrf()
    const res = await request('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spotify_url: url, audio_format: audioFormat, bitrate, _csrf_token: csrf }),
    })
    return res.json()
  },

  async downloadTrack(track) {
    const csrf = await this.getCsrf()
    const res = await request('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...track, _csrf_token: csrf }),
    })
    return res.json()
  },

  async downloadBatch(tracks, collectionName, contentType, fromHistory = false, audioFormat = 'mp3', bitrate = '128k') {
    const csrf = await this.getCsrf()
    const res = await request('/api/download/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracks,
        collection_name: collectionName,
        content_type: contentType,
        from_history: fromHistory,
        audio_format: audioFormat,
        bitrate,
        _csrf_token: csrf,
      }),
    })
    return res.json()
  },

  async getDownloads(page = 1) {
    const res = await request(`/api/downloads?page=${page}`)
    return res.json()
  },

  async getDownloadStatus(id) {
    const res = await request(`/api/status/${id}`)
    return res.json()
  },

  async deleteDownload(id) {
    const csrf = await this.getCsrf()
    const res = await request(`/api/delete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _csrf_token: csrf }),
    })
    return res.json()
  },

  async cancelDownload(id) {
    const csrf = await this.getCsrf()
    const res = await request(`/api/cancel/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _csrf_token: csrf }),
    })
    return res.json()
  },

  async getHistory(page = 1) {
    const res = await request(`/api/history?page=${page}`)
    return res.json()
  },

  async getHistoryDetail(id) {
    const res = await request(`/api/history/${id}`)
    return res.json()
  },

  async downloadFileUrl(downloadId) {
    return `${API_BASE}/api/download/file/${downloadId}`
  },

  async getBatchZipUrl(batchId) {
    return `${API_BASE}/api/download/batch/${batchId}/zip`
  },

  async getAdminUsers() {
    const res = await request('/api/admin/users')
    return res.json()
  },

  async adminAction(action, userId) {
    const csrf = await this.getCsrf()
    const res = await request(`/api/admin/users/${action}/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _csrf_token: csrf }),
    })
    return res.json()
  },

  async getAdminSettings() {
    const res = await request('/api/admin/settings')
    return res.json()
  },

  async saveAdminSettings(settings) {
    const csrf = await this.getCsrf()
    const res = await request('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, _csrf_token: csrf }),
    })
    return res.json()
  },

  async updateUsername(newUsername) {
    const csrf = await this.getCsrf()
    const res = await request('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_username', new_username: newUsername, _csrf_token: csrf }),
    })
    return res.json()
  },

  async updatePassword(currentPassword, newPassword) {
    const csrf = await this.getCsrf()
    const res = await request('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_password',
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: newPassword,
        _csrf_token: csrf,
      }),
    })
    return res.json()
  },
}
