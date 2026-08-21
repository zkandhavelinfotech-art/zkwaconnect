"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { toast }          from 'sonner'
import { LogoLockup }  from '@/components/Logo'

const IN_STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh','Puducherry','Chandigarh','Andaman & Nicobar Islands','Dadra & Nagar Haveli','Daman & Diu','Lakshadweep']

export default function RegisterPage() {
  const router  = useRouter()
  const setAuth = useAuthStore(s => s.setAuth)
  const [step, setStep]     = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email:'', password:'', name:'', companyName:'', plan:'STARTER', state:'Tamil Nadu', gstin:'' })
  const F = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (step === 1) { setStep(2); return }
    setLoading(true)
    try {
      const { data } = await authApi.register(form)
      setAuth(data.data)
      toast.success('Account created!')
      router.push('/dashboard')
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Registration failed')
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
          <p className="text-slate-300 text-sm mt-1">Create your account &mdash; Step {step} of 2</p>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <form onSubmit={submit} className="space-y-4">
            {step === 1 ? (<>
              <div><label className="form-label">Full Name</label><input className="form-input" placeholder="Priya Sharma" value={form.name} onChange={F('name')} required /></div>
              <div><label className="form-label">Email</label><input className="form-input" type="email" placeholder="priya@company.com" value={form.email} onChange={F('email')} required /></div>
              <div><label className="form-label">Password</label><input className="form-input" type="password" placeholder="Min 8 characters" value={form.password} onChange={F('password')} required /></div>
              <div><label className="form-label">Company Name</label><input className="form-input" placeholder="Acme Pvt. Ltd." value={form.companyName} onChange={F('companyName')} required /></div>
            </>) : (<>
              <div><label className="form-label">Plan</label>
                <select className="form-select" value={form.plan} onChange={F('plan')}>
                  <option value="STARTER">Starter — ₹2,499/mo (1,000 msgs)</option>
                  <option value="GROWTH">Growth — ₹5,999/mo (10,000 msgs)</option>
                  <option value="ENTERPRISE">Enterprise — Custom</option>
                </select></div>
              <div><label className="form-label">State (for GST)</label>
                <select className="form-select" value={form.state} onChange={F('state')}>
                  {IN_STATES.map(s => <option key={s}>{s}</option>)}
                </select></div>
              <div><label className="form-label">GSTIN (optional)</label><input className="form-input font-mono" placeholder="22AAAAA0000A1Z5" value={form.gstin} onChange={F('gstin')} /></div>
              <div className="bg-green-50 rounded-lg p-3 text-xs text-green-700">14-day free trial, no credit card required. Cancel anytime.</div>
            </>)}
            <div className="flex gap-3 pt-2">
              {step === 2 && <button type="button" onClick={() => setStep(1)} className="flex-1 btn-outline">← Back</button>}
              <button type="submit" disabled={loading} className="flex-1 btn-brand justify-center py-2.5">
                {loading ? 'Creating…' : step === 1 ? 'Continue →' : 'Create Account'}
              </button>
            </div>
          </form>
          <div className="mt-4 text-center text-sm text-slate-500">
            Have an account? <Link href="/auth/login" className="text-green-600 font-medium hover:underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
