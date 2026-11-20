"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const EMAIL_KEY = "zk-admin-email"
export default function AdminLoginPage() {
  const router = useRouter()
  const [form,    setForm]    = useState({ email:"", password:"" })
  const [showPwd, setShowPwd] = useState(false)
  const [totp,    setTotp]    = useState("")
  const [needTotp,setNeedTotp]= useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState("")
  const [remember,setRemember]=useState(true)
  const F=(k:string)=>(e:React.ChangeEvent<HTMLInputElement>)=>setForm(f=>({...f,[k]:e.target.value}))

  useEffect(()=>{
    try {
      const saved=localStorage.getItem(EMAIL_KEY)
      if(saved) setForm(f=>f.email?f:{...f,email:saved})
      else setForm(f=>f.email?f:{...f,email:"zkandhavelinfotech@gmail.com"})
    } catch { /* storage blocked */ }
  },[])

  function fillSuperAdmin() {
    setForm({ email: "zkandhavelinfotech@gmail.com", password: "Admin@123" })
    setError("")
  }

  async function submit(e:React.FormEvent) {
    e.preventDefault()
    setLoading(true);setError("")
    try {
      const cleanEmail = form.email.trim().toLowerCase()
      const r=await fetch("/api/auth/login",{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          email: cleanEmail,
          password: form.password,
          adminLogin: true,
          ...(needTotp&&totp?{totpCode:totp}:{})
        })
      })
      const d=await r.json()
      if(r.status===403&&d.require2FA){setNeedTotp(true);setError(d.error);setLoading(false);return}
      if(!r.ok){setError(d.error||"Login failed");setLoading(false);return}
      try { if(remember) localStorage.setItem(EMAIL_KEY,cleanEmail); else localStorage.removeItem(EMAIL_KEY) } catch { /* storage blocked */ }
      router.push("/admin/dashboard")
    } catch{setError("Network error");setLoading(false)}
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:440,background:"#fff",borderRadius:20,
        overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,.4)"}}>
        <div style={{background:"linear-gradient(135deg,#1e293b,#0f172a)",
          padding:"28px 32px 24px",borderBottom:"3px solid #dc2626"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,
            background:"rgba(220,38,38,.15)",border:"1px solid rgba(220,38,38,.3)",
            borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700,
            color:"#fca5a5",textTransform:"uppercase",letterSpacing:".1em",marginBottom:14}}>
            🔐 Admin Access
          </div>
          <div style={{fontFamily:"Sora,sans-serif",fontSize:20,fontWeight:700,color:"#fff"}}>
            ZKWAConnect Admin
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:3}}>
            Super admin · Internal access only
          </div>
        </div>
        <div style={{padding:32}}>
          {/* Quick-fill helper banner */}
          <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,
            padding:"12px 14px",fontSize:12,color:"#334155",marginBottom:18,display:"flex",
            flexDirection:"column",gap:8}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontWeight:700,color:"#0f172a",display:"flex",alignItems:"center",gap:5}}>
                <span>🛡️</span> Super Admin Login
              </span>
              <button type="button" onClick={fillSuperAdmin} style={{
                background:"#dc2626",color:"#fff",border:"none",borderRadius:6,
                padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"
              }}>
                ⚡ Quick Fill (Admin@123)
              </button>
            </div>
            <div style={{fontSize:11,color:"#64748b",lineHeight:1.4}}>
              User: <code style={{background:"#e2e8f0",padding:"1px 4px",borderRadius:4,color:"#0f172a"}}>zkandhavelinfotech@gmail.com</code><br/>
              Password: <code style={{background:"#e2e8f0",padding:"1px 4px",borderRadius:4,color:"#0f172a"}}>Admin@123</code>
            </div>
          </div>

          <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label className="form-label" style={{display:"block",marginBottom:6,fontSize:12,fontWeight:700,color:"#475569"}}>Admin Email</label>
              <input className="form-input" type="email" value={form.email}
                onChange={F("email")} required autoComplete="username" name="email"
                placeholder="zkandhavelinfotech@gmail.com"
                style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"11px 12px",fontSize:14}}/>
            </div>
            <div>
              <label className="form-label" style={{display:"block",marginBottom:6,fontSize:12,fontWeight:700,color:"#475569"}}>Password</label>
              <div style={{position:"relative"}}>
                <input className="form-input" type={showPwd?"text":"password"} value={form.password}
                  onChange={F("password")} required autoComplete="current-password" name="password"
                  placeholder="Enter admin password (Admin@123)"
                  style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"11px 58px 11px 12px",fontSize:14}}/>
                <button type="button" onClick={()=>setShowPwd(v=>!v)} style={{
                  position:"absolute",right:8,top:9,border:0,background:"transparent",color:"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"
                }}>
                  {showPwd?"Hide":"Show"}
                </button>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}>
              <label style={{display:"flex",alignItems:"center",gap:8,color:"#475569",cursor:"pointer"}}>
                <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Remember email
              </label>
              <a href="/login" style={{color:"#dc2626",fontWeight:600,textDecoration:"none"}}>Client Portal login →</a>
            </div>
            {needTotp&&<div>
              <label className="form-label" style={{display:"block",marginBottom:6,fontSize:12,fontWeight:700,color:"#475569"}}>Authenticator code</label>
              <input className="form-input" inputMode="numeric" autoComplete="one-time-code" autoFocus value={totp} maxLength={11}
                onChange={e=>setTotp(e.target.value)} placeholder="6-digit code or recovery code"
                style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"11px 12px",fontSize:16,letterSpacing:4}}/>
            </div>}
            {error&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",
              borderRadius:8,padding:10,fontSize:13,color:"#991b1b",textAlign:"center"}}>{error}</div>}
            <button type="submit" disabled={loading} style={{width:"100%",background:"#0f172a",
              color:"#fff",border:"none",borderRadius:10,padding:13,
              fontFamily:"Sora,sans-serif",fontSize:15,fontWeight:700,cursor:"pointer",
              opacity:loading?0.7:1}}>
              {loading?"Signing in…":needTotp?"Verify & sign in":"Sign in to Admin Panel →"}
            </button>
          </form>
          <div style={{textAlign:"center",fontSize:12,color:"#94a3b8",marginTop:16}}>
            <a href="/login" style={{color:"#075E54",fontWeight:600,textDecoration:"none"}}>← Client Portal login</a> · <a href="/forgot-password" style={{color:"#075E54",fontWeight:600,textDecoration:"none"}}>Forgot password?</a>
          </div>
        </div>
      </div>
    </div>
  )
}
