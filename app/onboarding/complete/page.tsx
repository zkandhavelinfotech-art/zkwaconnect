"use client"
import { useEffect, useState } from "react"
import { OnboardingShell, Notice, Card, primaryButton } from "@/components/onboarding/OnboardingShell"

type SetupStatus = {
  metaConnected: boolean
  wabaCreated: boolean
  phoneRegistered: boolean
  phoneVerified: boolean
  completedAt: string | null
  waba: { name: string; wabaId: string } | null
  phone: { phoneNumber: string } | null
}

export default function OnboardingCompletePage() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    fetch("/api/onboarding/status")
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not load setup status.")
        if (active) setStatus(body)
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load setup status.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const complete = Boolean(status?.metaConnected && status.wabaCreated && status.phoneRegistered && status.phoneVerified)
  const nextPath = !status?.metaConnected ? "/onboarding/meta-connect"
    : !status.wabaCreated ? "/onboarding/waba-setup"
    : "/onboarding/phone-registration"

  return (
    <OnboardingShell step={3} title={complete ? "WhatsApp setup is complete" : "Finish connecting WhatsApp"}
      description={complete ? "Your verified business number is connected to this workspace." : "Complete the remaining steps before sending messages."}
      badges={complete ? ["Official WhatsApp Business API", "Inbox live", "Ready for campaigns"] : []}
      aside={complete ? <Card title="What to do next">
        <div style={{display:"grid",gap:10}}>
          {[["/app/templates","📋","Pick a message template","Choose from the library and submit to Meta"],
            ["/app/automation","⚡","Build a chatbot","Auto-reply with menus, questions and handoff"],
            ["/app/contacts","👥","Import your contacts","Upload a CSV and tag your audience"],
            ["/app/settings","⚙️","Complete your profile","Add About, address, website and category"]].map(([href,icon,title,body])=>
            <a key={href} href={href} style={{display:"flex",gap:12,alignItems:"flex-start",textDecoration:"none",color:"#0f172a",
              padding:12,border:"1px solid #e2e8f0",borderRadius:10}}>
              <span style={{fontSize:20}}>{icon}</span>
              <span><span style={{display:"block",fontSize:13,fontWeight:700}}>{title}</span>
                <span style={{display:"block",fontSize:12,color:"#64748b"}}>{body}</span></span>
            </a>)}
        </div>
      </Card> : undefined}>
      {error && <Notice>{error}</Notice>}
      {loading ? <p style={{fontSize:13,color:"#64748b"}}>Checking setup status…</p> : status && <>
        {complete ? <Notice tone="success">Meta, WABA, and phone number are connected and verified.</Notice>
          : <Notice tone="info">Setup is not complete yet. Continue from the first unfinished step.</Notice>}
        <div style={{border:"1px solid #e0e9e8",borderRadius:7,overflow:"hidden",marginBottom:22}}>
          {[
            {label:"Meta business",done:status.metaConnected},
            {label:"WhatsApp Business Account",done:status.wabaCreated,detail:status.waba?.name},
            {label:"Phone verification",done:status.phoneRegistered && status.phoneVerified,detail:status.phone?.phoneNumber},
          ].map((item,index) => (
            <div key={item.label} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",
              borderTop:index ? "1px solid #e8efee" : 0}}>
              <span aria-hidden="true" style={{width:22,height:22,borderRadius:"50%",display:"grid",placeItems:"center",
                background:item.done ? "#e4f5ed" : "#f1f4f4",color:item.done ? "#168253" : "#7a8b88",fontSize:12,fontWeight:800}}>
                {item.done ? "✓" : "·"}
              </span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#294440"}}>{item.label}</div>
                {item.detail && <div style={{fontSize:12,color:"#72827f",marginTop:3}}>{item.detail}</div>}
              </div>
              <span style={{fontSize:11,fontWeight:700,color:item.done ? "#168253" : "#7a8b88"}}>
                {item.done ? "Complete" : "Pending"}
              </span>
            </div>
          ))}
        </div>
        {complete ? (
          <a href="/app/dashboard" style={primaryButton}>Open dashboard →</a>
        ) : (
          <a href={nextPath} style={primaryButton}>Continue setup →</a>
        )}
      </>}
    </OnboardingShell>
  )
}
