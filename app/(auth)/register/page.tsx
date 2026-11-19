"use client"

import { useState } from "react"
import { BrandMark, brandBackground, useBrand } from "@/components/brand/BrandMark"

const input: React.CSSProperties = { width:"100%", boxSizing:"border-box", marginTop:6, border:"1.5px solid #dbe4ea", borderRadius:9, padding:"11px 12px", fontSize:14, background:"#fff" }

export default function RegisterPage() {
  const brand = useBrand()
  const [form,setForm] = useState({name:"",businessName:"",email:"",phone:"",expectedVolume:"UNDER_1K",message:"",website:""})
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState("")
  const [success,setSuccess] = useState("")

  async function submit(event:React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("")
    try {
      const response = await fetch("/api/auth/register", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)})
      const body = await response.json()
      if(!response.ok) throw new Error(body.error || "Could not submit your request.")
      setSuccess(body.message)
    } catch(reason) { setError(reason instanceof Error ? reason.message : "Could not submit your request.") }
    finally { setLoading(false) }
  }

  return <main style={{minHeight:"100vh",background:brandBackground(brand),padding:"28px 18px",fontFamily:"DM Sans,sans-serif"}}>
    <div style={{maxWidth:980,margin:"0 auto"}}>
      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,marginBottom:28}}>
        <a href="/marketing" style={{display:"inline-flex",background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.18)",borderRadius:14,padding:"10px 16px",textDecoration:"none"}}><BrandMark brand={brand}/></a>
        <a href="/login" style={{color:"#fff",border:"1px solid rgba(255,255,255,.32)",borderRadius:9,padding:"9px 14px",fontSize:13,fontWeight:800,textDecoration:"none"}}>Existing customer? Sign in →</a>
      </header>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,390px),1fr))",gap:22,alignItems:"start"}}>
        <section style={{color:"#fff",padding:"24px 10px"}}>
          <div style={{display:"inline-flex",background:"rgba(37,211,102,.14)",color:"#86efac",border:"1px solid rgba(37,211,102,.24)",borderRadius:20,padding:"5px 11px",fontSize:11,fontWeight:900,letterSpacing:".05em"}}>MANAGED BUSINESS ONBOARDING</div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:"clamp(30px,5vw,46px)",lineHeight:1.08,margin:"18px 0 12px"}}>Start your WhatsApp workspace.</h1>
          <p style={{color:"rgba(255,255,255,.72)",fontSize:15,lineHeight:1.65,maxWidth:500}}>Request a free workspace review. Our SaaS onboarding team verifies your business, creates an isolated tenant, connects the approved Meta assets, and securely issues your login.</p>
          <div style={{display:"grid",gap:12,marginTop:26,fontSize:13}}>
            {["Submit business details","SaaS Admin creates your workspace","Meta and WhatsApp access is verified","You receive secure client login credentials"].map((label,index)=><div key={label} style={{display:"flex",alignItems:"center",gap:11}}><span style={{width:26,height:26,borderRadius:"50%",background:index===0?"#25D366":"rgba(255,255,255,.1)",color:index===0?"#053d36":"#fff",display:"grid",placeItems:"center",fontWeight:900,fontSize:11}}>{index+1}</span>{label}</div>)}
          </div>
          <p style={{fontSize:11,color:"rgba(255,255,255,.5)",lineHeight:1.55,marginTop:24}}>The same isolated onboarding process is used for every customer and future business. No client-specific account is hardcoded.</p>
        </section>
        <section style={{background:"#fff",borderRadius:20,padding:"clamp(22px,4vw,34px)",boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
          {success ? <div style={{textAlign:"center",padding:"20px 4px"}}>
            <div style={{width:54,height:54,borderRadius:"50%",background:"#dcfce7",color:"#15803d",display:"grid",placeItems:"center",fontSize:26,fontWeight:900,margin:"0 auto 14px"}}>✓</div>
            <h2 style={{fontFamily:"Sora,sans-serif",fontSize:21,color:"#0f172a",margin:"0 0 9px"}}>Request received</h2>
            <p style={{fontSize:13,color:"#64748b",lineHeight:1.6}}>{success}</p>
            <a href="/login" style={{display:"block",marginTop:18,background:"#075e54",color:"#fff",borderRadius:9,padding:11,fontWeight:800,fontSize:13,textDecoration:"none"}}>Already received credentials? Sign in →</a>
          </div> : <>
            <h2 style={{fontFamily:"Sora,sans-serif",fontSize:21,color:"#0f172a",margin:"0 0 5px"}}>Request your workspace</h2>
            <p style={{fontSize:12,color:"#64748b",lineHeight:1.5,margin:"0 0 18px"}}>No credit card required. Submitting this form does not create unverified Meta access.</p>
            <form onSubmit={submit} style={{display:"grid",gap:12}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12}}>
                <label style={{fontSize:12,fontWeight:800,color:"#475569"}}>Your name<input required minLength={2} value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} style={input}/></label>
                <label style={{fontSize:12,fontWeight:800,color:"#475569"}}>Business name<input required minLength={2} value={form.businessName} onChange={e=>setForm(v=>({...v,businessName:e.target.value}))} style={input}/></label>
              </div>
              <label style={{fontSize:12,fontWeight:800,color:"#475569"}}>Work email<input required type="email" autoComplete="email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))} style={input}/></label>
              <label style={{fontSize:12,fontWeight:800,color:"#475569"}}>Phone / WhatsApp number<input required type="tel" autoComplete="tel" value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))} placeholder="+91 …" style={input}/></label>
              <label style={{fontSize:12,fontWeight:800,color:"#475569"}}>Expected monthly messages<select value={form.expectedVolume} onChange={e=>setForm(v=>({...v,expectedVolume:e.target.value}))} style={input}><option value="UNDER_1K">Under 1,000</option><option value="1K_10K">1,000–10,000</option><option value="10K_100K">10,000–100,000</option><option value="OVER_100K">More than 100,000</option></select></label>
              <label style={{fontSize:12,fontWeight:800,color:"#475569"}}>What do you want to automate? <span style={{fontWeight:500,color:"#94a3b8"}}>(optional)</span><textarea rows={3} maxLength={600} value={form.message} onChange={e=>setForm(v=>({...v,message:e.target.value}))} style={{...input,resize:"vertical"}}/></label>
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={e=>setForm(v=>({...v,website:e.target.value}))} style={{display:"none"}}/>
              {error&&<div role="alert" style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"9px 11px",fontSize:12,color:"#991b1b"}}>{error}</div>}
              <button disabled={loading} style={{border:0,borderRadius:10,padding:12,background:"#075e54",color:"#fff",fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:800,cursor:"pointer",opacity:loading?.7:1}}>{loading?"Submitting…":"Request free workspace →"}</button>
            </form>
          </>}
        </section>
      </div>
    </div>
  </main>
}
