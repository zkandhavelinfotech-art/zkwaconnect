"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Logo } from "@/components/Logo"

const steps = [
  { label:"Connect Meta", eyebrow:"📘 Facebook login" },
  { label:"WhatsApp account", eyebrow:"🔧 WABA setup" },
  { label:"Phone number", eyebrow:"📱 Phone registration" },
  { label:"Done", eyebrow:"✅ Ready to go" },
]

export function OnboardingShell({
  step,
  title,
  description,
  badges = [],
  aside,
  children,
}: {
  step: number
  title: string
  description: string
  badges?: string[]
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"DM Sans,sans-serif",color:"#0f172a"}}>
      <header style={{height:64,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
        padding:"0 clamp(18px,5vw,64px)",background:"rgba(7,94,84,.97)",borderBottom:"1px solid rgba(255,255,255,.12)"}}>
        <Link href="/app/dashboard" style={{textDecoration:"none"}}><Logo size={36} showText /></Link>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <Link href="/onboarding" style={{fontSize:12,color:"rgba(255,255,255,.75)",textDecoration:"none"}}>All steps on one page</Link>
          <Link href="/app/dashboard" style={{fontSize:13,fontWeight:600,color:"#fff",textDecoration:"none",
            border:"1px solid rgba(255,255,255,.25)",borderRadius:8,padding:"7px 14px"}}>Exit setup</Link>
        </div>
      </header>

      <div style={{background:"linear-gradient(135deg,#075E54 0%,#128C7E 50%,#075E54 100%)",padding:"36px clamp(18px,5vw,64px) 30px"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <nav aria-label="Setup progress" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",maxWidth:620,marginBottom:26}}>
            {steps.map((item,index)=>{
              const complete = index < step
              const current = index === step
              return (
                <div key={item.label} aria-current={current ? "step" : undefined}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,position:"relative"}}>
                  {index > 0 && <span aria-hidden="true" style={{position:"absolute",height:2,top:16,left:"-50%",right:"50%",
                    background:index <= step ? "#25D366" : "rgba(255,255,255,.22)"}} />}
                  <span style={{zIndex:1,width:32,height:32,borderRadius:"50%",display:"grid",placeItems:"center",fontSize:13,fontWeight:800,
                    background:complete ? "#25D366" : current ? "#fff" : "rgba(255,255,255,.15)",
                    color:complete ? "#fff" : current ? "#075E54" : "rgba(255,255,255,.7)",
                    boxShadow:current ? "0 0 0 5px rgba(255,255,255,.18)" : "none"}}>{complete ? "✓" : index + 1}</span>
                  <span style={{fontSize:11,fontWeight:current ? 700 : 500,color:current || complete ? "#fff" : "rgba(255,255,255,.6)",
                    textAlign:"center"}}>{item.label}</span>
                </div>
              )
            })}
          </nav>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.2)",
            borderRadius:20,padding:"5px 14px",fontSize:11,fontWeight:700,color:"rgba(255,255,255,.92)",letterSpacing:".06em",
            textTransform:"uppercase",marginBottom:14}}>{steps[step]?.eyebrow} · Step {step + 1} of 4</div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:"clamp(26px,3.6vw,40px)",fontWeight:800,lineHeight:1.12,
            letterSpacing:"-.5px",color:"#fff",margin:"0 0 10px"}}>{title}</h1>
          <p style={{fontSize:15,lineHeight:1.6,color:"rgba(255,255,255,.75)",margin:0,maxWidth:640}}>{description}</p>
          {badges.length > 0 && <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:16}}>
            {badges.map(badge=><span key={badge} style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.1)",
              border:"1px solid rgba(255,255,255,.15)",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:600,color:"rgba(255,255,255,.88)"}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:"#25D366"}}/>{badge}</span>)}
          </div>}
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"30px clamp(18px,5vw,64px) 64px",display:"grid",
        gridTemplateColumns:aside ? "repeat(auto-fit,minmax(min(100%,420px),1fr))" : "minmax(0,1fr)",gap:24,alignItems:"start"}}>
        <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:"26px clamp(18px,4vw,32px) 30px",
          boxShadow:"0 1px 4px rgba(0,0,0,.04)",borderTop:"3px solid #075E54"}}>{children}</section>
        {aside && <aside style={{display:"grid",gap:16}}>{aside}</aside>}
      </div>
    </main>
  )
}

export function Notice({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "success" | "info" | "warning" }) {
  const colors = {
    error: { background:"#fef2f2", border:"#fecaca", color:"#991b1b", icon:"⚠️" },
    success: { background:"#f0fdf4", border:"#bbf7d0", color:"#15803d", icon:"✅" },
    info: { background:"#eff6ff", border:"#bfdbfe", color:"#1e40af", icon:"ℹ️" },
    warning: { background:"#fffbeb", border:"#fde68a", color:"#b45309", icon:"⚠️" },
  }[tone]
  return <div role={tone === "error" ? "alert" : "status"} style={{display:"flex",gap:10,alignItems:"flex-start",background:colors.background,
    border:`1px solid ${colors.border}`,borderRadius:8,padding:"12px 14px",fontSize:13,lineHeight:1.55,color:colors.color,marginBottom:16}}>
    <span aria-hidden="true">{colors.icon}</span><div>{children}</div></div>
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
    <div style={{fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:700,color:"#0f172a",marginBottom:12}}>{title}</div>{children}</div>
}

export function StepList({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  return <div>{items.map((item,index)=><div key={item.title} style={{display:"flex",gap:14,position:"relative",paddingBottom:index < items.length - 1 ? 20 : 0}}>
    {index < items.length - 1 && <span aria-hidden="true" style={{position:"absolute",left:14,top:30,bottom:0,width:1,background:"#e2e8f0"}}/>}
    <span style={{width:29,height:29,borderRadius:"50%",background:"#075E54",color:"#fff",display:"grid",placeItems:"center",
      fontFamily:"Sora,sans-serif",fontSize:12,fontWeight:700,flexShrink:0,zIndex:1}}>{index + 1}</span>
    <div style={{paddingTop:4}}>
      <div style={{fontFamily:"Sora,sans-serif",fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:3}}>{item.title}</div>
      <div style={{fontSize:12,color:"#64748b",lineHeight:1.6}}>{item.body}</div>
    </div>
  </div>)}</div>
}

// A self-check list; ticks are remembered in this browser only.
export function Checklist({ id, items }: { id: string; items: string[] }) {
  const [checked,setChecked] = useState<boolean[]>(()=>items.map(()=>false))
  useEffect(()=>{
    try{ const saved = JSON.parse(localStorage.getItem(`zk-checklist-${id}`) || "[]"); if(Array.isArray(saved)) setChecked(items.map((_,index)=>Boolean(saved[index]))) }catch{}
  },[id,items.length]) // eslint-disable-line react-hooks/exhaustive-deps
  function toggle(index:number){
    setChecked(current=>{const next = current.map((value,itemIndex)=>itemIndex===index?!value:value)
      try{ localStorage.setItem(`zk-checklist-${id}`,JSON.stringify(next)) }catch{}
      return next})
  }
  return <div style={{display:"grid",gap:9}}>{items.map((item,index)=><label key={item} style={{display:"flex",alignItems:"flex-start",gap:10,
    cursor:"pointer",fontSize:13,color:checked[index] ? "#15803d" : "#0f172a",lineHeight:1.45}}>
    <input type="checkbox" checked={checked[index]} onChange={()=>toggle(index)} style={{width:16,height:16,marginTop:1,accentColor:"#075E54"}}/>
    {item}</label>)}</div>
}

export const primaryButton: React.CSSProperties = {display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,border:0,borderRadius:8,
  padding:"12px 22px",background:"#075E54",color:"#fff",fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:700,cursor:"pointer",textDecoration:"none"}
export const secondaryButton: React.CSSProperties = {display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,border:"1.5px solid #e2e8f0",
  borderRadius:8,padding:"11px 18px",background:"#fff",color:"#0f172a",fontSize:13,fontWeight:600,cursor:"pointer",textDecoration:"none"}
