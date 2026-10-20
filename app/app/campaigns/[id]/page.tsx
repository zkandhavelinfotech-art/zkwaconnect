"use client"
import { use, useEffect, useState } from "react"

type Stats = { total:number; queued:number; sent:number; delivered:number; read:number; replied:number; clicked:number; failed:number; skipped:number }
type Recipient = { id:string; name:string|null; phone:string; status:string; attempts:number; errorCode:string|null; errorMessage:string|null
  sentAt:string|null; deliveredAt:string|null; readAt:string|null; repliedAt:string|null; failedAt:string|null; nextAttemptAt:string }
type Report = {
  campaign:{ id:string; name:string; status:string; scheduledAt:string|null; startedAt:string|null; completedAt:string|null; pausedReason:string|null
    audienceType:string; audienceLabels:string[]|null; phoneNumber:{displayName:string|null;phoneNumber:string}
    template:{name:string;language:string;status:string;content:string|null;category:string|null}|null }
  stats:Stats; recipients:Recipient[]; page:number; pageSize:number; matching:number
  reasons:{ code:string|null; message:string|null; count:number }[]
}

const FILTERS = [["all","All"],["queued","Queued"],["sent","Sent"],["delivered","Delivered"],["read","Read"],["replied","Replied"],["clicked","Clicked"],["failed","Failed"],["skipped","Skipped"]] as const
const ROW_STATUS: Record<string,[string,string,string]> = {
  QUEUED:["Queued","#eef2f1","#49615e"], SENDING:["Sending","#e0f2fe","#075985"], SENT:["Sent","#e0f2fe","#075985"],
  DELIVERED:["Delivered","#dcfce7","#166534"], READ:["Read","#bbf7d0","#14532d"], FAILED:["Failed","#fee2e2","#991b1b"], SKIPPED:["Skipped","#f3f4f6","#4b5563"],
}
const when = (value:string|null) => value ? new Date(value).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}) : "—"
const pct = (part:number,whole:number) => whole ? `${Math.round(part / whole * 100)}%` : "—"

export default function CampaignReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [report,setReport]=useState<Report|null>(null)
  const [filter,setFilter]=useState("all")
  const [query,setQuery]=useState("")
  const [search,setSearch]=useState("")
  const [page,setPage]=useState(1)
  const [error,setError]=useState("")
  const [tick,setTick]=useState(0)

  useEffect(()=>{
    let active=true
    const params=new URLSearchParams({status:filter,page:String(page),...(search?{q:search}:{})})
    fetch(`/api/campaigns/${id}?${params}`).then(async response=>{
      const body=await response.json()
      if(!response.ok)throw new Error(body.error||"Could not load the report.")
      if(active){setReport(body);setError("")}
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Could not load the report.")})
    return ()=>{active=false}
  },[id,filter,page,search,tick])

  const live=report&&["SCHEDULED","STARTING","RUNNING"].includes(report.campaign.status)
  useEffect(()=>{
    if(!live)return
    const timer=setInterval(()=>setTick(value=>value+1),4000)
    return ()=>clearInterval(timer)
  },[live])

  if(error&&!report)return <div role="alert" style={{padding:20,color:"#9f2d22"}}>{error} <a href="/app/campaigns" style={{color:"#075e54"}}>Back to broadcasts</a></div>
  if(!report)return <div style={{padding:20,color:"#647b77"}}>Loading report…</div>
  const { campaign, stats } = report
  const pages=Math.max(1,Math.ceil(report.matching/report.pageSize))
  const tiles:[string,number,string,string][]=[
    ["Audience",stats.total,"",""],["Sent",stats.sent,pct(stats.sent,stats.total),"of audience"],["Delivered",stats.delivered,pct(stats.delivered,stats.sent),"of sent"],
    ["Read",stats.read,pct(stats.read,stats.sent),"of sent"],["Replied",stats.replied,pct(stats.replied,stats.sent),"of sent"],["Clicked",stats.clicked||0,pct(stats.clicked||0,stats.sent),"tapped a tracked link"],
    ["Failed",stats.failed,pct(stats.failed,stats.total),"of audience"],["Skipped",stats.skipped,"","no value / cancelled"],["Queued",stats.queued,"","waiting to send"],
  ]
  const exportParams=new URLSearchParams({format:"csv",status:filter,...(search?{q:search}:{})})

  return (
    <div>
      <a href="/app/campaigns" style={{fontSize:12,color:"#075e54",fontWeight:700,textDecoration:"none"}}>← All broadcasts</a>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",margin:"8px 0 18px"}}>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>{campaign.name}</h1>
          <p style={{fontSize:12,color:"#64748b",margin:"5px 0 0"}}>
            {campaign.template?.name} · from {campaign.phoneNumber.displayName||campaign.phoneNumber.phoneNumber} · {campaign.audienceType==="TAGS"?`tags: ${(campaign.audienceLabels||[]).join(", ")}`:"all opted-in contacts"}
          </p>
          <p style={{fontSize:12,color:"#64748b",margin:"3px 0 0"}}>
            Status: <strong>{campaign.status.toLowerCase()}</strong>{live&&<span style={{color:"#166534"}}> ● live</span>}
            {campaign.scheduledAt&&` · scheduled ${when(campaign.scheduledAt)}`}{campaign.startedAt&&` · started ${when(campaign.startedAt)}`}{campaign.completedAt&&` · finished ${when(campaign.completedAt)}`}
          </p>
          {campaign.pausedReason&&["PAUSED","FAILED"].includes(campaign.status)&&<p style={{fontSize:12,color:"#92400e",background:"#fffbeb",borderRadius:6,padding:"6px 10px",margin:"8px 0 0"}}>{campaign.pausedReason}</p>}
        </div>
        <a href={`/api/campaigns/${id}?${exportParams}`} style={{border:"1px solid #cbd5d3",borderRadius:6,padding:"8px 12px",background:"#fff",color:"#183633",fontSize:12,fontWeight:700,textDecoration:"none"}}>⬇ Export CSV</a>
      </div>

      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,130px),1fr))",gap:10,marginBottom:18}}>
        {tiles.map(([label,value,share,note])=><article key={label} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:700}}>{label}</div>
          <div style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:800,color:label==="Failed"&&value?"#b91c1c":"#0f172a",marginTop:4}}>{value.toLocaleString("en-IN")}</div>
          <div style={{fontSize:10,color:"#71817e"}}>{share&&<strong>{share} </strong>}{note}</div>
        </article>)}
      </section>

      {report.reasons.length>0&&<section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:16,marginBottom:18}}>
        <h2 style={{fontFamily:"Sora,sans-serif",fontSize:14,margin:"0 0 10px",color:"#183633"}}>Why messages didn&apos;t go out</h2>
        <div style={{display:"grid",gap:6}}>{report.reasons.map(reason=><div key={`${reason.code}-${reason.message}`} style={{display:"flex",gap:10,fontSize:12,alignItems:"baseline"}}>
          <strong style={{minWidth:50,color:"#b91c1c"}}>{reason.count.toLocaleString("en-IN")}</strong>
          <span style={{color:"#183633"}}>{reason.message||"Unknown error"}{reason.code&&reason.code!=="SKIPPED"&&<span style={{color:"#71817e"}}> (code {reason.code})</span>}</span>
        </div>)}</div>
      </section>}

      <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
        <div style={{padding:"12px 14px",borderBottom:"1px solid #e8efee",display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
          <div role="tablist" style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {FILTERS.map(([value,label])=><button key={value} role="tab" aria-selected={filter===value} onClick={()=>{setFilter(value);setPage(1)}}
              style={{border:0,borderRadius:16,padding:"5px 11px",fontSize:11,fontWeight:700,cursor:"pointer",background:filter===value?"#075e54":"#eef2f1",color:filter===value?"#fff":"#49615e"}}>{label}</button>)}
          </div>
          <form onSubmit={event=>{event.preventDefault();setSearch(query.trim());setPage(1)}} style={{display:"flex",gap:6}}>
            <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search name or phone" aria-label="Search recipients"
              style={{border:"1px solid #cbd5d3",borderRadius:6,padding:"6px 10px",fontSize:12,minWidth:180}}/>
            <button type="submit" style={{border:"1px solid #cbd5d3",borderRadius:6,background:"#fff",padding:"6px 10px",fontSize:12,cursor:"pointer"}}>Search</button>
          </form>
        </div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:820,borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
          <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>{["Contact","Status","Sent","Delivered","Read","Replied","Details"].map(label=><th key={label} style={{padding:10,fontWeight:600}}>{label}</th>)}</tr></thead>
          <tbody>{report.recipients.map(row=>{
            const [label,bg,fg]=ROW_STATUS[row.status]||[row.status,"#eef2f1","#49615e"]
            return <tr key={row.id} style={{borderTop:"1px solid #edf1f0"}}>
              <td style={{padding:10}}><div style={{fontWeight:700,color:"#183633"}}>{row.name||"—"}</div><div style={{color:"#71817e"}}>+{row.phone}</div></td>
              <td style={{padding:10}}><span style={{background:bg,color:fg,borderRadius:20,padding:"2px 8px",fontWeight:700,fontSize:11}}>{label}</span>
                {row.repliedAt&&<span style={{marginLeft:4,background:"#e0f2fe",color:"#075985",borderRadius:20,padding:"2px 8px",fontWeight:700,fontSize:11}}>Replied</span>}</td>
              <td style={{padding:10,color:"#49615e"}}>{when(row.sentAt)}</td><td style={{padding:10,color:"#49615e"}}>{when(row.deliveredAt)}</td>
              <td style={{padding:10,color:"#49615e"}}>{when(row.readAt)}</td><td style={{padding:10,color:"#49615e"}}>{when(row.repliedAt)}</td>
              <td style={{padding:10,color:row.status==="FAILED"?"#b91c1c":"#71817e",maxWidth:280}}>
                {row.errorMessage?<>{row.errorMessage}{row.errorCode&&row.errorCode!=="SKIPPED"?` (${row.errorCode})`:""}</>:row.attempts>1?`${row.attempts} attempts`:""}
                {row.status==="QUEUED"&&row.attempts>0&&<div>Retrying {when(row.nextAttemptAt)}</div>}</td>
            </tr>
          })}</tbody>
        </table></div>
        {!report.recipients.length&&<div style={{padding:20,fontSize:12,color:"#71817e"}}>{stats.total?"No contacts match this filter.":"Contacts are added when the broadcast starts sending."}</div>}
        {pages>1&&<div style={{padding:"10px 14px",borderTop:"1px solid #e8efee",display:"flex",gap:8,alignItems:"center",justifyContent:"flex-end",fontSize:12,color:"#49615e"}}>
          <button disabled={page<=1} onClick={()=>setPage(value=>value-1)} style={{border:"1px solid #cbd5d3",borderRadius:5,background:"#fff",padding:"4px 10px",cursor:"pointer"}}>‹ Prev</button>
          Page {page} of {pages} · {report.matching.toLocaleString("en-IN")} contacts
          <button disabled={page>=pages} onClick={()=>setPage(value=>value+1)} style={{border:"1px solid #cbd5d3",borderRadius:5,background:"#fff",padding:"4px 10px",cursor:"pointer"}}>Next ›</button>
        </div>}
      </section>
    </div>
  )
}
