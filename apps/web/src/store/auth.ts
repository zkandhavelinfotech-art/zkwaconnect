import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Tenant {
  id: string; name: string; plan: string; planStatus: string
  messagesLimit: number; messagesSent: number; walletBalance: number
  gstin?: string; state?: string; trialEndsAt?: string
}
interface User {
  id: string; name: string; email: string; role: string
}
interface AuthState {
  accessToken:  string | null
  refreshToken: string | null
  user:         User   | null
  tenant:       Tenant | null
  setAuth:   (a: { accessToken: string; refreshToken: string; user: User; tenant: Tenant }) => void
  setToken:  (t: string) => void
  setTenant: (t: Tenant) => void
  logout:    () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken:  null,
      refreshToken: null,
      user:         null,
      tenant:       null,
      setAuth:   ({ accessToken, refreshToken, user, tenant }) => set({ accessToken, refreshToken, user, tenant }),
      setToken:  (accessToken)  => set({ accessToken }),
      setTenant: (tenant)       => set({ tenant }),
      logout:    ()             => set({ accessToken: null, refreshToken: null, user: null, tenant: null }),
    }),
    { name: 'auth-storage' }
  )
)
