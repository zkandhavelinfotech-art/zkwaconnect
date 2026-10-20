"use client"
import { useCallback, useEffect, useState } from "react"
import { VERTICALS, type Vertical } from "@/lib/meta/profile"

type Profile = { about?:string; address?:string; description?:string; email?:string; profile_picture_url?:string; websites?:string[]; vertical?:string }
type Phone = {
  id:string; phoneNumberId:string; phoneNumber:string; displayName:string|null; status:string; metaStatus:string|null; nameStatus:string|null
  qualityRating:string|null; messagingLimit:string|null; verificationStatus:string|null; profile:Profile|null
}
type Account = {
  id:string; wabaId:string; name:string; status:string; metaBusinessId:string|null; currency:string|null; timezone:string|null
  accountReviewStatus:string|null; businessVerificationStatus:string|null; webhookSubscribed:boolean|null; phones:Phone[]
}
type Data = {
  metaConnected:boolean; accounts:Account[]; warnings:string[]; canEdit:boolean
  webhook:{lastEventAt:string|null;lastEventType:string|null;events24h:number}
  plan:{name:string;status:string;monthlyPrice:string|number;maxMessages:number|null;maxPhoneNumbers:number|null;maxUsers:number|null
    trialEndsAt:string|null;currentPeriodEnd:string|null;messagesUsed:number}|null
}
type Form = { about:string; address:string; description:string; email:string; website1:string; website2:string; vertical:Vertical }

const card:React.CSSProperties = {background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:20,marginBottom:16}
const cardHead:React.CSSProperties = {fontFamily:"Sora,sans-serif",fontSize:15,fontWeight:700,color:"#0f172a",margin:"0 0 4px"}
const label:React.CSSProperties = {display:"block",fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}
const field:React.CSSProperties = {width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,
  color:"#0f172a",fontFamily:"inherit",background:"#fff"}
const TIERS:Record<string,string> = {TIER_50:"50 customers / day",TIER_250:"250 customers / day",TIER_1K:"1,000 customers / day",TIER_10K:"10,000 customers / day",
  TIER_100K:"100,000 customers / day",TIER_UNLIMITED:"Unlimited"}

function Badge({value,good=["GREEN","APPROVED","VERIFIED","CONNECTED","AVAILABLE"],bad=["RED","REJECTED","FLAGGED","DISCONNECTED","ERROR","BANNED"]}:{value:string|null;good?:string[];bad?:string[]}) {
  if(!value)return <span style={{color:"#94a3b8"}}>—</span>
  const upper = value.toUpperCase()
  const tone = good.includes(upper)?{bg:"#dcfce7",color:"#15803d"}:bad.includes(upper)?{bg:"#fee2e2",color:"#b91c1c"}:upper==="YELLOW"?{bg:"#fef9c3",color:"#a16207"}:{bg:"#f1f5f9",color:"#475569"}
  return <span style={{background:tone.bg,color:tone.color,borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:700}}>{value.replace(/_/g," ")}</span>
}

function toForm(profile:Profile|null):Form {
  const vertical = (profile?.vertical&&profile.vertical in VERTICALS?profile.vertical:"OTHER") as Vertical
  return {about:profile?.about||"",address:profile?.address||"",description:profile?.description||"",email:profile?.email||"",
    website1:profile?.websites?.[0]||"",website2:profile?.websites?.[1]||"",vertical}
}

export default function SettingsPage() {
  const [data,setData] = useState<Data|null>(null)
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState("")
  const [error,setError] = useState("")
  const [notice,setNotice] = useState("")
  const [phoneId,setPhoneId] = useState("")
  const [form,setForm] = useState<Form|null>(null)

  const load = useCallback(async()=>{
    setLoading(true);setError("")
    try{
      const response = await fetch("/api/settings/whatsapp")
      const body = await response.json()
      if(!response.ok)throw new Error(body.error||"Could not load settings.")
      setData(body)
      const phones = (body.accounts as Account[]).flatMap(account=>account.phones).filter(phone=>phone.profile)
      setPhoneId(current=>phones.some(phone=>phone.id===current)?current:phones[0]?.id||"")
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not load settings.")}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{load()},[load])

  const phones = data?.accounts.flatMap(account=>account.phones)||[]
  const editable = phones.filter(phone=>phone.profile)
  const selectedPhone = phones.find(phone=>phone.id===phoneId)
  useEffect(()=>{setForm(selectedPhone?toForm(selectedPhone.profile):null)},[selectedPhone?.id,data]) // eslint-disable-line react-hooks/exhaustive-deps

  async function post(payload:Record<string,unknown>,key:string){
    setBusy(key);setError("");setNotice("")
    try{
      const response = await fetch("/api/settings/whatsapp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
      const body = await response.json()
      if(!response.ok)throw new Error(body.error||"Could not save.")
      setNotice(body.message);await load()
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not save.")}
    finally{setBusy("")}
  }

  function saveProfile(event:React.FormEvent){
    event.preventDefault()
    if(!form||!selectedPhone)return
    post({action:"updateProfile",phoneId:selectedPhone.id,about:form.about,address:form.address,description:form.description,email:form.email,
      websites:[form.website1,form.website2].map(item=>item.trim()).filter(Boolean),vertical:form.vertical},"profile")
  }

  const set = (key:keyof Form)=>(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>setForm(current=>current&&{...current,[key]:event.target.value})
  const plan = data?.plan
  const usagePct = plan?.maxMessages?Math.min(100,Math.round(plan.messagesUsed/plan.maxMessages*100)):0
  const webhookAge = data?.webhook.lastEventAt?Math.round((Date.now()-new Date(data.webhook.lastEventAt).getTime())/3_600_000):null

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap",marginBottom:18}}>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>WhatsApp settings</h1>
          <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>Your business profile, numbers, account health and plan — read live from Meta.</p>
        </div>
        <button onClick={load} disabled={loading} style={{border:"1px solid #cbd5e1",borderRadius:8,background:"#fff",padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          {loading?"Syncing…":"↻ Sync from Meta"}</button>
      </div>

      {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:8,marginBottom:12,fontSize:13}}>{error}</div>}
      {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:8,marginBottom:12,fontSize:13}}>{notice}</div>}
      {data?.warnings.map(warning=><div key={warning} style={{padding:"9px 11px",background:"#fffbeb",border:"1px solid #fde68a",color:"#92400e",borderRadius:8,marginBottom:8,fontSize:12}}>⚠ {warning}</div>)}

      {!data&&loading?<div style={{fontSize:13,color:"#64748b"}}>Loading settings…</div>:data&&!data.accounts.length?
        <div style={{...card,textAlign:"center",padding:40}}>
          <div style={{fontSize:40}}>📱</div>
          <h2 style={{...cardHead,fontSize:18,margin:"8px 0"}}>Connect WhatsApp to manage settings</h2>
          <p style={{fontSize:13,color:"#64748b",maxWidth:420,margin:"0 auto 18px"}}>Connect your Meta business, choose a WhatsApp Business Account and register a number. It takes about 5 minutes.</p>
          <a href="/onboarding/meta-connect" style={{background:"#075e54",color:"#fff",textDecoration:"none",borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:700}}>Start WhatsApp setup →</a>
        </div>:data&&<div style={{display:"grid",gridTemplateColumns:"minmax(0,1.6fr) minmax(280px,1fr)",gap:16,alignItems:"start"}}>
        <div>
          {/* Business profile */}
          <section style={{...card,borderTop:"3px solid #075e54"}}>
            <h2 style={cardHead}>Business profile</h2>
            <p style={{fontSize:12,color:"#64748b",margin:"0 0 14px"}}>What customers see when they open your WhatsApp profile.</p>
            {!editable.length?<div style={{fontSize:13,color:"#64748b"}}>Register a phone number to edit its business profile.</div>:form&&selectedPhone&&
              <form onSubmit={saveProfile}>
                {editable.length>1&&<div style={{marginBottom:14}}><label style={label} htmlFor="profile-phone">Phone number</label>
                  <select id="profile-phone" value={phoneId} onChange={event=>setPhoneId(event.target.value)} style={field}>
                    {editable.map(phone=><option key={phone.id} value={phone.id}>{phone.phoneNumber} · {phone.displayName}</option>)}</select></div>}
                <div style={{display:"flex",gap:14,alignItems:"center",padding:12,background:"#f8fafc",borderRadius:10,marginBottom:14}}>
                  {selectedPhone.profile?.profile_picture_url?<img src={selectedPhone.profile.profile_picture_url} alt="" width={52} height={52} style={{borderRadius:"50%",objectFit:"cover"}}/>:
                    <span style={{width:52,height:52,borderRadius:"50%",background:"#075e54",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700}}>
                      {(selectedPhone.displayName||"W")[0]}</span>}
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>{selectedPhone.displayName||"Display name pending"} <Badge value={selectedPhone.nameStatus}/></div>
                    <div style={{fontSize:12,color:"#64748b"}}>{selectedPhone.phoneNumber} · {VERTICALS[form.vertical]}</div>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Display name and photo are changed in Meta WhatsApp Manager and need Meta approval.</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:12}}>
                  <div><label style={label} htmlFor="about">About <span style={{textTransform:"none",fontWeight:400}}>({form.about.length}/139)</span></label>
                    <input id="about" maxLength={139} value={form.about} onChange={set("about")} placeholder="Hey there! We reply within minutes." style={field} disabled={!data.canEdit}/></div>
                  <div><label style={label} htmlFor="vertical">Category</label>
                    <select id="vertical" value={form.vertical} onChange={set("vertical")} style={field} disabled={!data.canEdit}>
                      {Object.entries(VERTICALS).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></div>
                </div>
                <div style={{marginTop:12}}><label style={label} htmlFor="description">Description <span style={{textTransform:"none",fontWeight:400}}>({form.description.length}/512)</span></label>
                  <textarea id="description" rows={3} maxLength={512} value={form.description} onChange={set("description")} style={{...field,resize:"vertical"}} disabled={!data.canEdit}/></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:12,marginTop:12}}>
                  <div><label style={label} htmlFor="address">Address</label>
                    <input id="address" maxLength={256} value={form.address} onChange={set("address")} placeholder="12 Anna Salai, Chennai" style={field} disabled={!data.canEdit}/></div>
                  <div><label style={label} htmlFor="email">Business email</label>
                    <input id="email" type="email" maxLength={128} value={form.email} onChange={set("email")} placeholder="support@business.in" style={field} disabled={!data.canEdit}/></div>
                  <div><label style={label} htmlFor="website1">Website</label>
                    <input id="website1" type="url" value={form.website1} onChange={set("website1")} placeholder="https://business.in" style={field} disabled={!data.canEdit}/></div>
                  <div><label style={label} htmlFor="website2">Second website (optional)</label>
                    <input id="website2" type="url" value={form.website2} onChange={set("website2")} placeholder="https://shop.business.in" style={field} disabled={!data.canEdit}/></div>
                </div>
                {data.canEdit?<button type="submit" disabled={busy==="profile"} style={{marginTop:16,border:0,borderRadius:8,padding:"10px 18px",background:"#075e54",
                  color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>{busy==="profile"?"Saving…":"Save profile to WhatsApp"}</button>:
                  <div style={{marginTop:12,fontSize:12,color:"#64748b"}}>Only owners, admins and managers can edit the profile.</div>}
              </form>}
          </section>

          {/* Accounts and numbers */}
          {data.accounts.map(account=><section key={account.id} style={card}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:12}}>
              <div><h2 style={cardHead}>{account.name}</h2><div style={{fontSize:12,color:"#64748b"}}>WhatsApp Business Account</div></div>
              <Badge value={account.status}/>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:14}}><tbody>
              {[["WABA ID",<code key="w" style={{fontSize:12}}>{account.wabaId}</code>],
                ["Business portfolio ID",account.metaBusinessId?<code key="b" style={{fontSize:12}}>{account.metaBusinessId}</code>:"—"],
                ["Business verification",<Badge key="v" value={account.businessVerificationStatus}/>],
                ["Account review",<Badge key="r" value={account.accountReviewStatus}/>],
                ["Currency · Timezone",`${account.currency||"—"} · ${account.timezone||"—"}`],
              ].map(([name,value])=><tr key={name as string} style={{borderTop:"1px solid #f1f5f9"}}>
                <td style={{padding:"9px 0",width:200,fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em"}}>{name}</td><td style={{padding:"9px 0"}}>{value}</td></tr>)}
            </tbody></table>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:12,borderRadius:10,marginBottom:14,
              background:account.webhookSubscribed===false?"#fef2f2":"#f0fdf4",border:`1px solid ${account.webhookSubscribed===false?"#fecaca":"#bbf7d0"}`}}>
              <div style={{fontSize:12,color:account.webhookSubscribed===false?"#991b1b":"#166534"}}>
                <strong>Incoming messages:</strong> {account.webhookSubscribed===null?"could not check subscription":account.webhookSubscribed?
                  "this account is subscribed — customer messages reach your inbox and chatbots.":"not subscribed — customer messages will NOT reach ZKWAConnect."}
              </div>
              {account.webhookSubscribed===false&&data.canEdit&&<button onClick={()=>post({action:"subscribeWebhook",wabaId:account.id},`sub-${account.id}`)}
                disabled={busy===`sub-${account.id}`} style={{border:0,borderRadius:8,padding:"7px 12px",background:"#b91c1c",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {busy===`sub-${account.id}`?"Fixing…":"Fix now"}</button>}
            </div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:620,borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
              <thead style={{background:"#f8fafc",color:"#64748b"}}><tr>{["Number","Display name","Name review","Quality","Messaging limit","Status"].map(name=>
                <th key={name} style={{padding:"9px 10px",fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:".04em"}}>{name}</th>)}</tr></thead>
              <tbody>{account.phones.map(phone=><tr key={phone.id} style={{borderTop:"1px solid #f1f5f9"}}>
                <td style={{padding:10,fontFamily:"monospace"}}>{phone.phoneNumber}</td>
                <td style={{padding:10}}>{phone.displayName||"—"}</td>
                <td style={{padding:10}}><Badge value={phone.nameStatus}/></td>
                <td style={{padding:10}}><Badge value={phone.qualityRating}/></td>
                <td style={{padding:10}}>{phone.messagingLimit?TIERS[phone.messagingLimit]||phone.messagingLimit:"—"}</td>
                <td style={{padding:10}}><Badge value={phone.metaStatus||phone.status}/></td>
              </tr>)}
              {!account.phones.length&&<tr><td colSpan={6} style={{padding:12,color:"#64748b"}}>No registered numbers. <a href="/onboarding/phone-registration" style={{color:"#075e54",fontWeight:700}}>Register a number →</a></td></tr>}
              </tbody>
            </table></div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:10}}>Messaging limits rise automatically as you send to more customers with good quality. Keep quality GREEN by messaging only opted-in contacts.</div>
          </section>)}
        </div>

        <div>
          <section style={card}>
            <h2 style={cardHead}>Message delivery</h2>
            <p style={{fontSize:12,color:"#64748b",margin:"0 0 12px"}}>Events received from WhatsApp for this workspace.</p>
            <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:600,color:webhookAge!==null&&webhookAge<48?"#15803d":"#92400e"}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:webhookAge!==null&&webhookAge<48?"#25D366":"#f59e0b"}}/>
              {data.webhook.lastEventAt?`Last event ${webhookAge===0?"within the hour":`${webhookAge}h ago`}`:"No events received yet"}
            </div>
            <div style={{fontSize:12,color:"#64748b",marginTop:6}}>{data.webhook.events24h.toLocaleString()} event(s) in the last 24 hours</div>
            {!data.webhook.lastEventAt&&<div style={{fontSize:11,color:"#94a3b8",marginTop:8}}>Send a WhatsApp message to your business number to test. If nothing arrives, check the “Incoming messages” status on the left.</div>}
          </section>

          <section style={{...card,borderTop:"3px solid #075e54"}}>
            <h2 style={cardHead}>Plan &amp; usage</h2>
            {plan?<>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"8px 0 12px"}}>
                <div><div style={{fontSize:20,fontWeight:800,color:"#0f172a"}}>{plan.name}</div>
                  <div style={{fontSize:12,color:"#64748b"}}>₹{Number(plan.monthlyPrice).toLocaleString("en-IN")}/mo{plan.maxMessages?` · ${plan.maxMessages.toLocaleString()} messages`:""}</div></div>
                <Badge value={plan.status} good={["ACTIVE"]} bad={["PAST_DUE","SUSPENDED","EXPIRED","CANCELLED"]}/>
              </div>
              {plan.maxMessages?<>
                <div style={{height:6,background:"#e2e8f0",borderRadius:6,overflow:"hidden"}}>
                  <div style={{width:`${usagePct}%`,height:"100%",background:usagePct>90?"#dc2626":"#25D366"}}/></div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#64748b",margin:"6px 0 12px"}}>
                  <span>{plan.messagesUsed.toLocaleString()} / {plan.maxMessages.toLocaleString()} messages sent</span><span>{usagePct}%</span></div>
              </>:<div style={{fontSize:12,color:"#64748b",marginBottom:12}}>{plan.messagesUsed.toLocaleString()} messages sent this period</div>}
              {plan.status==="TRIAL"&&plan.trialEndsAt&&<div style={{fontSize:12,color:"#92400e",marginBottom:12}}>Trial ends {new Date(plan.trialEndsAt).toLocaleDateString()}</div>}
              <a href="/app/billing" style={{display:"inline-block",background:"#075e54",color:"#fff",textDecoration:"none",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:700}}>Manage billing</a>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:10}}>GST invoices are generated for every payment. Meta&apos;s per-message charges are billed separately.</div>
            </>:<div style={{fontSize:13,color:"#64748b"}}>No plan yet. <a href="/app/billing" style={{color:"#075e54",fontWeight:700}}>Choose a plan →</a></div>}
          </section>

          <section style={card}>
            <h2 style={cardHead}>Connection</h2>
            <div style={{fontSize:13,color:data.metaConnected?"#15803d":"#b91c1c",margin:"8px 0 12px",fontWeight:600}}>
              {data.metaConnected?"✓ Meta business connected":"✗ Meta not connected"}</div>
            <div style={{display:"grid",gap:8}}>
              {data.metaConnected&&<a href="/onboarding/waba-setup" style={{fontSize:12,color:"#075e54",fontWeight:700,textDecoration:"none"}}>Switch WhatsApp Business Account →</a>}
              <a href="/onboarding/meta-connect" style={{fontSize:12,color:"#075e54",fontWeight:700,textDecoration:"none"}}>{data.metaConnected?"Reconnect Facebook →":"Connect Meta →"}</a>
            </div>
          </section>
        </div>
      </div>}
    </div>
  )
}
