"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BrandMark, brandBackground, useBrand } from "@/components/brand/BrandMark"

const EMAIL_KEY="zk-login-email"
export default function LoginPage(){
  const router=useRouter();const brand=useBrand()
  const [form,setForm]=useState({email:"",password:""});const [totp,setTotp]=useState("");const [needTotp,setNeedTotp]=useState(false)
  const [remember,setRemember]=useState(true);const [show,setShow]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState("")
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY)
      if (saved) {
        setForm(current => ({ ...current, email: saved }))
      } else {
        setForm(current => ({ ...current, email: "rta@recruitmentacademy.com" }))
      }
    } catch {}
  }, [])

  function fillRta() {
    setForm({ email: "rta@recruitmentacademy.com", password: "rta1234" })
    setError("")
  }

  function fillSmeram() {
    setForm({ email: "smeram@smeramindustries.com", password: "smeram1234" })
    setError("")
  }
  async function submit(event:React.FormEvent){event.preventDefault();setLoading(true);setError("");try{
    const payload:Record<string,string>={email:form.email.trim(),password:form.password};if(needTotp&&totp)payload.totpCode=totp
    const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
    const body=await response.json();if(response.status===403&&body.require2FA){setNeedTotp(true);setError(body.error||"Enter your authenticator code.");setLoading(false);return}
    if(!response.ok)throw new Error(body.error||"Login failed.")
    try{if(remember)localStorage.setItem(EMAIL_KEY,form.email.trim());else localStorage.removeItem(EMAIL_KEY)}catch{}
    const from=new URLSearchParams(window.location.search).get("from");router.push(from&&from.startsWith("/")&&!from.startsWith("//")?from:body.redirect||"/app/dashboard")
  }catch(reason){setError(reason instanceof Error?reason.message:"Network error. Please try again.");setLoading(false)}}
  return <main style={{minHeight:"100vh",background:brandBackground(brand),display:"grid",placeItems:"center",padding:20,fontFamily:"DM Sans,sans-serif"}}>
    <div style={{width:"100%",maxWidth:420}}>
      <div style={{textAlign:"center",marginBottom:20}}><div style={{display:"inline-flex",background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.2)",borderRadius:16,padding:"12px 20px"}}><BrandMark brand={brand}/></div><p style={{color:"rgba(255,255,255,.72)",fontSize:13}}>Secure customer workspace</p></div>
      <section style={{background:"#fff",borderRadius:20,padding:32,boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
        <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,color:"#0f172a",margin:"0 0 5px"}}>Client Portal sign in</h1>
        <p style={{fontSize:13,color:"#64748b",margin:"0 0 16px",lineHeight:1.5}}>Use the credentials securely provided by your SaaS administrator.</p>

        {/* Quick-fill helper card */}
        <div style={{
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: 12,
          padding: "12px 14px",
          marginBottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, color: "#166534", fontSize: 12 }}>⚡ Client Portal Quick-Fill:</span>
            <span style={{ fontSize: 10, color: "#15803d", fontWeight: 700, background: "#dcfce7", padding: "2px 8px", borderRadius: 10 }}>1-CLICK LOGIN</span>
          </div>

          {/* Primary Tenant: RTA */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#ffffff",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #dcfce7",
          }}>
            <div>
              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 12 }}>Recruitment Training Academy (RTA)</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                <code>rta@recruitmentacademy.com</code> &bull; Pass: <code>rta1234</code>
              </div>
            </div>
            <button
              type="button"
              onClick={fillRta}
              style={{
                background: "#075e54",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Auto-Fill RTA
            </button>
          </div>

          {/* Secondary Tenant: Smeram */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#ffffff",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #dcfce7",
          }}>
            <div>
              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 12 }}>Smeram Industries</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                <code>smeram@smeramindustries.com</code> &bull; Pass: <code>smeram1234</code>
              </div>
            </div>
            <button
              type="button"
              onClick={fillSmeram}
              style={{
                background: "#0369a1",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Auto-Fill Smeram
            </button>
          </div>
        </div>

        <form onSubmit={submit} style={{display:"grid",gap:14}}>
          <label style={{fontSize:12,fontWeight:700,color:"#475569"}}>Email<input autoFocus autoComplete="email" type="email" required value={form.email} onChange={event=>setForm(current=>({...current,email:event.target.value}))} placeholder="you@company.com" style={{display:"block",width:"100%",boxSizing:"border-box",marginTop:6,border:"1.5px solid #e2e8f0",borderRadius:9,padding:"11px 12px",fontSize:14}}/></label>
          <label style={{fontSize:12,fontWeight:700,color:"#475569"}}>Password<div style={{position:"relative",marginTop:6}}><input autoComplete="current-password" type={show?"text":"password"} required value={form.password} onChange={event=>setForm(current=>({...current,password:event.target.value}))} style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"11px 58px 11px 12px",fontSize:14}}/><button type="button" onClick={()=>setShow(value=>!value)} style={{position:"absolute",right:8,top:9,border:0,background:"transparent",color:"#075e54",fontSize:11,fontWeight:800,cursor:"pointer"}}>{show?"Hide":"Show"}</button></div></label>
          {needTotp&&<label style={{fontSize:12,fontWeight:700,color:"#475569"}}>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" required value={totp} onChange={event=>setTotp(event.target.value.replace(/\D/g,"").slice(0,8))} style={{display:"block",width:"100%",boxSizing:"border-box",marginTop:6,border:"1.5px solid #e2e8f0",borderRadius:9,padding:11,fontSize:18,letterSpacing:4}}/></label>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}><label style={{color:"#64748b"}}><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)}/> Remember email</label><a href="/forgot-password" style={{color:"#075e54",fontWeight:700,textDecoration:"none"}}>Forgot password?</a></div>
          {error&&<div role="alert" style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"9px 11px",fontSize:12,color:"#991b1b"}}>{error}</div>}
          <button disabled={loading} style={{border:0,borderRadius:10,padding:12,background:"#075e54",color:"#fff",fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:800,cursor:"pointer",opacity:loading?.7:1}}>{loading?"Signing in…":"Sign in →"}</button>
        </form>
        <div style={{marginTop:17,paddingTop:14,borderTop:"1px solid #f1f5f9",fontSize:11,color:"#94a3b8",textAlign:"center"}}>New customer workspaces are created by SaaS Admin. <a href="/register?intent=trial" style={{color:"#075e54",fontWeight:800,textDecoration:"none"}}>Request a workspace →</a></div>
      </section>
      <div style={{textAlign:"center",marginTop:14}}><a href="/admin/login" style={{fontSize:11,color:"rgba(255,255,255,.68)",textDecoration:"none"}}>SaaS administrator portal →</a></div>
    </div>
  </main>
}
