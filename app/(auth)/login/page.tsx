"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogoLockup } from "@/components/Logo"

export default function LoginPage() {
  const router = useRouter()
  const [form,      setForm]     = useState({ email:"", password:"" })
  const [totp,      setTotp]     = useState("")
  const [needTotp,  setNeedTotp] = useState(false)
  const [loading,   setLoading]  = useState(false)
  const [error,     setError]    = useState("")

  const F = (k:string) => (e:React.ChangeEvent<HTMLInputElement>) =>
    setForm(f=>({...f,[k]:e.target.value}))

  async function submit(e:React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError("")
    try {
      const body:Record<string,string> = { email:form.email, password:form.password }
      if (needTotp && totp) body.totpCode = totp
      const r = await fetch("/api/auth/login",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body)
      })
      const d = await r.json()
      if (r.status===403 && d.require2FA) { setNeedTotp(true); setError("Enter your 2FA code"); setLoading(false); return }
      if (!r.ok) { setError(d.error||"Login failed"); setLoading(false); return }
      // Return to the page that sent the user here (e.g. onboarding), but only same-site paths.
      const from = new URLSearchParams(window.location.search).get("from")
      router.push(from && from.startsWith("/") && !from.startsWith("//") ? from : d.redirect||"/app/dashboard")
    } catch { setError("Network error. Please try again."); setLoading(false) }
  }

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#075E54 0%,#128C7E 45%,#075E54 100%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:20, fontFamily:"DM Sans,sans-serif" }}>

      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:12,
          background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.2)",
          borderRadius:16, padding:"12px 20px", marginBottom:10 }}>
          <LogoLockup size={40} />
        </div>
        <div style={{ fontSize:14, color:"rgba(255,255,255,.7)" }}>Sign in to your workspace</div>
      </div>

      <div style={{ width:"100%", maxWidth:420, background:"#fff", borderRadius:20,
        padding:36, boxShadow:"0 24px 64px rgba(0,0,0,.25)" }}>
        <h1 style={{ fontFamily:"Sora,sans-serif", fontSize:22, fontWeight:700,
          color:"#0f172a", margin:"0 0 4px" }}>Welcome back</h1>
        <p style={{ fontSize:13, color:"#64748b", margin:"0 0 24px" }}>
          Enter your credentials to access your dashboard
        </p>
        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:0 }}>
          <label className="form-label">Email address</label>
          <input className="form-input" type="email" placeholder="you@company.com"
            value={form.email} onChange={F("email")} required autoComplete="email"
            style={{ marginBottom:16 }}
            onFocus={e=>(e.target.style.borderColor="#075E54")}
            onBlur={e=>(e.target.style.borderColor="#e2e8f0")} />

          <label className="form-label">Password</label>
          <input className="form-input" type="password" placeholder="••••••••"
            value={form.password} onChange={F("password")} required
            style={{ marginBottom:16 }}
            onFocus={e=>(e.target.style.borderColor="#075E54")}
            onBlur={e=>(e.target.style.borderColor="#e2e8f0")} />

          {needTotp && (
            <>
              <label className="form-label">2FA Code</label>
              <input className="form-input" type="text" inputMode="numeric" maxLength={6}
                placeholder="· · · · · ·" value={totp}
                onChange={e=>setTotp(e.target.value)} autoFocus
                style={{ fontFamily:"monospace", fontSize:22, letterSpacing:10,
                  textAlign:"center", marginBottom:16 }}
                onFocus={e=>(e.target.style.borderColor="#075E54")}
                onBlur={e=>(e.target.style.borderColor="#e2e8f0")} />
            </>
          )}

          {error && (
            <div style={{ background:"#fef2f2", border:"1px solid #fecaca",
              borderRadius:8, padding:"10px 14px", fontSize:13, color:"#991b1b",
              marginBottom:12, textAlign:"center" }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width:"100%", background:"#075E54", color:"#fff", border:"none",
            borderRadius:10, padding:13, fontFamily:"Sora,sans-serif",
            fontSize:15, fontWeight:700, cursor:loading?"not-allowed":"pointer",
            boxShadow:"0 4px 14px rgba(7,94,84,.35)", opacity:loading?.7:1, marginBottom:16
          }}>{loading?"Signing in…":needTotp?"Verify & Sign In →":"Sign In →"}</button>
        </form>

        <div style={{ textAlign:"center", fontSize:13, color:"#64748b" }}>
          No account?{" "}
          <a href="/register" style={{ color:"#075E54", fontWeight:600, textDecoration:"none" }}>
            Start 7-day free trial →
          </a>
        </div>

        <div style={{ marginTop:16, background:"#f0fdf4", border:"1px solid #bbf7d0",
          borderRadius:10, padding:14, textAlign:"center" }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#15803d", marginBottom:6 }}>Demo account</div>
          <div style={{ fontFamily:"monospace", fontSize:13, color:"#075E54", lineHeight:1.8 }}>
            demo@zkwaconnect.in / demo1234
          </div>
          <button type="button" onClick={()=>setForm({email:"demo@zkwaconnect.in",password:"demo1234"})}
            style={{ marginTop:8, fontSize:11, padding:"4px 12px", background:"#fff",
              border:"1px solid #bbf7d0", borderRadius:6, cursor:"pointer",
              color:"#15803d", fontWeight:600 }}>Fill demo credentials</button>
        </div>
      </div>

      <a href="/admin/login" style={{ display:"block", textAlign:"center",
        fontSize:11, color:"rgba(255,255,255,.4)", marginTop:16, textDecoration:"none" }}>
        ZKandhavel staff? Admin panel →
      </a>
    </div>
  )
}
