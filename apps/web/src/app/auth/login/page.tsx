"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { toast }          from 'sonner'
import { LogoLockup }  from '@/components/Logo'

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore(s => s.setAuth)
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await authApi.login(form)
      setAuth(data.data)
      toast.success(`Welcome back, ${data.data.user.name}`)
      router.push('/dashboard')
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20">
              <LogoLockup size={44} />
            </div>
          </div>
          <p className="text-slate-400 text-sm mt-2">Sign in to your account</p>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Welcome back</h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="demo@zkwaconnect.in"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            <button type="submit" disabled={loading} className="btn-brand w-full justify-center py-2.5 text-base">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <div className="mt-4 text-center text-sm text-slate-500">
            No account? <Link href="/auth/register" className="text-green-600 font-medium hover:underline">Create one</Link>
          </div>
          <div className="mt-4 p-3 bg-green-50 rounded-lg text-xs text-green-700 text-center">
            Demo: demo@zkwaconnect.in / demo1234
          </div>
        </div>
      </div>
    </div>
  )
}
