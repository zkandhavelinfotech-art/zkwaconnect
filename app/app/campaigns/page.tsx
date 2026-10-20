"use client"
import { useEffect, useMemo, useState } from "react"

type Phone = { id:string; phoneNumber:string; displayName:string|null; wabaId:string; messagingLimit:string|null }
type Template = { id:string; name:string; language:string; status:string; content:string|null; category:string|null; wabaId:string }
type Stats = { total:number; queued:number; sent:number; delivered:number; read:number; replied:number; clicked:number; failed:number; skipped:number }
type Campaign = {
  id:string; name:string; status:string; audienceType:string; audienceLabels:string[]|null; totalCount:number; createdAt:string
  scheduledAt:string|null; startedAt:string|null; completedAt:string|null; pausedReason:string|null; stats?:Stats
  phoneNumber:{displayName:string|null;phoneNumber:string}; template:{name:string;language:string;status:string;content:string|null}|null
}
type Source = "name"|"phone"|"email"|"attribute"|"text"|"link"
type Mapping = { source:Source; value:string; fallback:string }
type Sample = { name:string|null; phone:string; email:string|null; metadata:Record<string,unknown>|null } | null

const inputStyle: React.CSSProperties = {width:"100%",boxSizing:"border-box",minHeight:40,padding:"8px 10px",
  border:"1px solid #cbd5d3",borderRadius:6,fontSize:13,color:"#183633",background:"#fff"}
const labelText: React.CSSProperties = {display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}
const stepTitle: React.CSSProperties = {fontSize:12,fontWeight:800,color:"#075e54",textTransform:"uppercase",letterSpacing:".04em",margin:"18px 0 10px"}
const smallBtn = (background:string,color="#fff"): React.CSSProperties => ({border:background==="#fff"?"1px solid #cbd5d3":0,borderRadius:5,padding:"6px 9px",
  background,color,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"})

const STATUS: Record<string,{label:string;bg:string;fg:string}> = {
  DRAFT:{label:"Draft",bg:"#eef2f1",fg:"#49615e"}, SCHEDULED:{label:"Scheduled",bg:"#e0f2fe",fg:"#075985"},
  STARTING:{label:"Starting…",bg:"#e0f2fe",fg:"#075985"}, RUNNING:{label:"Sending",bg:"#dcfce7",fg:"#166534"},
  PAUSED:{label:"Paused",bg:"#fef3c7",fg:"#92400e"}, COMPLETED:{label:"Completed",bg:"#dcfce7",fg:"#166534"},
  CANCELLED:{label:"Cancelled",bg:"#eef2f1",fg:"#49615e"}, FAILED:{label:"Failed",bg:"#fee2e2",fg:"#991b1b"},
}
const ACTIVE = ["SCHEDULED","STARTING","RUNNING"]
const SOURCE_LABELS: Record<Source,string> = { name:"Contact name", phone:"Phone number", email:"Email", attribute:"Custom field", text:"Fixed text", link:"Tracked link" }
const TIER_LIMITS: Record<string,number> = { TIER_50:50, TIER_250:250, TIER_1K:1000, TIER_10K:10000, TIER_100K:100000 }

const pct = (part:number,whole:number) => whole ? Math.round(part / whole * 100) : 0
const when = (value:string|null) => value ? new Date(value).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}) : ""
function localInputValue(date:Date){ const d=new Date(date.getTime()-date.getTimezoneOffset()*60000); return d.toISOString().slice(0,16) }
function variableNumbers(content:string|null|undefined){ return [...new Set([...(content||"").matchAll(/\{\{(\d+)\}\}/g)].map(match=>match[1]))].sort((a,b)=>Number(a)-Number(b)) }

function sampleValue(mapping:Mapping|undefined,sample:Sample){
  if(!mapping)return ""
  const raw = mapping.source==="link"?(mapping.value?"https://…/l/a1B2c3D4e5":""):mapping.source==="text"?mapping.value:!sample?"":mapping.source==="name"?sample.name||"":mapping.source==="phone"?`+${sample.phone}`
    :mapping.source==="email"?sample.email||"":String((sample.metadata?.attributes as Record<string,unknown>|undefined)?.[mapping.value]??"")
  return raw.trim()||mapping.fallback.trim()
}

export default function CampaignsPage() {
  const [campaigns,setCampaigns]=useState<Campaign[]>([])
  const [phones,setPhones]=useState<Phone[]>([])
  const [templates,setTemplates]=useState<Template[]>([])
  const [audienceTags,setAudienceTags]=useState<{tag:string;count:number}[]>([])
  const [attributeKeys,setAttributeKeys]=useState<string[]>([])
  const [sendRate,setSendRate]=useState(20)
  const [composerOpen,setComposerOpen]=useState(false)
  const [name,setName]=useState("")
  const [phoneNumberId,setPhoneNumberId]=useState("")
  const [templateId,setTemplateId]=useState("")
  const [mapping,setMapping]=useState<Record<string,Mapping>>({})
  const [audienceType,setAudienceType]=useState<"ALL"|"TAGS"|"SEGMENT">("ALL")
  const [segmentId,setSegmentId]=useState("")
  const [segments,setSegments]=useState<{id:string;name:string}[]>([])
  const [labels,setLabels]=useState<string[]>([])
  const [estimate,setEstimate]=useState<number|null>(null)
  const [sample,setSample]=useState<Sample>(null)
  const [sendWhen,setSendWhen]=useState<"now"|"schedule"|"draft">("now")
  const [scheduledAt,setScheduledAt]=useState(()=>localInputValue(new Date(Date.now()+3600_000)))
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [busyId,setBusyId]=useState("")
  const [rescheduleId,setRescheduleId]=useState("")
  const [rescheduleAt,setRescheduleAt]=useState("")
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [refresh,setRefresh]=useState(0)

  useEffect(()=>{
    let active=true
    fetch("/api/campaigns")
      .then(async response=>{
        const body=await response.json()
        if(!response.ok) throw new Error(body.error||"Could not load broadcasts.")
        if(!active)return
        setCampaigns(body.campaigns||[]);setPhones(body.phoneNumbers||[]);setTemplates(body.templates||[])
        setAudienceTags(body.audienceTags||[]);setAttributeKeys(body.attributeKeys||[]);setSendRate(body.sendRate||20);setSegments(body.segments||[])
        const fromSegment=new URLSearchParams(window.location.search).get("segment")
        if(fromSegment&&(body.segments||[]).some((item:{id:string})=>item.id===fromSegment)){setAudienceType("SEGMENT");setSegmentId(fromSegment);setComposerOpen(true)}
        if(!(body.campaigns||[]).length)setComposerOpen(true)
        setPhoneNumberId(current=>current||body.phoneNumbers?.[0]?.id||"")
      })
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Could not load broadcasts.")})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[refresh])

  // Live progress while anything is scheduled or sending.
  const anyActive=campaigns.some(campaign=>ACTIVE.includes(campaign.status))
  useEffect(()=>{
    if(!anyActive)return
    const timer=setInterval(()=>setRefresh(value=>value+1),4000)
    return ()=>clearInterval(timer)
  },[anyActive])

  useEffect(()=>{
    let active=true
    setEstimate(null)
    if(audienceType==="TAGS"&&!labels.length){setEstimate(0);return}
    if(audienceType==="SEGMENT"&&!segmentId){setEstimate(0);return}
    const query=new URLSearchParams({estimate:"1",labels:audienceType==="TAGS"?labels.join(","):"",...(audienceType==="SEGMENT"?{segment:segmentId}:{})})
    fetch(`/api/campaigns?${query.toString()}`).then(response=>response.json()).then(body=>{
      if(active&&typeof body.count==="number"){setEstimate(body.count);setSample(body.sample||null)}
    }).catch(()=>{})
    return ()=>{active=false}
  },[audienceType,labels,segmentId])

  const phone=phones.find(item=>item.id===phoneNumberId)
  const approved=templates.filter(template=>template.status==="APPROVED"&&(!phone||template.wabaId===phone.wabaId))
  const selectedTemplate=templates.find(template=>template.id===templateId)
  const numbers=useMemo(()=>variableNumbers(selectedTemplate?.content),[selectedTemplate])
  const preview=(selectedTemplate?.content||"").replace(/\{\{(\d+)\}\}/g,(match,number)=>sampleValue(mapping[number],sample)||`[{{${number}}}]`)
  const tierLimit=phone?.messagingLimit?TIER_LIMITS[phone.messagingLimit]:undefined
  const minutes=estimate?Math.max(1,Math.ceil(estimate/sendRate/60)):0

  function chooseTemplate(id:string){
    setTemplateId(id)
    const template=templates.find(item=>item.id===id)
    setMapping(Object.fromEntries(variableNumbers(template?.content).map((number,index)=>[number,{source:index===0?"name":"text",value:"",fallback:index===0?"there":""} as Mapping])))
  }
  const setVar=(number:string,patch:Partial<Mapping>)=>setMapping(current=>({...current,[number]:{...current[number],...patch}}))

  async function createCampaign(event:React.FormEvent){
    event.preventDefault()
    if(sendWhen==="now"&&!window.confirm(`Send “${selectedTemplate?.name}” to ${estimate?.toLocaleString("en-IN")} contact(s) now?`))return
    setSaving(true);setError("");setNotice("")
    try{
      const response=await fetch("/api/campaigns",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name,phoneNumberId,templateId,audienceType,audienceLabels:audienceType==="TAGS"?labels:[],segmentId:audienceType==="SEGMENT"?segmentId:undefined,
          variables:Object.fromEntries(numbers.map(number=>[number,{source:mapping[number]?.source||"text",value:mapping[number]?.value||undefined,fallback:mapping[number]?.fallback||undefined}])),
          when:sendWhen,scheduledAt:sendWhen==="schedule"?new Date(scheduledAt).toISOString():undefined})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error||"Could not create the broadcast.")
      setNotice(body.message);setName("");setLabels([]);setTemplateId("");setMapping({});setComposerOpen(false);setRefresh(value=>value+1)
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not create the broadcast.")}
    finally{setSaving(false)}
  }

  async function act(campaign:Campaign,action:string,extra:Record<string,unknown>={}){
    const confirms:Record<string,string>={launch:`Send “${campaign.name}” now?`,cancel:`Cancel “${campaign.name}”? Contacts not yet messaged won't receive it.`,
      delete:`Delete “${campaign.name}”?`,retry_failed:"Retry the failed messages that can be retried?"}
    if(confirms[action]&&!window.confirm(confirms[action]))return
    setBusyId(campaign.id);setError("");setNotice("")
    try{
      const response=await fetch("/api/campaigns",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:campaign.id,action,...extra})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error||"Action failed.")
      setNotice(body.message||"Done.");setRescheduleId("");setRefresh(value=>value+1)
    }catch(reason){setError(reason instanceof Error?reason.message:"Action failed.")}
    finally{setBusyId("")}
  }

  const canSubmit=name.trim().length>=2&&phoneNumberId&&templateId&&(audienceType==="ALL"||(audienceType==="TAGS"&&labels.length>0)||(audienceType==="SEGMENT"&&Boolean(segmentId)))&&(sendWhen==="draft"||Boolean(estimate))

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",marginBottom:20}}>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>Broadcasts</h1>
          <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0",maxWidth:640}}>Send an approved template to your opted-in contacts, personalised for each person. Send now or schedule it, then follow delivery, reads, replies and failures.
            {" "}Want Facebook or Instagram ads? <a href="/app/ads/create" style={{color:"#075e54",fontWeight:700}}>Create New Ad →</a></p>
        </div>
        {!composerOpen&&<button onClick={()=>setComposerOpen(true)} style={{...smallBtn("#075e54"),fontSize:13,padding:"10px 16px"}}>+ New broadcast</button>}
      </div>

      {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
      {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13}}>{notice}</div>}

      {composerOpen&&<section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:20,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{fontFamily:"Sora,sans-serif",fontSize:16,margin:0,color:"#183633"}}>New broadcast</h2>
          {campaigns.length>0&&<button type="button" onClick={()=>setComposerOpen(false)} style={{background:"none",border:0,color:"#64748b",cursor:"pointer",fontSize:12}}>Close ✕</button>}
        </div>
        {!loading&&(!phones.length||!templates.some(template=>template.status==="APPROVED")) ? <div style={{fontSize:13,color:"#647b77",marginTop:12}}>
          Connect a WhatsApp number and get a template approved before creating a broadcast. <a href="/app/templates" style={{color:"#087763",fontWeight:700}}>Open templates</a>
        </div> : <form onSubmit={createCampaign}>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.5fr) minmax(260px,1fr)",gap:24}} className="zk-broadcast-grid">
            <div>
              <div style={stepTitle}>1 · Details</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,200px),1fr))",gap:12}}>
                <label><span style={labelText}>Broadcast name</span>
                  <input required minLength={2} maxLength={100} value={name} placeholder="e.g. Diwali offer" onChange={event=>setName(event.target.value)} style={inputStyle}/></label>
                <label><span style={labelText}>Send from</span>
                  <select required value={phoneNumberId} onChange={event=>{setPhoneNumberId(event.target.value);setTemplateId("");setMapping({})}} style={inputStyle}>
                    {phones.map(item=><option key={item.id} value={item.id}>{item.displayName||item.phoneNumber} · {item.phoneNumber}</option>)}
                  </select></label>
              </div>

              <div style={stepTitle}>2 · Template</div>
              <select required value={templateId} onChange={event=>chooseTemplate(event.target.value)} style={inputStyle}>
                <option value="">Choose an approved template</option>
                {approved.map(template=><option key={template.id} value={template.id}>{template.name} · {template.language}{template.category?` · ${template.category.toLowerCase()}`:""}</option>)}
              </select>

              <div style={stepTitle}>3 · Audience</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {(["ALL","TAGS","SEGMENT"] as const).map(option=><label key={option} style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${audienceType===option?"#075e54":"#d7e2df"}`,
                  borderRadius:6,padding:"8px 12px",fontSize:13,cursor:"pointer",background:audienceType===option?"#f0faf6":"#fff"}}>
                  <input type="radio" checked={audienceType===option} onChange={()=>setAudienceType(option)}/>{option==="ALL"?"All opted-in contacts":option==="TAGS"?"Contacts with tags":"Saved segment"}</label>)}
              </div>
              {audienceType==="SEGMENT"&&<div style={{marginTop:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {segments.length?<select value={segmentId} onChange={event=>setSegmentId(event.target.value)} style={{...inputStyle,width:"auto",minWidth:240}}>
                  <option value="">Choose a segment</option>{segments.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  :<span style={{fontSize:12,color:"#8a5b00"}}>No saved segments yet.</span>}
                <a href="/app/contacts/segments?new=1" style={{fontSize:12,color:"#087763",fontWeight:700}}>+ Create segment</a>
                <span style={{fontSize:11,color:"#71817e",width:"100%"}}>Only opted-in contacts in the segment receive the broadcast.</span>
              </div>}
              {audienceType==="TAGS"&&<div style={{marginTop:10}}>
                {audienceTags.length?<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{audienceTags.map(item=>{
                  const on=labels.includes(item.tag)
                  return <button type="button" key={item.tag} onClick={()=>setLabels(current=>on?current.filter(label=>label!==item.tag):[...current,item.tag])}
                    style={{border:`1px solid ${on?"#075e54":"#d7e2df"}`,background:on?"#075e54":"#fff",color:on?"#fff":"#365b57",borderRadius:14,
                      padding:"5px 11px",fontSize:11,cursor:"pointer"}}>{on?"✓ ":""}{item.tag} · {item.count}</button>})}</div>:
                  <div style={{fontSize:12,color:"#8a5b00"}}>No opted-in contacts have tags yet. Tag contacts on the <a href="/app/contacts" style={{color:"#087763",fontWeight:700}}>Contacts</a> page.</div>}
                {labels.length>1&&<div style={{fontSize:11,color:"#71817e",marginTop:6}}>Contacts with any of the selected tags.</div>}
              </div>}
              <div style={{marginTop:10,fontSize:12,color:estimate===0?"#a83226":"#365b57"}}>
                Reaches <strong>{estimate===null?"…":`${estimate.toLocaleString("en-IN")} opted-in contact(s)`}</strong>
                {estimate?<span style={{color:"#71817e"}}> · takes about {minutes} minute{minutes===1?"":"s"} at {sendRate} messages/second</span>:null}
              </div>
              {tierLimit!==undefined&&estimate!==null&&estimate>tierLimit&&<div style={{marginTop:6,fontSize:12,color:"#92400e",background:"#fffbeb",borderRadius:6,padding:"8px 10px"}}>
                This number can message {tierLimit.toLocaleString("en-IN")} new people per 24 hours (WhatsApp messaging limit). Messages beyond that will fail — narrow the audience or split it over days.</div>}

              {numbers.length>0&&<>
                <div style={stepTitle}>4 · Personalise</div>
                <div style={{display:"grid",gap:10}}>
                  {numbers.map(number=>{
                    const item=mapping[number]||{source:"text",value:"",fallback:""}
                    return <div key={number} style={{display:"grid",gridTemplateColumns:"52px minmax(120px,1fr) minmax(120px,1fr) minmax(110px,1fr)",gap:8,alignItems:"end"}}>
                      <div style={{fontSize:13,fontWeight:800,color:"#075e54",paddingBottom:10}}>{`{{${number}}}`}</div>
                      <label><span style={labelText}>Value from</span>
                        <select value={item.source} onChange={event=>setVar(number,{source:event.target.value as Source,value:""})} style={inputStyle}>
                          {(Object.keys(SOURCE_LABELS) as Source[]).filter(source=>source!=="attribute"||attributeKeys.length).map(source=><option key={source} value={source}>{SOURCE_LABELS[source]}</option>)}
                        </select></label>
                      {item.source==="link"?<label><span style={labelText}>Link to track (https://…)</span>
                        <input required type="url" maxLength={1024} value={item.value} placeholder="https://yourstore.com/offer" onChange={event=>setVar(number,{value:event.target.value})} style={inputStyle}/></label>
                      :item.source==="text"?<label><span style={labelText}>Text</span>
                        <input required maxLength={1024} value={item.value} onChange={event=>setVar(number,{value:event.target.value})} style={inputStyle}/></label>
                      :item.source==="attribute"?<label><span style={labelText}>Field</span>
                        <select required value={item.value} onChange={event=>setVar(number,{value:event.target.value})} style={inputStyle}>
                          <option value="">Choose…</option>{attributeKeys.map(key=><option key={key} value={key}>{key}</option>)}</select></label>
                      :<div style={{fontSize:11,color:"#71817e",paddingBottom:12}}>From each contact</div>}
                      {item.source!=="text"&&item.source!=="link"?<label><span style={labelText}>If empty, use</span>
                        <input maxLength={1024} value={item.fallback} placeholder={item.source==="name"?"there":"optional"} onChange={event=>setVar(number,{fallback:event.target.value})} style={inputStyle}/></label>:<div/>}
                    </div>
                  })}
                </div>
                <div style={{fontSize:11,color:"#71817e",marginTop:6}}>Contacts with no value and no fallback are skipped (WhatsApp rejects empty variables) and listed in the report.</div>
              </>}

              <div style={stepTitle}>{numbers.length?5:4} · When</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                {([["now","Send now"],["schedule","Schedule"],["draft","Save as draft"]] as const).map(([value,label])=><label key={value} style={{display:"flex",alignItems:"center",gap:6,
                  border:`1px solid ${sendWhen===value?"#075e54":"#d7e2df"}`,borderRadius:6,padding:"8px 12px",fontSize:13,cursor:"pointer",background:sendWhen===value?"#f0faf6":"#fff"}}>
                  <input type="radio" checked={sendWhen===value} onChange={()=>setSendWhen(value)}/>{label}</label>)}
                {sendWhen==="schedule"&&<input type="datetime-local" required value={scheduledAt} min={localInputValue(new Date(Date.now()+120_000))}
                  onChange={event=>setScheduledAt(event.target.value)} style={{...inputStyle,width:"auto"}}/>}
              </div>

              <button type="submit" disabled={saving||!canSubmit} style={{marginTop:18,border:0,borderRadius:6,padding:"11px 18px",background:"#075e54",color:"#fff",
                fontSize:13,fontWeight:700,cursor:canSubmit?"pointer":"default",opacity:saving||!canSubmit?.6:1}}>
                {saving?"Saving…":sendWhen==="now"?`Send to ${estimate?.toLocaleString("en-IN")||0} contacts`:sendWhen==="schedule"?"Schedule broadcast":"Save draft"}</button>
            </div>

            <aside aria-label="Message preview" style={{background:"#efeae2",borderRadius:10,padding:16,alignSelf:"start",position:"sticky",top:80}}>
              <div style={{fontSize:11,fontWeight:700,color:"#54656f",textAlign:"center",marginBottom:10}}>
                Preview{sample?` for ${sample.name||`+${sample.phone}`}`:""}</div>
              <div style={{background:"#fff",borderRadius:"0 10px 10px 10px",padding:"10px 12px",fontSize:13,color:"#111b21",whiteSpace:"pre-wrap",lineHeight:1.45,boxShadow:"0 1px 1px rgba(0,0,0,.1)"}}>
                {selectedTemplate?preview:<span style={{color:"#8696a0"}}>Choose a template to see the message.</span>}
                <div style={{fontSize:10,color:"#667781",textAlign:"right",marginTop:4}}>{new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</div>
              </div>
              {selectedTemplate&&numbers.length>0&&<div style={{fontSize:11,color:"#54656f",marginTop:8}}>Each contact sees their own values.</div>}
            </aside>
          </div>
        </form>}
      </section>}

      <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid #e8efee",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0,color:"#183633"}}>All broadcasts</h2>
          {anyActive&&<span style={{fontSize:11,color:"#166534"}}>● Live — updating every few seconds</span>}
        </div>
        {loading?<div style={{padding:20,fontSize:12,color:"#647b77"}}>Loading broadcasts…</div>:campaigns.length?
          <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:980,borderCollapse:"collapse",textAlign:"left",fontSize:12}}>
            <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>{["Broadcast","Status","Progress","Sent","Delivered","Read","Replied","Clicked","Failed",""].map(label=>
              <th key={label} style={{padding:11,fontWeight:600}}>{label}</th>)}</tr></thead>
            <tbody>{campaigns.map(campaign=>{
              const stats:Stats=campaign.stats||{total:campaign.totalCount,queued:0,sent:0,delivered:0,read:0,replied:0,clicked:0,failed:0,skipped:0}
              const total=stats.total||campaign.totalCount
              const processed=stats.total-stats.queued
              const status=STATUS[campaign.status]||{label:campaign.status,bg:"#eef2f1",fg:"#49615e"}
              const busy=busyId===campaign.id
              const metric=(value:number,base:number,color="#183633")=><td style={{padding:11}}><div style={{fontWeight:700,color}}>{value.toLocaleString("en-IN")}</div>
                {base>0&&<div style={{fontSize:10,color:"#71817e"}}>{pct(value,base)}%</div>}</td>
              return <tr key={campaign.id} style={{borderTop:"1px solid #edf1f0",verticalAlign:"top"}}>
                <td style={{padding:11,maxWidth:260}}>
                  <a href={`/app/campaigns/${campaign.id}`} style={{fontWeight:700,color:"#183633",textDecoration:"none"}}>{campaign.name}</a>
                  <div style={{fontSize:10,color:"#71817e",marginTop:3}}>{campaign.template?.name||"-"} · {campaign.audienceType==="TAGS"?`tags: ${(campaign.audienceLabels||[]).join(", ")}`:"all opted-in"}</div>
                  <div style={{fontSize:10,color:"#71817e",marginTop:2}}>
                    {campaign.status==="SCHEDULED"?`⏰ ${when(campaign.scheduledAt)}`:campaign.startedAt?`Started ${when(campaign.startedAt)}`:`Created ${when(campaign.createdAt)}`}</div>
                </td>
                <td style={{padding:11}}><span style={{background:status.bg,color:status.fg,borderRadius:20,padding:"3px 9px",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{status.label}</span>
                  {campaign.pausedReason&&["PAUSED","FAILED"].includes(campaign.status)&&<div style={{fontSize:10,color:"#92400e",marginTop:5,maxWidth:180}}>{campaign.pausedReason}</div>}</td>
                <td style={{padding:11,minWidth:130}}>
                  {stats.total>0?<><div style={{height:6,background:"#e9efed",borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${pct(processed,stats.total)}%`,height:"100%",background:"#25d366",transition:"width .4s"}}/></div>
                    <div style={{fontSize:10,color:"#71817e",marginTop:4}}>{processed.toLocaleString("en-IN")} / {stats.total.toLocaleString("en-IN")}{stats.queued?` · ${stats.queued.toLocaleString("en-IN")} queued`:""}</div></>
                  :<div style={{fontSize:11,color:"#71817e"}}>{total.toLocaleString("en-IN")} contacts</div>}
                </td>
                {metric(stats.sent,stats.total)}{metric(stats.delivered,stats.sent)}{metric(stats.read,stats.sent)}{metric(stats.replied,stats.sent,"#075985")}{metric(stats.clicked||0,stats.sent,"#7c3aed")}
                <td style={{padding:11}}><div style={{fontWeight:700,color:stats.failed?"#b91c1c":"#183633"}}>{stats.failed.toLocaleString("en-IN")}</div>
                  {stats.skipped>0&&<div style={{fontSize:10,color:"#71817e"}}>+{stats.skipped} skipped</div>}</td>
                <td style={{padding:11}}>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    {campaign.status==="DRAFT"&&<button disabled={busy} onClick={()=>act(campaign,"launch")} style={smallBtn("#075e54")}>Send now</button>}
                    {["DRAFT","SCHEDULED"].includes(campaign.status)&&<button disabled={busy} onClick={()=>{setRescheduleId(campaign.id);
                      setRescheduleAt(localInputValue(campaign.scheduledAt&&new Date(campaign.scheduledAt)>new Date()?new Date(campaign.scheduledAt):new Date(Date.now()+3600_000)))}} style={smallBtn("#fff","#183633")}>
                      {campaign.status==="SCHEDULED"?"Reschedule":"Schedule"}</button>}
                    {["RUNNING","SCHEDULED","STARTING"].includes(campaign.status)&&<button disabled={busy} onClick={()=>act(campaign,"pause")} style={smallBtn("#fff","#92400e")}>Pause</button>}
                    {campaign.status==="PAUSED"&&<button disabled={busy} onClick={()=>act(campaign,"resume")} style={smallBtn("#075e54")}>Resume</button>}
                    {stats.failed>0&&["COMPLETED","PAUSED","RUNNING","FAILED"].includes(campaign.status)&&<button disabled={busy} onClick={()=>act(campaign,"retry_failed")} style={smallBtn("#fff","#183633")}>Retry failed</button>}
                    {["DRAFT","SCHEDULED","STARTING","RUNNING","PAUSED"].includes(campaign.status)&&<button disabled={busy} onClick={()=>act(campaign,"cancel")} style={smallBtn("#fff","#b91c1c")}>Cancel</button>}
                    {["DRAFT","CANCELLED","FAILED"].includes(campaign.status)&&!stats.sent&&<button disabled={busy} onClick={()=>act(campaign,"delete")} style={smallBtn("#fff","#b91c1c")}>Delete</button>}
                    {stats.total>0&&<a href={`/app/campaigns/${campaign.id}`} style={{...smallBtn("#fff","#075e54"),textDecoration:"none"}}>Report</a>}
                  </div>
                  {rescheduleId===campaign.id&&<div style={{display:"flex",gap:5,marginTop:8,justifyContent:"flex-end"}}>
                    <input type="datetime-local" value={rescheduleAt} min={localInputValue(new Date(Date.now()+120_000))} onChange={event=>setRescheduleAt(event.target.value)} style={{...inputStyle,width:"auto",minHeight:30,fontSize:11}}/>
                    <button disabled={busy||!rescheduleAt} onClick={()=>act(campaign,"schedule",{scheduledAt:new Date(rescheduleAt).toISOString()})} style={smallBtn("#075e54")}>Save</button>
                    <button onClick={()=>setRescheduleId("")} style={smallBtn("#fff","#64748b")}>✕</button>
                  </div>}
                </td>
              </tr>
            })}</tbody>
          </table></div>:<div style={{padding:22,fontSize:12,color:"#71817e"}}>No broadcasts yet.</div>}
      </section>
      <style>{`@media (max-width: 860px){ .zk-broadcast-grid{ grid-template-columns: 1fr !important } }`}</style>
    </div>
  )
}
