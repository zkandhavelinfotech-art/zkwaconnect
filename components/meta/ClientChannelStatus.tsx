"use client"
import { useCallback, useEffect, useState } from "react"
import { MetaAccessCenter } from "@/components/meta/MetaAccessCenter"

type Account = { organization?:{name:string}; connection?:{tokenValid:boolean}|null; activeWaba?:{name:string;phones:{display:string;status:string;quality:string|null}[]}|null; warnings?:string[] }
type Page = {id:string;name:string;category?:string;verification_status?:string}
type Profiles = { businessPortfolio?:{name:string}; ownedPages?:Page[]; clientPages?:Page[]; error?:string }
type Instagram = { accounts?:{id:string;username:string;pageName:string;status:string}[]; error?:string }

const card:React.CSSProperties={background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:18}
function Dot({ok}:{ok:boolean}){return <span style={{width:9,height:9,borderRadius:"50%",background:ok?"#22c55e":"#f59e0b",boxShadow:`0 0 0 4px ${ok?"#dcfce7":"#fef3c7"}`}}/>}

export function ClientChannelStatus({showAccess=true}:{showAccess?:boolean}){
  const [data,setData]=useState<{account:Account;profiles:Profiles;instagram:Instagram}|null>(null)
  const [loading,setLoading]=useState(true);const [error,setError]=useState("")
  const load=useCallback(async()=>{setLoading(true);setError("");try{
    const [a,p,i]=await Promise.all([fetch("/api/meta/account",{cache:"no-store"}),fetch("/api/meta/profiles",{cache:"no-store"}),fetch("/api/instagram",{cache:"no-store"})])
    const [account,profiles,instagram]=await Promise.all([a.json(),p.json(),i.json()])
    if(!a.ok&&a.status!==409)throw new Error(account.error||"Could not load channel status.")
    setData({account,profiles,instagram})
  }catch(reason){setError(reason instanceof Error?reason.message:"Could not load channel status.")}finally{setLoading(false)}},[])
  useEffect(()=>{load()},[load])
  if(!data)return <div style={card}>{error||"Loading channel status…"}</div>
  const whatsapp=Boolean(data.account.connection?.tokenValid&&data.account.activeWaba?.phones.some(phone=>phone.status==="CONNECTED"))
  const pages=[...(data.profiles.ownedPages||[]),...(data.profiles.clientPages||[])]
  const instagram=data.instagram.accounts||[]
  return <div style={{display:"grid",gap:18}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}><div><h1 style={{fontFamily:"Sora,sans-serif",fontSize:23,color:"#0f172a",margin:0}}>Connected channels</h1><p style={{fontSize:13,color:"#64748b",margin:"5px 0 0"}}>Live connection status for {data.account.organization?.name||"your workspace"}. Setup and credential changes are managed by your SaaS administrator.</p></div><button onClick={load} disabled={loading} style={{border:"1px solid #cbd5e1",background:"#fff",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:800,cursor:"pointer"}}>{loading?"Checking…":"Refresh status"}</button></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))",gap:12}}>
      <section style={{...card,borderTop:`3px solid ${whatsapp?"#25D366":"#f59e0b"}`}}><div style={{display:"flex",alignItems:"center",gap:10}}><Dot ok={whatsapp}/><h2 style={{fontSize:15,margin:0,color:"#0f172a"}}>WhatsApp</h2><strong style={{marginLeft:"auto",fontSize:11,color:whatsapp?"#15803d":"#b45309"}}>{whatsapp?"CONNECTED":"NEEDS ATTENTION"}</strong></div><p style={{fontSize:12,color:"#64748b",lineHeight:1.5}}>{data.account.activeWaba?`${data.account.activeWaba.name} · ${data.account.activeWaba.phones.length} number(s) assigned`:`No WhatsApp account is assigned to this workspace.`}</p>{data.account.activeWaba?.phones.map(phone=><div key={phone.display} style={{fontSize:11,padding:"7px 0",borderTop:"1px solid #f1f5f9"}}><strong>{phone.display}</strong> · {phone.status} · quality {phone.quality||"unknown"}</div>)}{!whatsapp&&<div style={{fontSize:11,color:"#92400e",background:"#fffbeb",padding:8,borderRadius:7}}>Solution: ask your SaaS administrator to finish WABA/phone assignment and permission verification.</div>}</section>
      <section style={{...card,borderTop:`3px solid ${pages.length?"#1877F2":"#f59e0b"}`}}><div style={{display:"flex",alignItems:"center",gap:10}}><Dot ok={pages.length>0}/><h2 style={{fontSize:15,margin:0,color:"#0f172a"}}>Facebook Pages</h2><strong style={{marginLeft:"auto",fontSize:11,color:pages.length?"#1d4ed8":"#b45309"}}>{pages.length?`${pages.length} CONNECTED`:"NOT ASSIGNED"}</strong></div>{pages.map(page=><div key={page.id} style={{padding:"9px 0",borderTop:"1px solid #f1f5f9",fontSize:12}}><strong>{page.name}</strong><div style={{color:"#64748b",fontSize:11}}>{page.category||"Facebook Page"} · {page.verification_status||"status available in Meta"}</div></div>)}{!pages.length&&<p style={{fontSize:11,color:"#92400e",background:"#fffbeb",padding:8,borderRadius:7}}>Solution: the portfolio owner must add the Page and assign it to the platform app/user. Contact your SaaS administrator.</p>}{data.profiles.error&&<p style={{fontSize:11,color:"#b91c1c"}}>{data.profiles.error}</p>}</section>
      <section style={{...card,borderTop:`3px solid ${instagram.length?"#c026d3":"#f59e0b"}`}}><div style={{display:"flex",alignItems:"center",gap:10}}><Dot ok={instagram.length>0}/><h2 style={{fontSize:15,margin:0,color:"#0f172a"}}>Instagram</h2><strong style={{marginLeft:"auto",fontSize:11,color:instagram.length?"#a21caf":"#b45309"}}>{instagram.length?"CONNECTED":"NOT CONNECTED"}</strong></div>{instagram.map(account=><div key={account.id} style={{padding:"9px 0",borderTop:"1px solid #f1f5f9",fontSize:12}}><strong>@{account.username}</strong><div style={{color:"#64748b",fontSize:11}}>{account.pageName} · {account.status}</div></div>)}{!instagram.length&&<p style={{fontSize:11,color:"#92400e",background:"#fffbeb",padding:8,borderRadius:7}}>Solution: connect an Instagram professional account to a Facebook Page, then ask your SaaS administrator to assign it.</p>}{data.instagram.error&&<p style={{fontSize:11,color:"#b91c1c"}}>{data.instagram.error}</p>}</section>
    </div>
    {showAccess&&<MetaAccessCenter compact/>}
  </div>
}
