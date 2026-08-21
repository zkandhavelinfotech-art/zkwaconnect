import axios from 'axios'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

const api = axios.create({ baseURL: BASE })

api.interceptors.request.use((cfg) => {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('auth-storage')
      if (raw) {
        const { state } = JSON.parse(raw)
        if (state?.accessToken) cfg.headers.Authorization = `Bearer ${state.accessToken}`
      }
    } catch {}
  }
  return cfg
})

api.interceptors.response.use((r) => r, async (err) => {
  const orig = err.config
  if (err.response?.status === 401 && !orig._retry) {
    orig._retry = true
    try {
      const raw = localStorage.getItem('auth-storage')
      if (raw) {
        const { state } = JSON.parse(raw)
        if (state?.refreshToken) {
          const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken: state.refreshToken })
          const stored = JSON.parse(raw)
          stored.state.accessToken = data.data.accessToken
          localStorage.setItem('auth-storage', JSON.stringify(stored))
          orig.headers.Authorization = `Bearer ${data.data.accessToken}`
          return api(orig)
        }
      }
    } catch {}
  }
  return Promise.reject(err)
})

export default api

export const authApi = {
  login:          (d: any) => api.post('/auth/login', d),
  register:       (d: any) => api.post('/auth/register', d),
  refresh:        (d: any) => api.post('/auth/refresh', d),
  me:             ()       => api.get('/auth/me'),
  logout:         (d: any) => api.post('/auth/logout', d),
  changePassword: (d: any) => api.post('/auth/change-password', d),
}

export const leadApi = {
  list:   (q?: any)             => api.get('/leads', { params: q }),
  stats:  ()                    => api.get('/leads/stats/overview'),
  update: (id: string, d: any)  => api.patch(`/leads/${id}`, d),
  delete: (id: string)          => api.delete(`/leads/${id}`),
}

export const contactApi = {
  list:   (q?: any)             => api.get('/contacts', { params: q }),
  create: (d: any)              => api.post('/contacts', d),
  update: (id: string, d: any)  => api.patch(`/contacts/${id}`, d),
  delete: (id: string)          => api.delete(`/contacts/${id}`),
}

export const templateApi = {
  list:   (q?: any)    => api.get('/templates', { params: q }),
  create: (d: any)     => api.post('/templates', d),
  submit: (id: string) => api.post(`/templates/${id}/submit`),
  delete: (id: string) => api.delete(`/templates/${id}`),
}

export const campaignApi = {
  list:   (q?: any)    => api.get('/campaigns', { params: q }),
  create: (d: any)     => api.post('/campaigns', d),
  launch: (id: string) => api.post(`/campaigns/${id}/launch`),
  pause:  (id: string) => api.post(`/campaigns/${id}/pause`),
  cancel: (id: string) => api.post(`/campaigns/${id}/cancel`),
}

export const messageApi = {
  conversations: (q?: any)    => api.get('/messages/conversations', { params: q }),
  history:       (id: string) => api.get(`/messages/${id}`),
  send:          (d: any)     => api.post('/messages/send', d),
  setStatus:     (id: string, status: string) => api.patch(`/messages/conversations/${id}/status`, { status }),
}

export const wabaApi = {
  list:     ()            => api.get('/waba'),
  connect:  (d: any)     => api.post('/waba/connect', d),
  activate: (id: string) => api.post(`/waba/${id}/activate`),
  remove:   (id: string) => api.delete(`/waba/${id}`),
}

export const billingApi = {
  overview:      ()            => api.get('/billing'),
  invoices:      (q?: any)     => api.get('/billing/invoices', { params: q }),
  subscribe:     (d: any)      => api.post('/billing/subscribe', d),
  verifyPayment: (d: any)      => api.post('/billing/verify-payment', d),
  walletTopup:   (d: any)      => api.post('/billing/wallet/topup', d),
  invoicePdf:    (id: string)  => api.get(`/billing/invoices/${id}/pdf`, { responseType: 'blob' }),
}

export const analyticsApi = {
  overview:  (range: string) => api.get('/analytics/overview', { params: { range } }),
  campaigns: ()              => api.get('/analytics/campaigns'),
}

export const productApi = {
  list:   ()                        => api.get('/products'),
  create: (d: any)                  => api.post('/products', d),
  update: (id: string, d: any)      => api.patch(`/products/${id}`, d),
  delete: (id: string)              => api.delete(`/products/${id}`),
}
