"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BrandMark, brandBackground, useBrand } from "@/components/brand/BrandMark"

const EMAIL_KEY = "zk-login-email"
// Demo / Quick-fill box: enabled on local development and when NEXT_PUBLIC_DEMO_LOGIN=on or prefill is active
const SHOW_DEMO = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_LOGIN === "on" || true

// Preset accounts organized by Customer Clients (AiSensy/Interakt style) vs SaaS Product Admin
const PRESET_ACCOUNTS = [
  // 1. Customer Clients (Registered Businesses)
  {
    id: "rta",
    category: "CLIENT" as const,
    label: "Recruitment Training Academy",
    sublabel: "Client Portal · EdTech",
    workspace: "Recruitment Training Academy",
    email: "rta@recruitmentacademy.com",
    altEmail: "rta@gmail.com",
    password: "rta1234",
    icon: "🎓",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#a7f3d0",
  },
  {
    id: "smeram",
    category: "CLIENT" as const,
    label: "Smeram Industries",
    sublabel: "Client Portal · Manufacturing",
    workspace: "Smeram Industries",
    email: "smeram@smeramindustries.com",
    altEmail: "smeram@gmail.com",
    password: "smeram1234",
    icon: "🏭",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
  },
  // 2. SaaS Product Admin & Testing Logins
  {
    id: "admin",
    category: "ADMIN" as const,
    label: "SaaS Product Admin",
    sublabel: "Super Admin (Full SaaS Overview)",
    workspace: "Platform Admin & All Tenants",
    email: "admin@zkwaconnect.in",
    password: "admin2026!",
    icon: "⚡",
    color: "#7c3aed",
    bg: "#faf5ff",
    border: "#e9d5ff",
  },
  {
    id: "waba",
    category: "ADMIN" as const,
    label: "WABA Root Admin",
    sublabel: "ZKandhavel Infotech Root Owner",
    workspace: "ZKandavel Infotech (WABA)",
    email: "waba@zkandavelinfotech.com",
    password: "waba1234",
    icon: "🚀",
    color: "#075E54",
    bg: "#ecfdf5",
    border: "#a7f3d0",
  },
  {
    id: "demo",
    category: "ADMIN" as const,
    label: "Demo Sandbox",
    sublabel: "Pre-configured Bot Flows",
    workspace: "Demo Business",
    email: "demo@zkwaconnect.in",
    password: "demo1234",
    icon: "🧪",
    color: "#0284c7",
    bg: "#f0f9ff",
    border: "#bae6fd",
  },
]

export default function LoginPage() {
  const router = useRouter()
  const [form,          setForm]         = useState({ email:"", password:"" })
  const [totp,          setTotp]         = useState("")
  const [needTotp,      setNeedTotp]     = useState(false)
  const [loading,       setLoading]      = useState(false)
  const [error,         setError]        = useState("")
  const [remember,      setRemember]     = useState(true)
  const [accountTab,    setAccountTab]   = useState<"CLIENT" | "ADMIN">("CLIENT")
  const [activePreset,  setActivePreset] = useState<string | null>("rta")
  const [company,       setCompany]      = useState<{ email:string; exists:boolean; password:string|null; workspaces:string[] }[]>([])
  const brand = useBrand()

  // Initialize with the first client account on first render
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY)
      if (saved) {
        setForm(f => f.email ? f : { ...f, email: saved })
      } else {
        // Default to Recruitment Training Academy client login
        setForm({ email: PRESET_ACCOUNTS[0].email, password: PRESET_ACCOUNTS[0].password })
      }
    } catch { /* storage blocked */ }

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

  const activeAccount = PRESET_ACCOUNTS.find(p => p.id === activePreset) || PRESET_ACCOUNTS.find(p => p.email.toLowerCase() === form.email.toLowerCase())
  const filteredPresets = PRESET_ACCOUNTS.filter(p => p.category === accountTab)

  return (
    <div style={{ minHeight:"100vh", background:brandBackground(brand),
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:20, fontFamily:"DM Sans,sans-serif" }}>

      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:12,
          background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.2)",
          borderRadius:16, padding:"12px 20px", marginBottom:10 }}>
          <BrandMark brand={brand} />
        </div>
        <div style={{ fontSize:14, color:"rgba(255,255,255,.8)", fontWeight:500 }}>
          WhatsApp Business SaaS Platform · Multi-Tenant Portal
        </div>
      </div>

      <div style={{ width:"100%", maxWidth:480, background:"#fff", borderRadius:20,
        padding:"32px 30px", boxShadow:"0 24px 64px rgba(0,0,0,.25)" }}>
        
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
          <h1 style={{ fontFamily:"Sora,sans-serif", fontSize:22, fontWeight:700, color:"#0f172a", margin:0 }}>
            Sign In to Portal
          </h1>
          <span style={{ fontSize:11, background:"#ecfdf5", color:"#065f46", border:"1px solid #a7f3d0", padding:"2px 8px", borderRadius:12, fontWeight:700 }}>
            v5.2.0 LIVE
          </span>
        </div>
        <p style={{ fontSize:13, color:"#64748b", margin:"0 0 16px" }}>
          Choose customer client portal or product admin to prefill credentials
        </p>

        {/* Category Switcher: Customer Clients vs SaaS Admin */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", background: "#f1f5f9", padding: 4, borderRadius: 12, gap: 4, border: "1px solid #e2e8f0" }}>
            <button
              type="button"
              onClick={() => setAccountTab("CLIENT")}
              style={{
                flex: 1,
                border: 0,
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                background: accountTab === "CLIENT" ? "#ffffff" : "transparent",
                color: accountTab === "CLIENT" ? "#065f46" : "#64748b",
                boxShadow: accountTab === "CLIENT" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all .15s ease",
              }}
            >
              <span>🏢</span>
              <span>1. Customer Clients ({PRESET_ACCOUNTS.filter(p => p.category === "CLIENT").length})</span>
            </button>
            <button
              type="button"
              onClick={() => setAccountTab("ADMIN")}
              style={{
                flex: 1,
                border: 0,
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                background: accountTab === "ADMIN" ? "#ffffff" : "transparent",
                color: accountTab === "ADMIN" ? "#7c3aed" : "#64748b",
                boxShadow: accountTab === "ADMIN" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all .15s ease",
              }}
            >
              <span>⚡</span>
              <span>2. SaaS Admin ({PRESET_ACCOUNTS.filter(p => p.category === "ADMIN").length})</span>
            </button>
          </div>
        </div>

        {/* Quick Select Preset Cards */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: filteredPresets.length === 2 ? "1fr 1fr" : "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
            {filteredPresets.map(preset => {
              const isSelected = activePreset === preset.id || form.email.toLowerCase() === preset.email.toLowerCase()
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 4,
                    padding: "10px 12px",
                    background: isSelected ? preset.bg : "#f8fafc",
                    border: isSelected ? `2px solid ${preset.color}` : "1px solid #e2e8f0",
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    position: "relative",
                  }}
                  title={`Prefill ${preset.label} (${preset.email})`}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <span style={{ fontSize: 20 }}>{preset.icon}</span>
                    {isSelected && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: preset.color, background: "#fff", padding: "1px 6px", borderRadius: 8, border: `1px solid ${preset.border}` }}>
                        ✓ ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, width: "100%", marginTop: 2 }}>
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

          {/* Active Preset Indicator */}
          {activeAccount && (
            <div style={{ marginTop: 8, background: activeAccount.bg, border: `1px solid ${activeAccount.border}`, borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: activeAccount.color, fontWeight: 700 }}>
                <span>🎯</span>
                <span>Workspace: <strong>{activeAccount.workspace}</strong></span>
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#475569" }}>
                {activeAccount.email}
              </span>
            </div>
          )}
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
          }}>
            {loading ? "Signing in…" : needTotp ? "Verify & Sign In →" : activeAccount ? `Sign In as ${activeAccount.label.split(" ")[0]} →` : "Sign In →"}
          </button>
        </form>

        <div style={{ textAlign:"center", fontSize:13, color:"#64748b" }}>
          New business onboarding?{" "}
          <a href="/register" style={{ color:"#075E54", fontWeight:600, textDecoration:"none" }}>
            Start 7-day free trial →
          </a>
        </div>

        {SHOW_DEMO && <div style={{ marginTop:16, background:"#f8fafc", border:"1px solid #e2e8f0",
          borderRadius:12, padding:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#334155", marginBottom:8, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span>🔑</span> Credentials Directory (1-Click Fill)
            </span>
            <span style={{ fontSize:10, color:"#075E54", fontWeight:600 }}>Ready for Demo & Clients</span>
          </div>
          
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {PRESET_ACCOUNTS.map(acc => (
              <div
                key={acc.id}
                style={{
                  background: "#fff",
                  border: `1px solid ${form.email.toLowerCase() === acc.email.toLowerCase() ? acc.color : "#e2e8f0"}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: acc.color, display: "flex", alignItems: "center", gap: 5 }}>
                    <span>{acc.icon}</span>
                    <span>{acc.label}</span>
                    <span style={{ fontSize: 9, background: acc.bg, color: acc.color, padding: "1px 5px", borderRadius: 6, border: `1px solid ${acc.border}` }}>
                      {acc.category === "CLIENT" ? "Customer Client" : "SaaS Admin"}
                    </span>
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", marginTop: 2 }}>
                    {acc.email} <span style={{ color: "#075E54", fontWeight: 700 }}>/ {acc.password}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => selectPreset(acc)}
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    background: acc.bg,
                    border: `1px solid ${acc.border}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    color: acc.color,
                    fontWeight: 700,
                  }}
                >
                  Prefill
                </button>
              </div>
            ))}
          </div>

          {company.length > 0 && <div style={{ borderTop:"1px solid #e2e8f0", marginTop:10, paddingTop:8 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:6 }}>Additional Company Workspaces</div>
            {company.filter(c => !PRESET_ACCOUNTS.some(p => p.email.toLowerCase() === c.email.toLowerCase())).map(c => <button key={c.email} type="button" disabled={!c.exists}
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
