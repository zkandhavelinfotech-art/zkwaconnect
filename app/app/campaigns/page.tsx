"use client"
import { useEffect, useState } from "react"

type Phone = { id:string; phoneNumber:string; displayName:string|null; wabaId:string }
type Template = { id:string; name:string; language:string; status:string; content:string|null }
type Campaign = {
  id:string; name:string; status:string; audienceType:string; totalCount:number; sentCount:number;
  deliveredCount:number; readCount:number; failedCount:number; createdAt:string;
  phoneNumber:{displayName:string|null;phoneNumber:string}; template:{name:string;language:string;status:string;content:string|null}|null
}
const inputStyle: React.CSSProperties = {width:"100%",boxSizing:"border-box",minHeight:40,padding:"8px 10px",
  border:"1px solid #cbd5d3",borderRadius:6,fontSize:13,color:"#183633",background:"#fff"}

export default function CampaignsPage() {
  const [campaigns,setCampaigns]=useState<Campaign[]>([])
  const [phones,setPhones]=useState<Phone[]>([])
  const [templates,setTemplates]=useState<Template[]>([])
  const [name,setName]=useState("")
  const [phoneNumberId,setPhoneNumberId]=useState("")
  const [templateId,setTemplateId]=useState("")
  const [templateParameters,setTemplateParameters]=useState<Record<string,string>>({})
  const [audienceType,setAudienceType]=useState<"ALL"|"TAGS">("ALL")
  const [labels,setLabels]=useState<string[]>([])
  const [audienceTags,setAudienceTags]=useState<{tag:string;count:number}[]>([])
  const [estimate,setEstimate]=useState<number|null>(null)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [launchingId,setLaunchingId]=useState("")
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [refresh,setRefresh]=useState(0)

  useEffect(()=>{
    let active=true
    setLoading(true)
    fetch("/api/campaigns")
      .then(async response=>{
        const body=await response.json()
        if(!response.ok) throw new Error(body.error||"Could not load campaigns.")
        if(active){setCampaigns(body.campaigns||[]);setPhones(body.phoneNumbers||[]);setTemplates(body.templates||[]);setAudienceTags(body.audienceTags||[])}
      })
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Could not load campaigns.")})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[refresh])

  useEffect(()=>{
    let active=true
    setEstimate(null)
    const query=new URLSearchParams({estimate:"1",labels:audienceType==="TAGS"?labels.join(","):""})
    if(audienceType==="TAGS"&&!labels.length){setEstimate(0);return}
    fetch(`/api/campaigns?${query.toString()}`).then(response=>response.json()).then(body=>{if(active&&typeof body.count==="number")setEstimate(body.count)}).catch(()=>{})
    return ()=>{active=false}
  },[audienceType,labels,refresh])

  const selectedTemplate=templates.find(template=>template.id===templateId)
  const templateVariables=[...new Set([...(selectedTemplate?.content||"").matchAll(/\{\{(\d+)\}\}/g)].map(match=>match[1]))]
    .sort((a,b)=>Number(a)-Number(b))

  async function createCampaign(event:React.FormEvent){
    event.preventDefault();setSaving(true);setError("");setNotice("")
    try{
      const response=await fetch("/api/campaigns",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name,phoneNumberId,templateId,audienceType,
          audienceLabels:audienceType==="TAGS"?labels:[],templateParameters})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error||"Could not save campaign draft.")
      setNotice(`Draft saved for ${body.campaign.totalCount} opted-in contact(s). Click Launch in the list below to send.`)
      setName("");setLabels([]);setTemplateParameters({});setRefresh(value=>value+1)
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not save campaign draft.")}
    finally{setSaving(false)}
  }

  async function launchCampaign(id:string){
    if(!window.confirm("Send this approved template to the campaign's opted-in audience?"))return
    setLaunchingId(id);setError("");setNotice("")
    try{
      const response=await fetch("/api/campaigns",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action:"launch"})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||"Campaign could not be launched.")
      setNotice(data.message);setRefresh(value=>value+1)
    }catch(reason){setError(reason instanceof Error?reason.message:"Campaign could not be launched.")}
    finally{setLaunchingId("")}
  }

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>Campaigns</h1>
        <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>Send approved WhatsApp templates to opted-in contacts. Target everyone or pick contact tags.</p>
      </div>

      {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
      {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13}}>{notice}</div>}

      <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:20,marginBottom:18}}>
        <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:"0 0 14px",color:"#183633"}}>New campaign</h2>
        {!phones.length||!templates.some(template=>template.status==="APPROVED") ? <div style={{fontSize:13,color:"#647b77"}}>
          Connect a WhatsApp number and sync an approved template before creating a campaign. <a href="/app/templates" style={{color:"#087763",fontWeight:700}}>Open templates</a>
        </div> : <form onSubmit={createCampaign}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:12}}>
            <label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Campaign name</span>
              <input required minLength={2} maxLength={100} value={name} onChange={event=>setName(event.target.value)} style={inputStyle}/></label>
            <label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>WhatsApp number</span>
              <select required value={phoneNumberId} onChange={event=>setPhoneNumberId(event.target.value)} style={inputStyle}>
                <option value="">Select a connected number</option>{phones.map(phone=><option key={phone.id} value={phone.id}>{phone.displayName||phone.phoneNumber} · {phone.phoneNumber}</option>)}
              </select></label>
            <label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Approved template</span>
              <select required value={templateId} onChange={event=>{setTemplateId(event.target.value);setTemplateParameters({})}} style={inputStyle}>
                <option value="">Select template</option>{templates.filter(template=>template.status==="APPROVED").map(template=><option key={template.id} value={template.id}>{template.name} · {template.language}</option>)}
              </select></label>
            <label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Audience</span>
              <select value={audienceType} onChange={event=>setAudienceType(event.target.value as "ALL"|"TAGS")} style={inputStyle}>
                <option value="ALL">All opted-in contacts</option><option value="TAGS">Contacts with selected tags</option>
              </select></label>
          </div>
          {audienceType==="TAGS"&&<div style={{marginTop:12}}>
            <span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Send to contacts with any of these tags</span>
            {audienceTags.length?<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{audienceTags.map(item=>{
              const on=labels.includes(item.tag)
              return <button type="button" key={item.tag} onClick={()=>setLabels(current=>on?current.filter(label=>label!==item.tag):[...current,item.tag])}
                style={{border:`1px solid ${on?"#075e54":"#d7e2df"}`,background:on?"#075e54":"#fff",color:on?"#fff":"#365b57",borderRadius:14,
                  padding:"5px 11px",fontSize:11,cursor:"pointer"}}>{on?"✓ ":""}{item.tag} · {item.count}</button>})}</div>:
              <div style={{fontSize:12,color:"#8a5b00"}}>No opted-in contacts have tags yet. Tag contacts on the <a href="/app/contacts" style={{color:"#087763",fontWeight:700}}>Contacts</a> page or with a Tag step in a flow.</div>}
          </div>}
          <div style={{marginTop:12,fontSize:12,color:estimate===0?"#a83226":"#365b57"}}>
            Audience: <strong>{estimate===null?"calculating…":`${estimate.toLocaleString()} opted-in contact(s)`}</strong>
            {estimate!==null&&estimate>500&&<span style={{color:"#a86b06"}}> · launches are limited to 500 recipients, so narrow the audience with tags</span>}
          </div>
          {templateVariables.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:10,marginTop:12}}>
            {templateVariables.map(number=><label key={number}><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Template variable {`{{${number}}}`}</span>
              <input required value={templateParameters[number]||""} onChange={event=>setTemplateParameters(current=>({...current,[number]:event.target.value}))} style={inputStyle}/></label>)}
          </div>}
          <button type="submit" disabled={saving||(audienceType==="TAGS"&&!labels.length)} style={{marginTop:14,border:0,borderRadius:6,padding:"10px 14px",
            background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>{saving?"Saving…":"Save draft"}</button>
        </form>}
      </section>

      <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid #e8efee"}}><h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0,color:"#183633"}}>Campaign history</h2></div>
        {loading?<div style={{padding:20,fontSize:12,color:"#647b77"}}>Loading campaigns…</div>:campaigns.length?
          <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:720,borderCollapse:"collapse",textAlign:"left",fontSize:12}}>
            <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>{["Campaign","Template","Audience","Status","Sent","Delivered","Read","Action"].map(label=><th key={label} style={{padding:11,fontWeight:600}}>{label}</th>)}</tr></thead>
            <tbody>{campaigns.map(campaign=><tr key={campaign.id} style={{borderTop:"1px solid #edf1f0"}}>
              <td style={{padding:11,fontWeight:700,color:"#183633"}}>{campaign.name}<div style={{fontSize:10,color:"#71817e",marginTop:3}}>{campaign.phoneNumber.phoneNumber}</div></td>
              <td style={{padding:11}}>{campaign.template?.name||"-"}<div style={{fontSize:10,color:"#71817e",marginTop:3}}>{campaign.template?.status||""}</div></td>
              <td style={{padding:11}}>{campaign.audienceType} · {campaign.totalCount}</td>
              <td style={{padding:11}}>{campaign.status}</td><td style={{padding:11}}>{campaign.sentCount}</td>
              <td style={{padding:11}}>{campaign.deliveredCount}</td><td style={{padding:11}}>{campaign.readCount}</td>
              <td style={{padding:11}}>{campaign.status==="DRAFT"&&<button disabled={Boolean(launchingId)} onClick={()=>launchCampaign(campaign.id)}
                style={{border:0,borderRadius:4,padding:"7px 9px",background:"#075e54",color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                {launchingId===campaign.id?"Sending…":"Launch"}</button>}</td>
            </tr>)}</tbody>
          </table></div>:<div style={{padding:22,fontSize:12,color:"#71817e"}}>No campaign drafts yet.</div>}
          </section>
    </div>
  )
}
