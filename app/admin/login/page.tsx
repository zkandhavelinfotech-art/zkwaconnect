"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function AdminLoginPage() {
  const router = useRouter()
  const [form,    setForm]    = useState({ email:"", password:"" })
  const [totp,    setTotp]    = useState("")
  const [needTotp,setNeedTotp]= useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState("")
  const F=(k:string)=>(e:React.ChangeEvent<HTMLInputElement>)=>setForm(f=>({...f,[k]:e.target.value}))

  async function submit(e:React.FormEvent) {
    e.preventDefault()
    setLoading(true);setError("")
    try {
      const r=await fetch("/api/auth/login",{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...form,adminLogin:true,...(needTotp&&totp?{totpCode:totp}:{})})})
      const d=await r.json()
      if(r.status===403&&d.require2FA){setNeedTotp(true);setError(d.error);setLoading(false);return}
      if(!r.ok){setError(d.error||"Login failed");setLoading(false);return}
      router.push("/admin/dashboard")
    } catch{setError("Network error");setLoading(false)}
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:420,background:"#fff",borderRadius:20,
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
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,
            padding:"10px 14px",fontSize:12,color:"#991b1b",display:"flex",
            alignItems:"flex-start",gap:8,marginBottom:20,lineHeight:1.5}}>
            <span>⚠️</span>
            <div>Staff only. Customer?{" "}
              <a href="/login" style={{color:"#dc2626",fontWeight:600}}>Use product login →</a>
            </div>
          </div>
          <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label className="form-label">Admin Email</label>
              <input className="form-input" type="email" value={form.email}
                onChange={F("email")} required autoComplete="email"/>
            </div>
            <div>
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={form.password}
                onChange={F("password")} required autoComplete="current-password"/>
            </div>
            {needTotp&&<div>
              <label className="form-label">Authenticator code</label>
              <input className="form-input" inputMode="numeric" autoComplete="one-time-code" autoFocus value={totp} maxLength={11}
                onChange={e=>setTotp(e.target.value)} placeholder="6-digit code or recovery code"/>
            </div>}
            {error&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",
              borderRadius:8,padding:10,fontSize:13,color:"#991b1b",textAlign:"center"}}>{error}</div>}
            <button type="submit" disabled={loading} style={{width:"100%",background:"#0f172a",
              color:"#fff",border:"none",borderRadius:10,padding:13,
              fontFamily:"Sora,sans-serif",fontSize:15,fontWeight:700,cursor:"pointer"}}>
              {loading?"Signing in…":needTotp?"Verify & sign in":"Sign in to Admin Panel"}
            </button>
          </form>
          <div style={{textAlign:"center",fontSize:12,color:"#94a3b8",marginTop:14}}>
            <a href="/login" style={{color:"#075E54",fontWeight:600}}>← Product login</a> · <a href="/forgot-password" style={{color:"#075E54",fontWeight:600}}>Forgot password?</a>
          </div>
        </div>
      </div>
    </div>
  )
}
