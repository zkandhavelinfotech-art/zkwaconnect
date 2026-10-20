"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogoLockup } from "@/components/Logo"

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/

export default function RegisterPage() {
  const router = useRouter()
  const [form,     setForm]     = useState({ name:"", organizationName:"", email:"", password:"", gstin:"" })
  const [showPass, setShowPass] = useState(false)
  const [agreed,   setAgreed]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  const F = (k:keyof typeof form) => (e:React.ChangeEvent<HTMLInputElement>) =>
    setForm(f=>({...f,[k]:k==="gstin"?e.target.value.toUpperCase().replace(/\s/g,""):e.target.value}))

  const focus = (e:React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor="#075E54")
  const blur  = (e:React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor="#e2e8f0")

  async function submit(e:React.FormEvent) {
    e.preventDefault()
    setError("")
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return }
    if (form.gstin && !GSTIN_PATTERN.test(form.gstin)) { setError("GSTIN should be 15 characters, e.g. 29ABCDE1234F1Z5."); return }
    if (!agreed) { setError("Please accept the Terms and Privacy Policy to continue."); return }
    setLoading(true)
    try {
      const r = await fetch("/api/auth/register",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ name:form.name.trim(), organizationName:form.organizationName.trim(),
          email:form.email.trim(), password:form.password, gstin:form.gstin||undefined }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error||"Could not create your account."); setLoading(false); return }
      router.push(d.redirect||"/onboarding/meta-connect")
    } catch { setError("Network error. Please try again."); setLoading(false) }
  }

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#075E54 0%,#128C7E 45%,#075E54 100%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:20, fontFamily:"DM Sans,sans-serif" }}>

      <div style={{ textAlign:"center", marginBottom:24 }}>
        <a href="/marketing" style={{ display:"inline-flex", alignItems:"center", gap:12, textDecoration:"none",
          background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.2)",
          borderRadius:16, padding:"12px 20px", marginBottom:10 }}>
          <LogoLockup size={40} />
        </a>
        <div style={{ fontSize:14, color:"rgba(255,255,255,.7)" }}>Official WhatsApp Business API · Free forever plan</div>
      </div>

      <div style={{ width:"100%", maxWidth:440, background:"#fff", borderRadius:20,
        padding:36, boxShadow:"0 24px 64px rgba(0,0,0,.25)", boxSizing:"border-box" }}>
        <h1 style={{ fontFamily:"Sora,sans-serif", fontSize:22, fontWeight:700,
          color:"#0f172a", margin:"0 0 4px" }}>Create your account</h1>
        <p style={{ fontSize:13, color:"#64748b", margin:"0 0 22px" }}>
          Start your 14-day free trial. No credit card required.
        </p>

        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column" }}>
          <label className="form-label" htmlFor="name">Your name</label>
          <input id="name" className="form-input" placeholder="Priya Sharma" value={form.name} onChange={F("name")}
            required minLength={2} maxLength={80} autoComplete="name" style={{ marginBottom:14 }} onFocus={focus} onBlur={blur} />

          <label className="form-label" htmlFor="org">Business name</label>
          <input id="org" className="form-input" placeholder="Sharma Textiles" value={form.organizationName} onChange={F("organizationName")}
            required minLength={2} maxLength={100} autoComplete="organization" style={{ marginBottom:14 }} onFocus={focus} onBlur={blur} />

          <label className="form-label" htmlFor="email">Work email</label>
          <input id="email" className="form-input" type="email" placeholder="you@company.com" value={form.email} onChange={F("email")}
            required autoComplete="email" style={{ marginBottom:14 }} onFocus={focus} onBlur={blur} />

          <label className="form-label" htmlFor="password">Password</label>
          <div style={{ position:"relative", marginBottom:4 }}>
            <input id="password" className="form-input" type={showPass?"text":"password"} placeholder="At least 8 characters"
              value={form.password} onChange={F("password")} required minLength={8} autoComplete="new-password"
              style={{ paddingRight:64, width:"100%", boxSizing:"border-box" }} onFocus={focus} onBlur={blur} />
            <button type="button" onClick={()=>setShowPass(v=>!v)} aria-label={showPass?"Hide password":"Show password"}
              style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none",
                fontSize:12, color:"#075E54", fontWeight:600, cursor:"pointer" }}>{showPass?"Hide":"Show"}</button>
          </div>
          <div style={{ fontSize:11, color:form.password&&form.password.length<8?"#b45309":"#94a3b8", marginBottom:14 }}>
            {form.password&&form.password.length<8?`${8-form.password.length} more character(s) needed`:"Use 8 or more characters"}
          </div>

          <label className="form-label" htmlFor="gstin">GSTIN <span style={{ fontWeight:400, color:"#94a3b8" }}>(optional, for GST invoices)</span></label>
          <input id="gstin" className="form-input" placeholder="29ABCDE1234F1Z5" value={form.gstin} onChange={F("gstin")}
            maxLength={15} style={{ marginBottom:14, fontFamily:"monospace", letterSpacing:1 }} onFocus={focus} onBlur={blur} />

          <label style={{ display:"flex", gap:9, alignItems:"flex-start", fontSize:12, color:"#475569", marginBottom:14, lineHeight:1.5 }}>
            <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{ marginTop:2 }} />
            <span>I agree to the <strong>Terms of Service</strong> and <strong>Privacy Policy</strong>.</span>
          </label>

          {error && (
            <div role="alert" style={{ background:"#fef2f2", border:"1px solid #fecaca",
              borderRadius:8, padding:"10px 14px", fontSize:13, color:"#991b1b",
              marginBottom:12, textAlign:"center" }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width:"100%", background:"#075E54", color:"#fff", border:"none",
            borderRadius:10, padding:13, fontFamily:"Sora,sans-serif",
            fontSize:15, fontWeight:700, cursor:loading?"not-allowed":"pointer",
            boxShadow:"0 4px 14px rgba(7,94,84,.35)", opacity:loading?.7:1, marginBottom:16
          }}>{loading?"Creating your account…":"Start for FREE →"}</button>
        </form>

        <div style={{ textAlign:"center", fontSize:13, color:"#64748b" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color:"#075E54", fontWeight:600, textDecoration:"none" }}>Sign in →</a>
        </div>
      </div>

      <div style={{ display:"flex", gap:16, flexWrap:"wrap", justifyContent:"center", marginTop:18,
        fontSize:12, color:"rgba(255,255,255,.6)" }}>
        <span>✓ Free WhatsApp API</span><span>✓ No credit card</span><span>✓ 5-min setup</span>
      </div>
    </div>
  )
}
