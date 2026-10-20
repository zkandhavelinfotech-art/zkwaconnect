"use client"
import { useEffect, useState } from "react"

type Stats = { total:number; sent:number; delivered:number; read:number; replied:number; failed:number }
type Data = {
  days:number; timezone:string
  series:{ messages:{day:string;inbound:number;outbound:number}[]; conversations:{day:string;count:number}[]; contacts:{day:string;count:number}[] }
  totals:{ inbound:number; outbound:number; delivered:number; read:number; failed:number; newConversations:number; newContacts:number; contacts:number; optedIn:number; avgFirstResponseSeconds:number|null; linksClicked:number; linkClicks:number }
  senders:Record<string,number>; categories:Record<string,number>; conversationStates:Record<string,number>
  contactSources:{source:string;count:number}[]
  agents:{id:string;name:string;messages:number;replies:number;medianSeconds:number|null;open:number}[]
  campaigns:{id:string;name:string;status:string;startedAt:string;template:{name:string}|null;stats?:Stats}[]
  ads:{sourceId:string|null;headline:string|null;sourceType:string;leads:number}[]
}

const card:React.CSSProperties = {background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:18}
const h2:React.CSSProperties = {fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:700,color:"#183633",margin:"0 0 12px"}
const pct = (part:number,whole:number) => whole ? `${Math.round(part/whole*100)}%` : "—"
const num = (value:number) => value.toLocaleString("en-IN")
function duration(seconds:number|null){
  if(seconds===null)return "—"
  if(seconds<60)return `${Math.round(seconds)}s`
  if(seconds<3600)return `${Math.round(seconds/60)}m`
  if(seconds<86400)return `${(seconds/3600).toFixed(1)}h`
  return `${(seconds/86400).toFixed(1)}d`
}
const SENDERS:Record<string,[string,string]> = { chatbot:["🤖 Chatbot flows","#7c3aed"], agent:["👤 Agents","#075e54"], broadcast:["📣 Broadcasts","#0284c7"],
  api:["🧩 API","#d97706"], away:["🌙 Away message","#64748b"], other:["Other","#cbd5e1"] }

// Fill every day of the range so charts have no gaps.
function daysOf(days:number,timezone:string){
  const out:string[] = []
  for(let i=days-1;i>=0;i--)out.push(new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()-i*86_400_000)))
  return out
}

function Bars({ labels, series, height=170 }:{ labels:string[]; series:{name:string;color:string;values:number[]}[]; height?:number }){
  const width = 640, pad = 28
  const totals = labels.map((_,i)=>series.reduce((sum,item)=>sum+item.values[i],0))
  const max = Math.max(1,...totals)
  const slot = (width-pad)/labels.length, bar = Math.max(2,slot*0.7)
  const [hover,setHover] = useState<number|null>(null)
  return <div style={{position:"relative"}}>
    <svg viewBox={`0 0 ${width} ${height+20}`} role="img" aria-label={`${series.map(item=>item.name).join(" and ")} per day`} style={{width:"100%",height:"auto",display:"block"}}>
      {[0,.5,1].map(f=><g key={f}><line x1={pad} x2={width} y1={height-f*(height-10)} y2={height-f*(height-10)} stroke="#eef2f1"/>
        <text x={pad-4} y={height-f*(height-10)+3} fontSize="9" textAnchor="end" fill="#94a3b8">{Math.round(max*f)}</text></g>)}
      {labels.map((label,i)=>{
        let y = height
        return <g key={label} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}>
          <rect x={pad+i*slot} y={0} width={slot} height={height} fill={hover===i?"#f8fafc":"transparent"}/>
          {series.map(item=>{const h = item.values[i]/max*(height-10); y-=h; return <rect key={item.name} x={pad+i*slot+(slot-bar)/2} y={y} width={bar} height={h} fill={item.color} rx={1}/>})}
          {(labels.length<=10||i%Math.ceil(labels.length/8)===0)&&<text x={pad+i*slot+slot/2} y={height+14} fontSize="9" textAnchor="middle" fill="#94a3b8">{label.slice(5).replace("-","/")}</text>}
        </g>
      })}
    </svg>
    {hover!==null&&<div style={{position:"absolute",top:0,right:0,background:"#0f172a",color:"#fff",fontSize:11,borderRadius:6,padding:"6px 9px"}}>
      {new Date(labels[hover]+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"})}: {series.map(item=>`${item.name} ${num(item.values[hover])}`).join(" · ")}</div>}
    <div style={{display:"flex",gap:14,fontSize:11,color:"#64748b",marginTop:4}}>{series.map(item=><span key={item.name}><span style={{display:"inline-block",width:9,height:9,borderRadius:2,background:item.color,marginRight:5}}/>{item.name}</span>)}</div>
  </div>
}

function Split({ entries }:{ entries:{label:string;value:number;color:string}[] }){
  const total = entries.reduce((sum,item)=>sum+item.value,0)
  if(!total)return <p style={{fontSize:12,color:"#94a3b8",margin:0}}>No data in this period.</p>
  return <div>
    <div style={{display:"flex",height:12,borderRadius:6,overflow:"hidden",marginBottom:10}}>
      {entries.filter(item=>item.value).map(item=><div key={item.label} title={`${item.label}: ${num(item.value)}`} style={{width:`${item.value/total*100}%`,background:item.color}}/>)}
    </div>
    {entries.filter(item=>item.value).map(item=><div key={item.label} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",color:"#334155"}}>
      <span><span style={{display:"inline-block",width:9,height:9,borderRadius:2,background:item.color,marginRight:6}}/>{item.label}</span>
      <span><strong>{num(item.value)}</strong> <span style={{color:"#94a3b8"}}>{pct(item.value,total)}</span></span></div>)}
  </div>
}

export default function AnalyticsPage() {
  const [days,setDays] = useState(30)
  const [data,setData] = useState<Data|null>(null)
  const [error,setError] = useState("")
  useEffect(()=>{
    let active = true
    setError("")
    fetch(`/api/analytics?days=${days}`).then(async response=>{
      const body = await response.json()
      if(!response.ok)throw new Error(body.error||"Could not load analytics.")
      if(active)setData(body)
    }).catch(reason=>{if(active)setError(reason.message)})
    return ()=>{active=false}
  },[days])

  const labels = data?daysOf(data.days,data.timezone):[]
  const valueOn = <T extends {day:string}>(rows:T[],key:keyof T)=>labels.map(day=>Number(rows.find(row=>row.day===day)?.[key]||0))
  const t = data?.totals
  const kpis:[string,string,string][] = t?[
    ["Messages received",num(t.inbound),`${num(t.newConversations)} new conversations`],
    ["Messages sent",num(t.outbound),`${pct(t.delivered,t.outbound)} delivered · ${pct(t.read,t.outbound)} read`],
    ["Failed",num(t.failed),`${pct(t.failed,t.outbound)} of sent`],
    ["First response (agents)",duration(t.avgFirstResponseSeconds),"average time to a human reply"],
    ["Link clicks",num(t.linkClicks),`${num(t.linksClicked)} people/messages clicked a tracked link`],
    ["New contacts",num(t.newContacts),`${num(t.contacts)} total · ${num(t.optedIn)} opted in`],
  ]:[]

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",marginBottom:18}}>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>📈 Analytics</h1>
          <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>Messages, delivery, team response times, broadcasts and growth{data?` · times in ${data.timezone}`:""}.</p>
        </div>
        <div role="radiogroup" aria-label="Period" style={{display:"inline-flex",background:"#e9efed",borderRadius:20,padding:3}}>
          {[7,30,90].map(value=><button key={value} role="radio" aria-checked={days===value} onClick={()=>setDays(value)} style={{border:0,borderRadius:18,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",
            background:days===value?"#075e54":"transparent",color:days===value?"#fff":"#49615e"}}>Last {value} days</button>)}
        </div>
      </div>
      {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
      {!data?<div style={{color:"#64748b",fontSize:13}}>{error?"":"Loading analytics…"}</div>:<>
        <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,170px),1fr))",gap:10,marginBottom:14}}>
          {kpis.map(([label,value,sub])=><article key={label} style={{...card,padding:"14px 16px"}}>
            <div style={{fontSize:11,color:"#64748b",fontWeight:700}}>{label}</div>
            <div style={{fontFamily:"Sora,sans-serif",fontSize:24,fontWeight:800,color:"#0f172a",margin:"4px 0 2px"}}>{value}</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>{sub}</div></article>)}
        </section>

        <section style={{...card,marginBottom:14}}>
          <h2 style={h2}>Messages per day</h2>
          <Bars labels={labels} series={[{name:"Received",color:"#25d366",values:valueOn(data.series.messages,"inbound")},{name:"Sent",color:"#075e54",values:valueOn(data.series.messages,"outbound")}]}/>
        </section>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))",gap:14,marginBottom:14}}>
          <section style={card}>
            <h2 style={h2}>Delivery of sent messages</h2>
            <Split entries={[{label:"Read",value:t!.read,color:"#0e9f6e"},{label:"Delivered, not read",value:t!.delivered-t!.read,color:"#84cc16"},
              {label:"Sent, not delivered yet",value:Math.max(0,t!.outbound-t!.delivered-t!.failed),color:"#cbd5e1"},{label:"Failed",value:t!.failed,color:"#ef4444"}]}/>
          </section>
          <section style={card}>
            <h2 style={h2}>Who sent your messages</h2>
            <Split entries={Object.entries(SENDERS).map(([key,[label,color]])=>({label,color,value:data.senders[key]||0}))}/>
          </section>
          <section style={card}>
            <h2 style={h2}>Templates sent by category</h2>
            <Split entries={[["MARKETING","Marketing","#f59e0b"],["UTILITY","Utility","#0284c7"],["AUTHENTICATION","Authentication","#7c3aed"],["UNKNOWN","Other","#cbd5e1"]]
              .map(([key,label,color])=>({label,color,value:data.categories[key]||0}))}/>
            <p style={{fontSize:11,color:"#94a3b8",margin:"8px 0 0"}}>Meta charges per template message by category (marketing costs most).</p>
          </section>
        </div>

        <section style={{...card,marginBottom:14}}>
          <h2 style={h2}>Team performance</h2>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
            <thead style={{color:"#64748b"}}><tr>{["Agent","Messages sent","Chats answered","Median first response","Open chats now"].map(label=><th key={label} style={{padding:"6px 8px",fontWeight:600}}>{label}</th>)}</tr></thead>
            <tbody>{data.agents.map(agent=><tr key={agent.id} style={{borderTop:"1px solid #edf1f0"}}>
              <td style={{padding:8,fontWeight:700}}>{agent.name}</td><td style={{padding:8}}>{num(agent.messages)}</td><td style={{padding:8}}>{num(agent.replies)}</td>
              <td style={{padding:8,color:agent.medianSeconds!==null&&agent.medianSeconds>3600?"#b45309":"#183633"}}>{duration(agent.medianSeconds)}</td><td style={{padding:8}}>{num(agent.open)}</td></tr>)}</tbody>
          </table></div>
          <p style={{fontSize:11,color:"#94a3b8",margin:"8px 0 0"}}>Conversations now: {["OPEN","PENDING","RESOLVED"].map(state=>`${state.toLowerCase()} ${num(data.conversationStates[state]||0)}`).join(" · ")}</p>
        </section>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,380px),1fr))",gap:14,marginBottom:14}}>
          <section style={card}>
            <h2 style={h2}>New contacts per day</h2>
            <Bars height={120} labels={labels} series={[{name:"New contacts",color:"#0284c7",values:valueOn(data.series.contacts,"count")}]}/>
            {data.contactSources.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>{data.contactSources.map(item=>
              <span key={item.source} style={{fontSize:11,background:"#f1f5f9",borderRadius:12,padding:"3px 9px",color:"#475569"}}>{item.source.toLowerCase().replace(/_/g," ")} · {num(item.count)}</span>)}</div>}
          </section>
          <section style={card}>
            <h2 style={h2}>Leads from Click-to-WhatsApp ads</h2>
            {data.ads.length?<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><tbody>{data.ads.map(ad=><tr key={`${ad.sourceId}-${ad.headline}`} style={{borderTop:"1px solid #edf1f0"}}>
              <td style={{padding:"7px 4px"}}>{ad.sourceType==="ad"?"📣":"📌"} {ad.headline||"(no headline)"}<div style={{fontSize:10,color:"#94a3b8"}}>{ad.sourceId?`ID ${ad.sourceId}`:""}</div></td>
              <td style={{padding:"7px 4px",textAlign:"right",fontWeight:800}}>{num(ad.leads)}</td></tr>)}</tbody></table>
              :<p style={{fontSize:12,color:"#94a3b8",margin:0}}>No chats from ads in this period. Chats started from your Click-to-WhatsApp ads show up here.</p>}
          </section>
        </div>

        <section style={card}>
          <h2 style={h2}>Broadcasts in this period</h2>
          {data.campaigns.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
            <thead style={{color:"#64748b"}}><tr>{["Broadcast","Sent","Delivered","Read","Replied","Failed"].map(label=><th key={label} style={{padding:"6px 8px",fontWeight:600}}>{label}</th>)}</tr></thead>
            <tbody>{data.campaigns.map(campaign=>{const s = campaign.stats||{total:0,sent:0,delivered:0,read:0,replied:0,failed:0}
              return <tr key={campaign.id} style={{borderTop:"1px solid #edf1f0"}}>
                <td style={{padding:8}}><a href={`/app/campaigns/${campaign.id}`} style={{fontWeight:700,color:"#075e54",textDecoration:"none"}}>{campaign.name}</a>
                  <div style={{fontSize:10,color:"#94a3b8"}}>{campaign.template?.name} · {new Date(campaign.startedAt).toLocaleDateString("en-IN")}</div></td>
                <td style={{padding:8}}>{num(s.sent)}</td><td style={{padding:8}}>{pct(s.delivered,s.sent)}</td><td style={{padding:8}}>{pct(s.read,s.sent)}</td>
                <td style={{padding:8}}>{pct(s.replied,s.sent)}</td><td style={{padding:8,color:s.failed?"#b91c1c":"#183633"}}>{num(s.failed)}</td></tr>})}</tbody>
          </table></div>:<p style={{fontSize:12,color:"#94a3b8",margin:0}}>No broadcasts sent in this period.</p>}
        </section>
      </>}
    </div>
  )
}
