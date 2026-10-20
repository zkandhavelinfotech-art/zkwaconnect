"use client"
import { useEffect, useState } from "react"

type Key = { id:string; name:string; prefix:string; lastUsedAt:string|null; revokedAt:string|null; createdAt:string }
type Delivery = { id:string; event:string; status:string; attempts:number; responseStatus:number|null; error:string|null; createdAt:string; deliveredAt:string|null; nextAttemptAt:string }
type Endpoint = { id:string; url:string; events:string[]; description:string|null; active:boolean; failureCount:number; lastDeliveryAt:string|null
  lastStatus:number|null; lastError:string|null; createdAt:string; deliveries:Delivery[] }

const card:React.CSSProperties = {background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:20,marginBottom:18}
const input:React.CSSProperties = {boxSizing:"border-box",border:"1px solid #cbd5d3",borderRadius:6,padding:"8px 10px",fontSize:13,color:"#183633",background:"#fff"}
const primary:React.CSSProperties = {border:0,borderRadius:6,padding:"9px 14px",background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}
const link:React.CSSProperties = {border:0,background:"none",fontSize:12,fontWeight:700,cursor:"pointer",padding:0}
const code:React.CSSProperties = {display:"block",background:"#0f172a",color:"#e2e8f0",borderRadius:8,padding:"12px 14px",fontSize:12,overflowX:"auto",whiteSpace:"pre",lineHeight:1.5}
const when = (value:string|null) => value ? new Date(value).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}) : "never"
const DELIVERY_COLORS:Record<string,string> = { DELIVERED:"#166534", PENDING:"#92400e", SENDING:"#075985", FAILED:"#991b1b" }

function Secret({ label, value, onDone }:{ label:string; value:string; onDone:()=>void }) {
  const [copied,setCopied] = useState(false)
  return <div role="status" style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:14,marginBottom:14}}>
    <div style={{fontSize:13,fontWeight:700,color:"#78350f",marginBottom:6}}>{label} — copy it now, it won&apos;t be shown again.</div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <code style={{flex:1,minWidth:240,background:"#fff",border:"1px solid #fde68a",borderRadius:6,padding:"8px 10px",fontSize:12,wordBreak:"break-all"}}>{value}</code>
      <button onClick={async()=>{try{await navigator.clipboard.writeText(value);setCopied(true)}catch{/* blocked */}}} style={primary}>{copied?"Copied ✓":"Copy"}</button>
      <button onClick={onDone} style={{...primary,background:"#fff",color:"#64748b",border:"1px solid #cbd5d3"}}>I&apos;ve saved it</button>
    </div>
  </div>
}

export default function DevelopersPage() {
  const [keys,setKeys] = useState<Key[]>([])
  const [endpoints,setEndpoints] = useState<Endpoint[]>([])
  const [events,setEvents] = useState<Record<string,string>>({})
  const [keyName,setKeyName] = useState("")
  const [hookUrl,setHookUrl] = useState("")
  const [hookEvents,setHookEvents] = useState<string[]>(["message.received","message.status"])
  const [shownSecret,setShownSecret] = useState<{label:string;value:string}|null>(null)
  const [openLog,setOpenLog] = useState("")
  const [error,setError] = useState("")
  const [notice,setNotice] = useState("")
  const [origin,setOrigin] = useState("https://app.zkwaconnect.in")

  async function load(){
    const [a,b] = await Promise.all([fetch("/api/developer/keys"),fetch("/api/developer/webhooks")])
    const [keyBody,hookBody] = await Promise.all([a.json(),b.json()])
    if(!a.ok)throw new Error(keyBody.error||"Could not load API keys.")
    setKeys(keyBody.keys);setEndpoints(hookBody.endpoints||[]);setEvents(hookBody.events||{})
  }
  useEffect(()=>{setOrigin(window.location.origin);load().catch(reason=>setError(reason.message))},[])

  async function call(url:string,method:string,body?:unknown){
    setError("");setNotice("")
    try{
      const response = await fetch(url,{method,headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)})
      const data = await response.json()
      if(!response.ok)throw new Error(data.error||"Something went wrong.")
      if(data.message)setNotice(data.message)
      await load()
      return data
    }catch(reason){setError(reason instanceof Error?reason.message:"Something went wrong.");return null}
  }

  async function createKey(event:React.FormEvent){
    event.preventDefault()
    const data = await call("/api/developer/keys","POST",{name:keyName})
    if(data){setShownSecret({label:`API key “${keyName}”`,value:data.key});setKeyName("")}
  }
  async function addEndpoint(event:React.FormEvent){
    event.preventDefault()
    const data = await call("/api/developer/webhooks","POST",{url:hookUrl,events:hookEvents})
    if(data){setShownSecret({label:"Webhook signing secret",value:data.secret});setHookUrl("")}
  }

  const sample = `curl -X POST ${origin}/api/v1/messages \\
  -H "Authorization: Bearer zkwa_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "919876543210",
    "type": "template",
    "template": { "name": "order_update", "language": "en", "variables": ["Asha", "A-1024"] },
    "contact": { "name": "Asha", "tags": ["website"], "attributes": { "city": "Chennai" } }
  }'`
  const verify = `// Node.js — verify a ZKWAConnect webhook
import crypto from "node:crypto"
const ts = req.headers["x-zkwa-timestamp"], sig = req.headers["x-zkwa-signature"]
const expected = "sha256=" + crypto.createHmac("sha256", process.env.ZKWA_WEBHOOK_SECRET)
  .update(ts + "." + rawBody).digest("hex")
const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  && Math.abs(Date.now() / 1000 - Number(ts)) < 300   // reject replays older than 5 minutes`

  return (
    <div style={{maxWidth:980}}>
      <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:"0 0 4px"}}>Developers</h1>
      <p style={{fontSize:13,color:"#64748b",margin:"0 0 18px"}}>Connect your website, CRM or app: send WhatsApp messages with the REST API and receive events on your server with webhooks.</p>
      {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
      {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13}}>{notice}</div>}
      {shownSecret&&<Secret label={shownSecret.label} value={shownSecret.value} onDone={()=>setShownSecret(null)}/>}

      <section style={card}>
        <h2 style={{fontFamily:"Sora,sans-serif",fontSize:16,margin:"0 0 4px"}}>🔑 API keys</h2>
        <p style={{fontSize:12,color:"#64748b",margin:"0 0 14px"}}>Keys act on behalf of this workspace. Keep them on your server — never in a website or mobile app.</p>
        <form onSubmit={createKey} style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <input aria-label="Key name" required minLength={2} maxLength={60} value={keyName} onChange={event=>setKeyName(event.target.value)} placeholder="Key name, e.g. Website orders" style={{...input,flex:1,minWidth:220}}/>
          <button type="submit" style={primary}>Create key</button>
        </form>
        {keys.length?<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
          <thead style={{color:"#64748b"}}><tr>{["Name","Key","Created","Last used",""].map(label=><th key={label} style={{padding:"6px 8px",fontWeight:600}}>{label}</th>)}</tr></thead>
          <tbody>{keys.map(key=><tr key={key.id} style={{borderTop:"1px solid #edf1f0",opacity:key.revokedAt?.5:1}}>
            <td style={{padding:8,fontWeight:700}}>{key.name}</td><td style={{padding:8}}><code>{key.prefix}…</code></td>
            <td style={{padding:8}}>{when(key.createdAt)}</td><td style={{padding:8}}>{when(key.lastUsedAt)}</td>
            <td style={{padding:8,textAlign:"right"}}>{key.revokedAt?<span style={{color:"#991b1b"}}>Revoked</span>:
              <button onClick={()=>window.confirm(`Revoke “${key.name}”? Apps using it stop working immediately.`)&&call(`/api/developer/keys?id=${key.id}`,"DELETE")} style={{...link,color:"#b91c1c"}}>Revoke</button>}</td>
          </tr>)}</tbody></table>:<p style={{fontSize:12,color:"#94a3b8"}}>No API keys yet.</p>}
      </section>

      <section style={card}>
        <h2 style={{fontFamily:"Sora,sans-serif",fontSize:16,margin:"0 0 4px"}}>🔔 Webhooks</h2>
        <p style={{fontSize:12,color:"#64748b",margin:"0 0 14px"}}>We POST JSON to your HTTPS URL when these events happen, signed with your secret. Failed deliveries are retried for about 8 hours.</p>
        <form onSubmit={addEndpoint} style={{marginBottom:16}}>
          <input aria-label="Webhook URL" required type="url" value={hookUrl} onChange={event=>setHookUrl(event.target.value)} placeholder="https://your-server.com/zkwa-webhook" style={{...input,width:"100%",marginBottom:8}}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>{Object.entries(events).map(([name,description])=>{
            const on = hookEvents.includes(name)
            return <label key={name} title={description} style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${on?"#075e54":"#d7e2df"}`,borderRadius:20,padding:"5px 12px",fontSize:12,cursor:"pointer",background:on?"#f0faf6":"#fff"}}>
              <input type="checkbox" checked={on} onChange={()=>setHookEvents(current=>on?current.filter(item=>item!==name):[...current,name])}/><code>{name}</code></label>
          })}</div>
          <button type="submit" disabled={!hookEvents.length} style={primary}>Add endpoint</button>
        </form>
        {endpoints.map(endpoint=><div key={endpoint.id} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:12,marginBottom:10}}>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{width:8,height:8,borderRadius:4,background:!endpoint.active?"#94a3b8":endpoint.failureCount?"#f59e0b":"#22c55e"}}/>
            <code style={{fontSize:12,fontWeight:700,wordBreak:"break-all",flex:1}}>{endpoint.url}</code>
            <button onClick={()=>call("/api/developer/webhooks","POST",{action:"test",id:endpoint.id}).then(()=>setOpenLog(endpoint.id))} style={{...link,color:"#075e54"}}>Send test</button>
            <button onClick={()=>setOpenLog(openLog===endpoint.id?"":endpoint.id)} style={{...link,color:"#075e54"}}>Deliveries</button>
            <button onClick={()=>call("/api/developer/webhooks","PATCH",{id:endpoint.id,active:!endpoint.active})} style={{...link,color:"#92400e"}}>{endpoint.active?"Turn off":"Turn on"}</button>
            <button onClick={async()=>{if(!window.confirm("Create a new signing secret? The current one stops working immediately."))return
              const data = await call("/api/developer/webhooks","PATCH",{id:endpoint.id,rotateSecret:true});if(data?.secret)setShownSecret({label:"New webhook signing secret",value:data.secret})}} style={{...link,color:"#475569"}}>Rotate secret</button>
            <button onClick={()=>window.confirm("Delete this endpoint?")&&call(`/api/developer/webhooks?id=${endpoint.id}`,"DELETE")} style={{...link,color:"#b91c1c"}}>Delete</button>
          </div>
          <div style={{fontSize:11,color:"#64748b",marginTop:6}}>{endpoint.events.join(" · ")} · last delivery {when(endpoint.lastDeliveryAt)}{endpoint.lastStatus?` (HTTP ${endpoint.lastStatus})`:""}
            {!endpoint.active&&" · turned off"}{endpoint.failureCount>0&&<span style={{color:"#b45309"}}> · {endpoint.failureCount} failure(s) in a row{endpoint.lastError?`: ${endpoint.lastError}`:""}</span>}</div>
          {openLog===endpoint.id&&<table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginTop:10}}>
            <tbody>{endpoint.deliveries.length?endpoint.deliveries.map(delivery=><tr key={delivery.id} style={{borderTop:"1px solid #f1f5f9"}}>
              <td style={{padding:"5px 6px"}}><code>{delivery.event}</code></td>
              <td style={{padding:"5px 6px",color:DELIVERY_COLORS[delivery.status],fontWeight:700}}>{delivery.status.toLowerCase()}{delivery.responseStatus?` · ${delivery.responseStatus}`:""}</td>
              <td style={{padding:"5px 6px",color:"#64748b"}}>{when(delivery.createdAt)} · {delivery.attempts} attempt(s){delivery.status==="PENDING"&&delivery.attempts?` · retry ${when(delivery.nextAttemptAt)}`:""}</td>
              <td style={{padding:"5px 6px",color:"#991b1b"}}>{delivery.error||""}</td>
            </tr>):<tr><td style={{padding:6,color:"#94a3b8"}}>No deliveries yet.</td></tr>}</tbody></table>}
        </div>)}
      </section>

      <section style={card}>
        <h2 style={{fontFamily:"Sora,sans-serif",fontSize:16,margin:"0 0 10px"}}>📘 API reference</h2>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:14}}><tbody>
          {[["GET","/api/v1/me","Check your key; lists your connected WhatsApp numbers"],
            ["POST","/api/v1/messages","Send a template (any time) or text / image / video / audio / document (within 24 h of the customer's last message)"],
            ["GET","/api/v1/messages/{id}","Message status: sent, delivered, read or failed (our id or the wamid)"],
            ["GET","/api/v1/templates","Approved templates with their variable counts"],
            ["POST","/api/v1/contacts","Create or update a contact by phone (tags added, attributes merged)"],
            ["GET","/api/v1/contacts?phone=…","Look up a contact (or ?tag=…&page=1 to list)"]].map(([method,path,desc])=><tr key={path} style={{borderTop:"1px solid #edf1f0"}}>
            <td style={{padding:"7px 8px",fontWeight:800,color:method==="GET"?"#075985":"#166534"}}>{method}</td><td style={{padding:"7px 8px"}}><code>{path}</code></td><td style={{padding:"7px 8px",color:"#475569"}}>{desc}</td></tr>)}
        </tbody></table>
        <div style={{fontSize:12,fontWeight:700,color:"#526763",margin:"0 0 6px"}}>Send a template</div>
        <code style={code}>{sample}</code>
        <p style={{fontSize:12,color:"#64748b"}}>Text: <code>{`{"to":"91…","type":"text","text":{"body":"Hi!"}}`}</code> · Media: <code>{`{"to":"91…","type":"document","document":{"url":"https://…/invoice.pdf","filename":"Invoice.pdf"}}`}</code>.
          Errors look like <code>{`{"error":{"code":"window_closed","message":"…"}}`}</code>. Limit: 600 requests/minute per key.</p>
        <div style={{fontSize:12,fontWeight:700,color:"#526763",margin:"14px 0 6px"}}>Verify webhook signatures</div>
        <code style={code}>{verify}</code>
        <p style={{fontSize:12,color:"#64748b",marginBottom:0}}>Each delivery has headers <code>X-ZKWA-Event</code>, <code>X-ZKWA-Delivery</code> (unique id — use it to ignore duplicates), <code>X-ZKWA-Timestamp</code> and <code>X-ZKWA-Signature</code>. Reply with any 2xx status within 8 seconds.</p>
      </section>
    </div>
  )
}
