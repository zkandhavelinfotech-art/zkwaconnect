"use client"
import { useEffect, useState } from "react"

type Slot = { open:string; close:string }
type Day = "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"
type Settings = { autoAssign:"OFF"|"ROUND_ROBIN"|"LEAST_BUSY"; agentIds:string[]; businessHoursEnabled:boolean; timezone:string
  hours:Record<Day,Slot[]>; awayMessage:string; awayCooldownMinutes:number
  optOutEnabled:boolean; optOutKeywords:string[]; optInKeywords:string[]; optOutMessage:string; optInMessage:string }
type Member = { id:string; name:string; email:string; role:string }
type QuickReply = { id:string; shortcut:string; content:string }

const DAYS:[Day,string][] = [["mon","Monday"],["tue","Tuesday"],["wed","Wednesday"],["thu","Thursday"],["fri","Friday"],["sat","Saturday"],["sun","Sunday"]]
const ZONES = ["Asia/Kolkata","Asia/Dubai","Asia/Singapore","Asia/Riyadh","Asia/Dhaka","Asia/Kathmandu","Asia/Colombo","Europe/London","America/New_York","Australia/Sydney","UTC"]
const COOLDOWNS:[number,string][] = [[60,"1 hour"],[240,"4 hours"],[720,"12 hours"],[1440,"24 hours"]]
const card:React.CSSProperties = {background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:20,marginBottom:18}
const input:React.CSSProperties = {boxSizing:"border-box",border:"1px solid #cbd5d3",borderRadius:6,padding:"8px 10px",fontSize:13,color:"#183633",background:"#fff"}
const h2:React.CSSProperties = {fontFamily:"Sora,sans-serif",fontSize:16,margin:"0 0 4px",color:"#102a2a"}
const hint:React.CSSProperties = {fontSize:12,color:"#64748b",margin:"0 0 14px"}
const primary:React.CSSProperties = {border:0,borderRadius:6,padding:"9px 14px",background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}

export default function InboxSettingsPage() {
  const [settings,setSettings] = useState<Settings|null>(null)
  const [members,setMembers] = useState<Member[]>([])
  const [openNow,setOpenNow] = useState(true)
  const [canEdit,setCanEdit] = useState(false)
  const [replies,setReplies] = useState<QuickReply[]>([])
  const [draft,setDraft] = useState<{id?:string;shortcut:string;content:string}>({shortcut:"",content:""})
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState("")
  const [notice,setNotice] = useState("")

  async function load(){
    const [a,b] = await Promise.all([fetch("/api/inbox/settings"),fetch("/api/inbox/quick-replies")])
    const [settingsBody,repliesBody] = await Promise.all([a.json(),b.json()])
    if(!a.ok)throw new Error(settingsBody.error||"Could not load settings.")
    setSettings(settingsBody.settings);setMembers(settingsBody.members);setOpenNow(settingsBody.openNow);setCanEdit(settingsBody.canEdit)
    setReplies(repliesBody.quickReplies||[])
  }
  useEffect(()=>{load().catch(reason=>setError(reason.message))},[])

  const update = (patch:Partial<Settings>)=>setSettings(current=>current&&{...current,...patch})
  const setSlot = (day:Day,index:number,patch:Partial<Slot>)=>settings&&update({hours:{...settings.hours,[day]:settings.hours[day].map((slot,i)=>i===index?{...slot,...patch}:slot)}})

  async function call(url:string,method:string,body?:unknown){
    setError("");setNotice("")
    const response = await fetch(url,{method,headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)})
    const data = await response.json()
    if(!response.ok)throw new Error(data.error||"Something went wrong.")
    return data
  }

  async function saveSettings(){
    if(!settings)return
    setSaving(true)
    try{ const data = await call("/api/inbox/settings","PUT",settings); setNotice(data.message); await load() }
    catch(reason){ setError(reason instanceof Error?reason.message:"Could not save.") }
    finally{ setSaving(false) }
  }

  async function saveReply(event:React.FormEvent){
    event.preventDefault()
    try{
      await call("/api/inbox/quick-replies",draft.id?"PATCH":"POST",draft)
      setNotice(draft.id?"Quick reply updated.":"Quick reply added.");setDraft({shortcut:"",content:""});await load()
    }catch(reason){ setError(reason instanceof Error?reason.message:"Could not save.") }
  }

  async function removeReply(item:QuickReply){
    if(!window.confirm(`Delete /${item.shortcut}?`))return
    try{ await call(`/api/inbox/quick-replies?id=${item.id}`,"DELETE"); await load() }
    catch(reason){ setError(reason instanceof Error?reason.message:"Could not delete.") }
  }

  if(!settings)return <div style={{padding:24,color:"#64748b"}}>{error||"Loading inbox settings…"}</div>
  const locked = !canEdit

  return (
    <div style={{maxWidth:900}}>
      <a href="/app/inbox" style={{fontSize:12,color:"#075e54",fontWeight:700,textDecoration:"none"}}>← Back to inbox</a>
      <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:"8px 0 4px"}}>Inbox settings</h1>
      <p style={{fontSize:13,color:"#64748b",margin:"0 0 18px"}}>Saved replies for your team, automatic chat assignment, and what customers hear outside working hours.
        {locked&&" Only owners, admins and managers can change these settings."}</p>
      {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
      {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13}}>{notice}</div>}

      <section style={card}>
        <h2 style={h2}>⚡ Quick replies</h2>
        <p style={hint}>In the inbox, type <strong>/</strong> and the shortcut (e.g. <code>/price</code>) to insert a reply. <code>{"{{name}}"}</code> becomes the customer&apos;s name.</p>
        {canEdit&&<form onSubmit={saveReply} style={{display:"grid",gridTemplateColumns:"160px 1fr auto",gap:8,alignItems:"start",marginBottom:14}}>
          <input aria-label="Shortcut" required value={draft.shortcut} placeholder="shortcut" maxLength={30}
            onChange={event=>setDraft(current=>({...current,shortcut:event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,"")}))} style={input}/>
          <textarea aria-label="Reply text" required rows={2} value={draft.content} maxLength={4096} placeholder="Hi {{name}}, our plans start at ₹999/month…"
            onChange={event=>setDraft(current=>({...current,content:event.target.value}))} style={{...input,resize:"vertical",fontFamily:"inherit"}}/>
          <div style={{display:"flex",gap:6}}>
            <button type="submit" style={primary}>{draft.id?"Update":"Add"}</button>
            {draft.id&&<button type="button" onClick={()=>setDraft({shortcut:"",content:""})} style={{...primary,background:"#fff",color:"#64748b",border:"1px solid #cbd5d3"}}>Cancel</button>}
          </div>
        </form>}
        {replies.length?<div style={{border:"1px solid #edf1f0",borderRadius:8}}>{replies.map(item=><div key={item.id} style={{display:"flex",gap:12,padding:"10px 12px",borderTop:"1px solid #edf1f0",alignItems:"flex-start"}}>
          <code style={{fontSize:12,fontWeight:700,color:"#075e54",minWidth:110}}>/{item.shortcut}</code>
          <span style={{flex:1,fontSize:12,color:"#334155",whiteSpace:"pre-wrap"}}>{item.content}</span>
          {canEdit&&<span style={{display:"flex",gap:8}}>
            <button onClick={()=>setDraft(item)} style={{border:0,background:"none",color:"#075e54",fontWeight:700,fontSize:12,cursor:"pointer"}}>Edit</button>
            <button onClick={()=>removeReply(item)} style={{border:0,background:"none",color:"#b91c1c",fontWeight:700,fontSize:12,cursor:"pointer"}}>Delete</button>
          </span>}
        </div>)}</div>:<p style={{fontSize:12,color:"#94a3b8"}}>No quick replies yet.</p>}
      </section>

      <fieldset disabled={locked} style={{border:0,padding:0,margin:0}}>
        <section style={card}>
          <h2 style={h2}>👥 Auto-assignment</h2>
          <p style={hint}>When a customer writes and no chatbot answers (or a flow hands over to a person), give the chat to an agent automatically.</p>
          <div style={{display:"grid",gap:8}}>
            {([["OFF","Off","Chats stay unassigned until someone picks them up."],["ROUND_ROBIN","Round robin","Take turns: each new chat goes to the next agent."],
              ["LEAST_BUSY","Least busy","Give the chat to the agent with the fewest open chats."]] as const).map(([value,label,desc])=>
              <label key={value} style={{display:"flex",gap:10,alignItems:"flex-start",border:`1px solid ${settings.autoAssign===value?"#075e54":"#e2e8f0"}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",
                background:settings.autoAssign===value?"#f0faf6":"#fff"}}>
                <input type="radio" checked={settings.autoAssign===value} onChange={()=>update({autoAssign:value})} style={{marginTop:2}}/>
                <span><strong style={{fontSize:13,color:"#183633"}}>{label}</strong><span style={{display:"block",fontSize:12,color:"#64748b"}}>{desc}</span></span>
              </label>)}
          </div>
          {settings.autoAssign!=="OFF"&&<div style={{marginTop:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"#526763",marginBottom:6}}>Agents who receive chats {settings.agentIds.length?"":"(none selected = everyone)"}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{members.map(member=>{
              const on = settings.agentIds.includes(member.id)
              return <label key={member.id} style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${on?"#075e54":"#d7e2df"}`,borderRadius:20,padding:"5px 12px",fontSize:12,cursor:"pointer",background:on?"#f0faf6":"#fff"}}>
                <input type="checkbox" checked={on} onChange={()=>update({agentIds:on?settings.agentIds.filter(id=>id!==member.id):[...settings.agentIds,member.id]})}/>
                {member.name} <span style={{color:"#94a3b8"}}>· {member.role.toLowerCase()}</span></label>
            })}</div>
            {members.length<2&&<p style={{fontSize:11,color:"#92400e",marginTop:8}}>You&apos;re the only member of this workspace, so every chat goes to you.</p>}
          </div>}
        </section>

        <section style={card}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div>
              <h2 style={h2}>🕘 Business hours &amp; away message</h2>
              <p style={hint}>Outside these hours, customers get your away message automatically (unless a chatbot flow answers them).</p>
            </div>
            {settings.businessHoursEnabled&&<span style={{alignSelf:"flex-start",fontSize:12,fontWeight:700,borderRadius:20,padding:"4px 10px",
              background:openNow?"#dcfce7":"#fee2e2",color:openNow?"#166534":"#991b1b"}}>{openNow?"● Open now":"● Closed now"}</span>}
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:700,color:"#183633",marginBottom:14,cursor:"pointer"}}>
            <input type="checkbox" checked={settings.businessHoursEnabled} onChange={event=>update({businessHoursEnabled:event.target.checked})}/> Use business hours
          </label>
          {settings.businessHoursEnabled&&<>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#526763",marginBottom:12}}>Time zone
              <select value={settings.timezone} onChange={event=>update({timezone:event.target.value})} style={input}>
                {[...new Set([settings.timezone,...ZONES])].map(zone=><option key={zone} value={zone}>{zone}</option>)}</select></label>
            <div style={{display:"grid",gap:6,marginBottom:16}}>
              {DAYS.map(([day,label])=>{
                const slots = settings.hours[day]||[]
                return <div key={day} style={{display:"grid",gridTemplateColumns:"110px 1fr",gap:10,alignItems:"center"}}>
                  <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#183633"}}>
                    <input type="checkbox" checked={slots.length>0} onChange={event=>update({hours:{...settings.hours,[day]:event.target.checked?[{open:"09:00",close:"18:00"}]:[]}})}/>{label}</label>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    {slots.length?slots.map((slot,index)=><span key={index} style={{display:"inline-flex",gap:4,alignItems:"center"}}>
                      <input type="time" aria-label={`${label} opens`} value={slot.open} onChange={event=>setSlot(day,index,{open:event.target.value})} style={{...input,padding:"5px 6px"}}/>–
                      <input type="time" aria-label={`${label} closes`} value={slot.close} onChange={event=>setSlot(day,index,{close:event.target.value})} style={{...input,padding:"5px 6px"}}/>
                      {slots.length>1&&<button type="button" aria-label="Remove time range" onClick={()=>update({hours:{...settings.hours,[day]:slots.filter((_,i)=>i!==index)}})}
                        style={{border:0,background:"none",color:"#b91c1c",cursor:"pointer"}}>✕</button>}
                    </span>):<span style={{fontSize:12,color:"#94a3b8"}}>Closed</span>}
                    {slots.length>0&&slots.length<3&&<button type="button" onClick={()=>update({hours:{...settings.hours,[day]:[...slots,{open:"14:00",close:"18:00"}]}})}
                      style={{border:0,background:"none",color:"#075e54",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ split shift</button>}
                  </div>
                </div>
              })}
            </div>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:"#526763",marginBottom:6}}>Away message</label>
            <textarea rows={3} value={settings.awayMessage} maxLength={4096} onChange={event=>update({awayMessage:event.target.value})} style={{...input,width:"100%",fontFamily:"inherit",resize:"vertical"}}/>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#526763",marginTop:10}}>Send it at most once every
              <select value={settings.awayCooldownMinutes} onChange={event=>update({awayCooldownMinutes:Number(event.target.value)})} style={input}>
                {COOLDOWNS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select> per conversation</label>
          </>}
        </section>
        <section style={card}>
          <h2 style={h2}>🚫 Opt-out keywords (STOP)</h2>
          <p style={hint}>When a customer replies with one of these words, they&apos;re unsubscribed from broadcasts and marketing, any queued broadcast to them is skipped,
            and they get your confirmation. Replying with an opt-in word subscribes them again.</p>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:700,color:"#183633",marginBottom:12,cursor:"pointer"}}>
            <input type="checkbox" checked={settings.optOutEnabled} onChange={event=>update({optOutEnabled:event.target.checked})}/> Handle opt-out keywords automatically (recommended)</label>
          {settings.optOutEnabled&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))",gap:14}}>
            {([["optOutKeywords","optOutMessage","Unsubscribe words","Confirmation after unsubscribing"],["optInKeywords","optInMessage","Subscribe-again words","Confirmation after subscribing again"]] as const)
              .map(([keywords,message,label,messageLabel])=><div key={keywords}>
                <label style={{display:"block",fontSize:12,fontWeight:700,color:"#526763",marginBottom:6}}>{label} (comma separated)</label>
                <input value={settings[keywords].join(", ")} onChange={event=>update({[keywords]:event.target.value.split(",").map(item=>item.trim().toLowerCase()).filter(Boolean)} as Partial<Settings>)}
                  style={{...input,width:"100%"}}/>
                <label style={{display:"block",fontSize:12,fontWeight:700,color:"#526763",margin:"10px 0 6px"}}>{messageLabel}</label>
                <textarea rows={3} maxLength={1024} value={settings[message]} onChange={event=>update({[message]:event.target.value} as Partial<Settings>)}
                  style={{...input,width:"100%",fontFamily:"inherit",resize:"vertical"}}/>
              </div>)}
          </div>}
          <p style={{fontSize:11,color:"#94a3b8",margin:"10px 0 0"}}>Matches the whole message (e.g. “STOP”, “stop.”, or the “Stop promotions” button on marketing templates). “START” only re-subscribes people who had opted out.</p>
        </section>
        {canEdit&&<button onClick={saveSettings} disabled={saving} style={{...primary,padding:"11px 18px",fontSize:13}}>{saving?"Saving…":"Save inbox settings"}</button>}
      </fieldset>
    </div>
  )
}
