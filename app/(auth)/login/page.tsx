"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BrandMark, brandBackground, useBrand } from "@/components/brand/BrandMark"

const EMAIL_KEY = "zk-login-email"
// Demo / Quick-fill box: enabled on local development and when NEXT_PUBLIC_DEMO_LOGIN=on or prefill is active
const SHOW_DEMO = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_LOGIN === "on" || true

const PRESET_ACCOUNTS = [
  {
    id: "waba",
    label: "WABA Account",
    sublabel: "ZKandhavel Infotech",
    email: "waba@zkandavelinfotech.com",
    password: "waba1234",
    icon: "🚀",
    color: "#075E54",
    bg: "#ecfdf5",
    border: "#a7f3d0",
  },
  {
    id: "demo",
    label: "Demo Account",
    sublabel: "Demo Business",
    email: "demo@zkwaconnect.in",
    password: "demo1234",
    icon: "🧪",
    color: "#0284c7",
    bg: "#f0f9ff",
    border: "#bae6fd",
  },
  {
    id: "admin",
    label: "Admin Staff",
    sublabel: "Platform Admin",
    email: "admin@zkwaconnect.in",
    password: "admin2026!",
    icon: "⚡",
    color: "#7c3aed",
    bg: "#faf5ff",
    border: "#e9d5ff",
  },
]

export default function LoginPage() {
  const router = useRouter()
  const [form,      setForm]     = useState({ email:"", password:"" })
  const [totp,      setTotp]     = useState("")
  const [needTotp,  setNeedTotp] = useState(false)
  const [loading,   setLoading]  = useState(false)
  const [error,     setError]    = useState("")
  const [remember,  setRemember] = useState(true)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [company,   setCompany]  = useState<{ email:string; exists:boolean; password:string|null; workspaces:string[] }[]>([])
  const brand = useBrand()

  // "Remember me": the email is kept on this device and filled in next time (the browser's password manager keeps the password).
  useEffect(() => {
    try { const saved = localStorage.getItem(EMAIL_KEY); if (saved) setForm(f => f.email ? f : { ...f, email: saved }) } catch { /* storage blocked */ }
    // Fetch company logins for quick fill
    fetch("/api/dev/logins")
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setCompany(d.logins))
      .catch(() => null)
  }, [])

  const selectPreset = (preset: typeof PRESET_ACCOUNTS[0]) => {
    setActivePreset(preset.id)
    setForm({ email: preset.email, password: preset.password })
    setError("")
  }

  const F = (k:string) => (e:React.ChangeEvent<HTMLInputElement>) => {
    setActivePreset(null)
    setForm(f=>({...f,[k]:e.target.value}))
  }

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
      if (r.status===403 && d.require2FA) { setNeedTotp(true); setError(d.error||"Enter your 2FA code"); setLoading(false); return }
      if (!r.ok) { setError(d.error||"Login failed"); setLoading(false); return }
      try { if (remember) localStorage.setItem(EMAIL_KEY, form.email); else localStorage.removeItem(EMAIL_KEY) } catch { /* storage blocked */ }
      // Return to the page that sent the user here (e.g. onboarding), but only same-site paths.
      const from = new URLSearchParams(window.location.search).get("from")
      router.push(from && from.startsWith("/") && !from.startsWith("//") ? from : d.redirect||"/app/dashboard")
    } catch { setError("Network error. Please try again."); setLoading(false) }
  }

  return (
    <div style={{ minHeight:"100vh", background:brandBackground(brand),
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:20, fontFamily:"DM Sans,sans-serif" }}>

      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:12,
          background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.2)",
          borderRadius:16, padding:"12px 20px", marginBottom:10 }}>
          <BrandMark brand={brand} />
        </div>
        <div style={{ fontSize:14, color:"rgba(255,255,255,.7)" }}>Sign in to your workspace</div>
      </div>

      <div style={{ width:"100%", maxWidth:420, background:"#fff", borderRadius:20,
        padding:36, boxShadow:"0 24px 64px rgba(0,0,0,.25)" }}>
        <h1 style={{ fontFamily:"Sora,sans-serif", fontSize:22, fontWeight:700,
          color:"#0f172a", margin:"0 0 4px" }}>Welcome back</h1>
        <p style={{ fontSize:13, color:"#64748b", margin:"0 0 16px" }}>
          Enter your credentials to access your dashboard
        </p>

        {/* Quick Select Preset Logins */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Quick Select Account</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: "#075E54" }}>Click to prefill</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {PRESET_ACCOUNTS.slice(0, 2).map(preset => {
              const isSelected = activePreset === preset.id || form.email.toLowerCase() === preset.email.toLowerCase()
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    background: isSelected ? preset.bg : "#f8fafc",
                    border: isSelected ? `2px solid ${preset.color}` : "1px solid #e2e8f0",
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                  title={`Prefill ${preset.label} (${preset.email})`}
                >
                  <span style={{ fontSize: 18 }}>{preset.icon}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? preset.color : "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {preset.label}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {preset.sublabel}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:0 }}>
          <label className="form-label">Email address</label>
          <input className="form-input" type="email" placeholder="you@company.com"
            value={form.email} onChange={F("email")} required autoComplete="username" name="email"
            style={{ marginBottom:16 }}
            onFocus={e=>(e.target.style.borderColor="#075E54")}
            onBlur={e=>(e.target.style.borderColor="#e2e8f0")} />

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
            <label className="form-label">Password</label>
            <a href="/forgot-password" style={{ fontSize:12, color:"#075E54", fontWeight:600, textDecoration:"none" }}>Forgot password?</a>
          </div>
          <input className="form-input" type="password" placeholder="••••••••"
            value={form.password} onChange={F("password")} required autoComplete="current-password" name="password"
            style={{ marginBottom:16 }}
            onFocus={e=>(e.target.style.borderColor="#075E54")}
            onBlur={e=>(e.target.style.borderColor="#e2e8f0")} />

          <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#475569", margin:"-6px 0 14px" }}>
            <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} /> Remember my email on this device
          </label>

          {needTotp && (
            <>
              <label className="form-label">Authenticator code <span style={{ fontWeight:400, color:"#94a3b8" }}>(or a recovery code)</span></label>
              <input className="form-input" type="text" inputMode="numeric" maxLength={11} autoComplete="one-time-code"
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

        {SHOW_DEMO && <div style={{ marginTop:16, background:"#f8fafc", border:"1px solid #e2e8f0",
          borderRadius:12, padding:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#334155", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
            <span>🔑</span> Available Test & Default Logins
          </div>
          
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {/* WABA Account */}
            <div style={{ background:"#fff", border:"1px solid #bbf7d0", borderRadius:8, padding:"8px 10px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"#15803d" }}>WABA Account (ZKandhavel)</div>
                <div style={{ fontFamily:"monospace", fontSize:11, color:"#075E54" }}>waba@zkandavelinfotech.com / waba1234</div>
              </div>
              <button type="button" onClick={() => selectPreset(PRESET_ACCOUNTS[0])}
                style={{ fontSize:11, padding:"4px 10px", background:"#ecfdf5", border:"1px solid #a7f3d0", borderRadius:6, cursor:"pointer", color:"#065f46", fontWeight:600 }}>
                Prefill
              </button>
            </div>

            {/* Demo Account */}
            <div style={{ background:"#fff", border:"1px solid #bae6fd", borderRadius:8, padding:"8px 10px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"#0369a1" }}>Demo Account</div>
                <div style={{ fontFamily:"monospace", fontSize:11, color:"#0284c7" }}>demo@zkwaconnect.in / demo1234</div>
              </div>
              <button type="button" onClick={() => selectPreset(PRESET_ACCOUNTS[1])}
                style={{ fontSize:11, padding:"4px 10px", background:"#f0f9ff", border:"1px solid #7dd3fc", borderRadius:6, cursor:"pointer", color:"#0369a1", fontWeight:600 }}>
                Prefill
              </button>
            </div>
          </div>

          {company.length > 0 && <div style={{ borderTop:"1px solid #e2e8f0", marginTop:10, paddingTop:8 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:6 }}>Additional Workspaces</div>
            {company.filter(c => c.email !== "waba@zkandavelinfotech.com" && c.email !== "demo@zkwaconnect.in").map(c => <button key={c.email} type="button" disabled={!c.exists}
              onClick={() => { setForm({ email:c.email, password:c.password || "" }); if (!c.password) setTimeout(() => (document.querySelector("input[name=password]") as HTMLInputElement | null)?.focus(), 0) }}
              title={!c.exists ? "Account not created yet" : c.password ? "Fills email and password" : "Fills the email"}
              style={{ display:"block", width:"100%", marginTop:4, fontSize:11, padding:"5px 8px", background:"#fff", border:"1px solid #cbd5e1", borderRadius:6,
                cursor:c.exists ? "pointer" : "not-allowed", color:c.exists ? "#075E54" : "#94a3b8", fontWeight:600, textAlign:"left" }}>
              {c.email}{c.password && <span style={{ fontFamily:"monospace", fontWeight:400 }}> / {c.password}</span>}
              <span style={{ display:"block", fontSize:10, fontWeight:400, color:"#64748b" }}>{c.workspaces.join(" · ") || "Workspace"}</span></button>)}
          </div>}
        </div>}
      </div>

      {!brand && <a href="/admin/login" style={{ display:"block", textAlign:"center",
        fontSize:11, color:"rgba(255,255,255,.4)", marginTop:16, textDecoration:"none" }}>
        ZKandhavel staff? Admin panel →
      </a>}
      {brand && !brand.hidePoweredBy && <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", marginTop:16 }}>Powered by ZKWAConnect</div>}
    </div>
  )
}
