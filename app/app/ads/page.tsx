"use client"
import { useEffect, useState } from "react"

type AdAccount = { id: string; name?: string; account_status?: number; currency?: string; timezone_name?: string }
type Campaign = {
  id: string
  name: string
  status?: string
  effective_status?: string
  objective?: string
  campaignType: "CTWA" | "WEBSITE" | "OTHER"
  websiteUrls: string[]
  deliveryStatus: string
  metrics: { impressions: number; clicks: number; spend: string }
}
type LeadForm = { id: string; name: string; status?: string; leads_count?: number; pageId: string; pageName: string }
type MetaLead = { id: string; created_time?: string; campaign_id?: string; fields: Record<string,string> }
type AdsData = {
  adAccounts: AdAccount[]
  selectedAdAccountId: string
  campaigns: Campaign[]
  pixels: { id:string; name?:string }[]
  pages: { id:string; name:string }[]
  leadForms: LeadForm[]
  leadFormWarnings: string[]
  selectedFormId: string
  leads: MetaLead[]
}

const selectStyle: React.CSSProperties = {
  minHeight:40,padding:"8px 11px",border:"1px solid #cbd5d3",borderRadius:6,
  background:"#fff",fontSize:13,color:"#183633",maxWidth:"100%",
}
const panelStyle: React.CSSProperties = {
  background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden",
}

export default function MetaAdsPage() {
  const [data, setData] = useState<AdsData | null>(null)
  const [accountId, setAccountId] = useState("")
  const [formId, setFormId] = useState("")
  const [campaignFilter, setCampaignFilter] = useState<"ALL" | "CTWA" | "WEBSITE">("ALL")
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    const params = new URLSearchParams()
    if (accountId) params.set("adAccountId", accountId)
    if (formId) params.set("formId", formId)
    fetch(`/api/meta/ads?${params.toString()}`)
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not load Meta Ads data.")
        if (!active) return
        setData(body)
        if (!accountId && body.selectedAdAccountId) setAccountId(body.selectedAdAccountId)
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load Meta Ads data.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accountId, formId, refresh])

  async function importLeads() {
    if (!formId) return
    setImporting(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/meta/ads", {
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({formId}),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not import Lead Form contacts.")
      setNotice(`${body.imported} contact(s) imported; ${body.skipped} lead(s) without a phone number skipped. Imported contacts remain opted out of WhatsApp messaging.`)
      setRefresh(value => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not import Lead Form contacts.")
    } finally {
      setImporting(false)
    }
  }

  const campaigns = data?.campaigns.filter(campaign => campaignFilter === "ALL" || campaign.campaignType === campaignFilter) || []
  const ctwaCount = data?.campaigns.filter(campaign => campaign.campaignType === "CTWA").length || 0
  const websiteCount = data?.campaigns.filter(campaign => campaign.campaignType === "WEBSITE").length || 0
  const activeCount = data?.campaigns.filter(campaign => ["ACTIVE", "IN_PROCESS"].includes(campaign.deliveryStatus)).length || 0
  const connectRequired = /connect your meta/i.test(error)

  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:14,flexWrap:"wrap",marginBottom:20}}>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>Ads Manager</h1>
          <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>Your Facebook and Instagram ads: delivery, Click-to-WhatsApp and Lead Form activity</p>
        </div>
        <div style={{display:"flex",gap:9,alignItems:"center",flexWrap:"wrap"}}>
          <a href="/app/ads/create" style={{display:"inline-flex",alignItems:"center",minHeight:40,padding:"0 16px",borderRadius:8,
            background:"#25D366",color:"#053d36",fontSize:13,fontWeight:700,textDecoration:"none"}}>+ Create New Ad</a>
          <a href="/onboarding/meta-connect" style={{display:"inline-flex",alignItems:"center",minHeight:40,
            boxSizing:"border-box",border:"1px solid #cbd5d3",borderRadius:6,padding:"8px 11px",
            background:"#fff",color:"#24433e",fontSize:12,fontWeight:700,textDecoration:"none"}}>Reconnect Meta</a>
          {data?.adAccounts.length ? <select aria-label="Meta ad account" value={accountId || data.selectedAdAccountId}
            onChange={event => setAccountId(event.target.value)} style={selectStyle}>
            {data.adAccounts.map(account => <option key={account.id} value={account.id}>
              {account.name || account.id} · {account.currency || "-"}
            </option>)}
          </select> : null}
          <button onClick={() => setRefresh(value => value + 1)} disabled={loading}
            style={{minHeight:40,border:"1px solid #cbd5d3",borderRadius:6,padding:"8px 12px",
              background:"#fff",color:"#24433e",fontSize:12,fontWeight:700,cursor:"pointer"}}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div role="alert" style={{padding:12,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>
        {error} {connectRequired && <a href="/onboarding/meta-connect" style={{color:"#075e54",fontWeight:700}}>Connect Meta</a>}
      </div>}
      {notice && <div role="status" style={{padding:12,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13}}>{notice}</div>}

      {loading && !data ? <div style={{padding:28,color:"#647b77"}}>Loading Meta Ads…</div> : data && <>
        <section aria-label="Campaign summary" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,170px),1fr))",gap:11,marginBottom:18}}>
          {[
            {label:"Ad accounts",value:data.adAccounts.length,accent:"#2563eb"},
            {label:"Campaigns",value:data.campaigns.length,accent:"#0e8b71"},
            {label:"Active delivery",value:activeCount,accent:"#169b62"},
            {label:"Click-to-WhatsApp",value:ctwaCount,accent:"#16a36a"},
            {label:"Website campaigns",value:websiteCount,accent:"#d97706"},
            {label:"Lead Forms",value:data.leadForms.length,accent:"#7c3aed"},
          ].map(item => <article key={item.label} style={{background:"#fff",border:"1px solid #e2e8f0",
            borderTop:`2px solid ${item.accent}`,borderRadius:7,padding:15}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#647b77"}}>{item.label}</div>
            <div style={{fontFamily:"Sora,sans-serif",fontSize:24,fontWeight:800,color:"#183633",marginTop:8}}>{item.value.toLocaleString()}</div>
          </article>)}
        </section>

        <section style={{...panelStyle,marginBottom:16}}>
          <div style={{padding:"15px 18px",borderBottom:"1px solid #e8efee",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div>
              <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0,color:"#102a2a"}}>Campaigns</h2>
              <p style={{fontSize:11,color:"#71817e",margin:"4px 0 0"}}>Delivery status and last-7-day spend, clicks, and impressions</p>
            </div>
            <div role="group" aria-label="Campaign type" style={{display:"inline-flex",padding:3,background:"#edf3f1",borderRadius:6}}>
              {(["ALL","CTWA","WEBSITE"] as const).map(filter => <button key={filter} onClick={() => setCampaignFilter(filter)}
                style={{border:0,borderRadius:4,padding:"7px 10px",background:campaignFilter === filter ? "#fff" : "transparent",
                  color:campaignFilter === filter ? "#075e54" : "#647b77",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                {filter === "ALL" ? "All" : filter === "CTWA" ? "CTWA" : "Website"}
              </button>)}
            </div>
          </div>
          {campaigns.length ? <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:820,borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
            <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>
              {[["Campaign",230],["Type",105],["Delivery",120],["Impressions",110],["Clicks",85],["Spend",100],["Website",200]].map(([label,width]) =>
                <th key={label as string} style={{width:width as number,padding:"11px 12px",fontWeight:600}}>{label}</th>)}
            </tr></thead>
            <tbody>{campaigns.map(campaign => <tr key={campaign.id} style={{borderTop:"1px solid #edf1f0"}}>
              <td style={{padding:12}}><div style={{fontWeight:700,color:"#183633"}}>{campaign.name}</div>
                <div style={{fontSize:10,color:"#879491",marginTop:3}}>{campaign.objective || "Objective unavailable"}</div></td>
              <td style={{padding:12}}><span style={{padding:"4px 7px",borderRadius:4,background:campaign.campaignType === "CTWA" ? "#eaf8f1" : "#f1f5f9",
                color:campaign.campaignType === "CTWA" ? "#176b4b" : "#536663",fontSize:10,fontWeight:700}}>{campaign.campaignType}</span></td>
              <td style={{padding:12,color:["ACTIVE","IN_PROCESS"].includes(campaign.deliveryStatus) ? "#168253" : "#647b77"}}>{campaign.deliveryStatus}</td>
              <td style={{padding:12}}>{campaign.metrics.impressions.toLocaleString()}</td>
              <td style={{padding:12}}>{campaign.metrics.clicks.toLocaleString()}</td>
              <td style={{padding:12}}>{data.adAccounts.find(account => account.id === accountId)?.currency || ""} {Number(campaign.metrics.spend).toLocaleString("en-IN",{minimumFractionDigits:2})}</td>
              <td style={{padding:12}}>{campaign.websiteUrls[0]
                ? <a href={campaign.websiteUrls[0]} target="_blank" rel="noreferrer" style={{color:"#087763",textDecoration:"none",wordBreak:"break-word"}}>{campaign.websiteUrls[0]}</a>
                : <span style={{color:"#98a4a1"}}>—</span>}</td>
            </tr>)}</tbody>
          </table></div> : <div style={{padding:20,fontSize:12,color:"#71817e"}}>
            {data.adAccounts.length ? "No campaigns match this filter for the selected ad account." : "No Meta ad accounts are available to this login."}
          </div>}
        </section>

        <section style={{...panelStyle,marginBottom:16}}>
          <div style={{padding:"15px 18px",borderBottom:"1px solid #e8efee",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div>
              <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0,color:"#102a2a"}}>Lead Forms</h2>
              <p style={{fontSize:11,color:"#71817e",margin:"4px 0 0"}}>Select a form to review recent submissions</p>
            </div>
            <select aria-label="Lead Form" value={formId} onChange={event => setFormId(event.target.value)} style={selectStyle}>
              <option value="">Choose a Lead Form</option>
              {data.leadForms.map(form => <option key={form.id} value={form.id}>{form.name} · {form.pageName}</option>)}
            </select>
          </div>
          {data.leadFormWarnings.length > 0 && <div style={{padding:"10px 18px",fontSize:11,color:"#9a6700",background:"#fff8e6"}}>
            Some Pages could not be read. Confirm Meta Page and Lead Retrieval permissions.
          </div>}
          {formId ? <>
            <div style={{padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div style={{fontSize:11,color:"#71817e"}}>
                {data.leadForms.find(form => form.id === formId)?.status || "Status unavailable"} · {data.leadForms.find(form => form.id === formId)?.leads_count ?? 0} total leads
              </div>
              <button onClick={importLeads} disabled={importing || !data.leads.length}
                style={{border:0,borderRadius:5,padding:"8px 11px",background:"#075e54",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {importing ? "Importing…" : "Import visible leads to Contacts"}
              </button>
            </div>
            {data.leads.length ? <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:650,borderCollapse:"collapse",fontSize:11,textAlign:"left"}}>
              <thead style={{background:"#f7faf9",color:"#647b77"}}><tr><th style={{padding:10}}>Submitted</th><th style={{padding:10}}>Lead details</th><th style={{padding:10}}>Campaign</th></tr></thead>
              <tbody>{data.leads.map(lead => <tr key={lead.id} style={{borderTop:"1px solid #edf1f0"}}>
                <td style={{padding:10,whiteSpace:"nowrap"}}>{lead.created_time ? new Date(lead.created_time).toLocaleString() : "-"}</td>
                <td style={{padding:10}}>{Object.entries(lead.fields).slice(0,5).map(([key,value]) => <div key={key} style={{marginBottom:3}}>
                  <span style={{color:"#71817e"}}>{key.replace(/_/g," ")}: </span>{value || "-"}
                </div>)}</td>
                <td style={{padding:10}}>{lead.campaign_id || "-"}</td>
              </tr>)}</tbody></table></div> : <div style={{padding:18,fontSize:11,color:"#71817e"}}>No recent leads returned for this form.</div>}
          </> : <div style={{padding:18,fontSize:11,color:"#71817e"}}>No form selected.</div>}
        </section>

        <section style={{...panelStyle,padding:"14px 18px"}}>
          <h2 style={{fontFamily:"Sora,sans-serif",fontSize:14,margin:"0 0 8px",color:"#102a2a"}}>Website pixels</h2>
          {data.pixels.length ? <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{data.pixels.map(pixel =>
            <span key={pixel.id} style={{padding:"6px 9px",border:"1px solid #e0e9e8",borderRadius:5,fontSize:11,color:"#49615e"}}>
              {pixel.name || "Pixel"} · {pixel.id}
            </span>)}</div> : <div style={{fontSize:11,color:"#71817e"}}>No website pixels are available for this ad account.</div>}
        </section>
      </>}
    </div>
  )
}