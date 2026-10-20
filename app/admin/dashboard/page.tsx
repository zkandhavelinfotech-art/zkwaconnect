"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type DashboardData = {
  stats: {
    totalOrgs: number
    activeOrgs: number
    trialOrgs: number
    pendingPayments: number
    totalMessages: number
  }
  recentWebhooks: {
    id: string
    eventType: string
    status: string
    createdAt: string
    wabaId: string | null
  }[]
  health: { db: string; api: string; timestamp: string }
}

type AdminPlan = { id: string; name: string; monthlyPrice: number | string }
type AdminTenant = {
  id: string
  name: string
  slug: string
  status: string
  memberships: { user: { name: string; email: string } }[]
  subscriptions: { id: string; status: string; plan: AdminPlan }[]
  billingExempt?: boolean
  onboarding: { currentStep: string } | null
  wabas: { id: string; wabaId: string; name: string; status: string; phoneNumbers: { phoneNumber: string; status: string; qualityRating: string | null }[] }[]
}
type AdminPayment = {
  id: string
  amount: number | string
  method: string
  transactionId: string | null
  createdAt: string
  submittedAt?: string | null
  organization: { name: string; slug: string; legalName: string | null; gstin: string | null }
  invoice: { invoiceNumber: string; status: string; total: number | string } | null
  subscription: { billingInterval: string; plan: { name: string; slug: string } } | null
}
type AdminWaba = {
  id: string
  wabaId: string
  name: string
  status: string
  qualityRating: string | null
  verificationStatus: string | null
  organization: {
    name: string
    slug: string
    status: string
    onboarding: { currentStep: string; phoneVerified: boolean } | null
    metaConnections: { status: string; tokenExpiresAt: string | null; lastSyncedAt: string | null }[]
  }
  phoneNumbers: { phoneNumber: string; status: string; verificationStatus: string | null; qualityRating: string | null }[]
}
type AdminTab = "overview" | "tenants" | "payments" | "wabas"

export default function AdminDashboard() {
  const router = useRouter()
  const [data, setData]     = useState<DashboardData | null>(null)
  const [loading,setLoading]= useState(true)
  const [error, setError]   = useState("")
  const [refresh, setRefresh] = useState(0)
  const [tab, setTab] = useState<AdminTab>("overview")
  const [tenants, setTenants] = useState<AdminTenant[]>([])
  const [plans, setPlans] = useState<AdminPlan[]>([])
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [wabas, setWabas] = useState<AdminWaba[]>([])
  const [query, setQuery] = useState("")
  const [sectionLoading, setSectionLoading] = useState(false)
  const [sectionError, setSectionError] = useState("")
  const [notice, setNotice] = useState("")
  const [tenantPlanIds, setTenantPlanIds] = useState<Record<string,string>>({})
  const [workingId, setWorkingId] = useState("")

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")

    fetch("/api/admin/health")
      .then(async response => {
        if (response.status === 401 || response.status === 403) {
          router.push("/admin/login")
          return null
        }
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not load dashboard data")
        return body as DashboardData
      })
      .then(result => { if (active && result) setData(result) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load dashboard data") })
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false }
  }, [refresh, router])

  useEffect(() => {
    if (tab === "overview") return
    let active = true
    setSectionLoading(true)
    setSectionError("")
    setNotice("")
    const endpoint = tab === "tenants"
      ? `/api/admin/customers?q=${encodeURIComponent(query)}`
      : tab === "payments" ? "/api/admin/payments?status=PENDING" : "/api/admin/wabas"

    fetch(endpoint)
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not load admin data.")
        if (!active) return
        if (tab === "tenants") {
          setTenants(body.organizations || [])
          setPlans(body.plans || [])
          setTenantPlanIds(current => {
            const next = { ...current }
            for (const tenant of body.organizations || [])
              if (!next[tenant.id]) next[tenant.id] = tenant.subscriptions?.[0]?.plan?.id || ""
            return next
          })
        } else if (tab === "payments") setPayments(body.payments || [])
        else setWabas(body.wabas || [])
      })
      .catch(reason => { if (active) setSectionError(reason instanceof Error ? reason.message : "Could not load admin data.") })
      .finally(() => { if (active) setSectionLoading(false) })

    return () => { active = false }
  }, [tab, query, refresh])

  async function updateTenant(id: string, action: string, extra: Record<string, unknown> = {}) {
    setWorkingId(id)
    setSectionError("")
    setNotice("")
    try {
      const response = await fetch("/api/admin/customers", {
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action,...extra}),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Tenant update failed.")
      setNotice(action === "assign-plan" ? `Plan invoice ${body.invoice.invoiceNumber} created for tenant.` : "Tenant updated.")
      setRefresh(value => value + 1)
    } catch (reason) {
      setSectionError(reason instanceof Error ? reason.message : "Tenant update failed.")
    } finally {
      setWorkingId("")
    }
  }

  async function reviewPayment(id: string, action: "approve" | "reject") {
    const reason = action === "reject" ? window.prompt("Reason for rejecting this payment:") : undefined
    if (action === "reject" && reason === null) return
    setWorkingId(id)
    setSectionError("")
    setNotice("")
    try {
      const response = await fetch("/api/admin/payments", {
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id,action,reason}),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Payment review failed.")
      setNotice(action === "approve" ? "Payment approved and invoice settled." : "Payment rejected.")
      setRefresh(value => value + 1)
    } catch (reason) {
      setSectionError(reason instanceof Error ? reason.message : "Payment review failed.")
    } finally {
      setWorkingId("")
    }
  }

  if (loading && !data) return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",
      alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,.5)"}}>
      Loading admin panel…
    </div>
  )

  if (error && !data) return (
    <main style={{minHeight:"100vh",background:"#0f172a",display:"grid",placeItems:"center",
      padding:24,color:"#fff",fontFamily:"DM Sans,sans-serif"}}>
      <section style={{maxWidth:440,border:"1px solid rgba(255,255,255,.12)",borderRadius:12,
        padding:24,background:"#1e293b"}}>
        <h1 style={{fontFamily:"Sora,sans-serif",fontSize:20,margin:"0 0 8px"}}>Dashboard unavailable</h1>
        <p style={{fontSize:14,color:"rgba(255,255,255,.6)",margin:"0 0 18px"}}>{error}</p>
        <button onClick={() => setRefresh(value => value + 1)} style={{background:"#fff",color:"#0f172a",
          border:0,borderRadius:6,padding:"9px 14px",fontWeight:700,cursor:"pointer"}}>Retry</button>
      </section>
    </main>
  )

  const stats = data?.stats
  const statItems = [
    { label:"Total Customers", value:stats?.totalOrgs ?? 0, detail:"Organizations", accent:"#60a5fa" },
    { label:"Active Organizations", value:stats?.activeOrgs ?? 0, detail:"Currently active", accent:"#34d399" },
    { label:"Trial Organizations", value:stats?.trialOrgs ?? 0, detail:"In trial period", accent:"#fbbf24" },
    { label:"Pending Payments", value:stats?.pendingPayments ?? 0, detail:"Awaiting review", accent:"#fb7185" },
    { label:"Messages Processed", value:stats?.totalMessages ?? 0, detail:"All-time total", accent:"#c4b5fd" },
  ]

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",color:"#fff",
      fontFamily:"DM Sans,sans-serif"}}>
      <div style={{background:"#1e293b",borderBottom:"1px solid rgba(255,255,255,.08)",
        padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontFamily:"Sora,sans-serif",fontSize:18,fontWeight:700}}>
          ZKWAConnect Admin
          <span style={{marginLeft:12,background:"rgba(220,38,38,.15)",
            border:"1px solid rgba(220,38,38,.3)",color:"#fca5a5",
            borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>SUPER ADMIN</span>
        </div>
        <div style={{display:"flex",gap:10}}>
          <a href="/admin/meta-setup" style={{background:"rgba(37,211,102,.15)",border:"1px solid rgba(37,211,102,.35)",
            color:"#86efac",borderRadius:6,padding:"7px 12px",fontSize:12,fontWeight:700,textDecoration:"none"}}>
            Meta app setup
          </a>
          <a href="/admin/messaging" style={{background:"rgba(37,211,102,.15)",border:"1px solid rgba(37,211,102,.35)",
            color:"#86efac",borderRadius:6,padding:"7px 12px",fontSize:12,fontWeight:700,textDecoration:"none"}}>
            Messaging charges
          </a>
          <a href="/admin/plans" style={{background:"rgba(37,211,102,.15)",border:"1px solid rgba(37,211,102,.35)",
            color:"#86efac",borderRadius:6,padding:"7px 12px",fontSize:12,fontWeight:700,textDecoration:"none"}}>
            Plans &amp; features
          </a>
          <button onClick={() => setRefresh(value => value + 1)} disabled={loading}
            style={{background:"transparent",border:"1px solid rgba(255,255,255,.15)",
              color:"#fff",borderRadius:6,padding:"7px 12px",fontSize:12,cursor:"pointer"}}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});router.push("/admin/login")}}
            style={{background:"transparent",border:"1px solid rgba(255,255,255,.15)",
              color:"rgba(255,255,255,.7)",borderRadius:6,padding:"7px 12px",
              fontSize:12,cursor:"pointer"}}>Sign out</button>
        </div>
      </div>
      <nav aria-label="Admin sections" style={{display:"flex",gap:4,padding:"8px 32px",
        background:"#172235",borderBottom:"1px solid rgba(255,255,255,.08)",overflowX:"auto"}}>
        {([
          ["overview","Overview"],["tenants","Tenants"],["payments","Payments"],["wabas","WABA health"],
        ] as [AdminTab,string][]).map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}
            style={{whiteSpace:"nowrap",border:0,borderRadius:5,padding:"9px 13px",fontSize:12,fontWeight:700,
              cursor:"pointer",background:tab === key ? "#0e8b71" : "transparent",
              color:tab === key ? "#fff" : "rgba(255,255,255,.58)"}}>{label}</button>
        ))}
      </nav>
      <main style={{maxWidth:1440,margin:"0 auto",padding:"32px clamp(18px,4vw,48px)"}}>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:16,
          flexWrap:"wrap",marginBottom:24}}>
          <div>
            <h1 style={{fontFamily:"Sora,sans-serif",fontSize:24,margin:0}}>
              {tab === "overview" ? "Operations overview" : tab === "tenants" ? "Tenant management" : tab === "payments" ? "Payment review" : "WABA health"}
            </h1>
            <p style={{fontSize:13,color:"rgba(255,255,255,.48)",margin:"6px 0 0"}}>
              {tab === "overview" ? "Customer, payment, messaging, and platform activity" :
                tab === "tenants" ? "Customer accounts, onboarding, and subscription plans" :
                tab === "payments" ? "Review customer UPI references and settle invoices" :
                "WhatsApp accounts, phone registration, and connection state"}
            </p>
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.45)"}}>
            Updated {data?.health?.timestamp ? new Date(data.health.timestamp).toLocaleTimeString() : "just now"}
          </div>
        </div>

        {tab === "overview" && error && <div role="status" style={{marginBottom:18,padding:"10px 14px",borderRadius:6,
          background:"rgba(251,113,133,.1)",color:"#fda4af",fontSize:13}}>
          Refresh failed: {error}. Showing the last loaded data.
        </div>}
        {sectionError && <div role="alert" style={{marginBottom:14,padding:"10px 14px",borderRadius:6,
          background:"rgba(251,113,133,.1)",color:"#fda4af",fontSize:13}}>{sectionError}</div>}
        {notice && <div role="status" style={{marginBottom:14,padding:"10px 14px",borderRadius:6,
          background:"rgba(52,211,153,.1)",color:"#6ee7b7",fontSize:13}}>{notice}</div>}

        {tab === "overview" ? <>

        <section aria-label="Key metrics" style={{display:"grid",
          gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,190px),1fr))",gap:12,marginBottom:24}}>
          {statItems.map(item => (
            <article key={item.label} style={{background:"#172235",border:"1px solid rgba(255,255,255,.08)",
              borderTop:`2px solid ${item.accent}`,borderRadius:8,padding:18,minHeight:112}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,.52)",textTransform:"uppercase",fontWeight:700}}>
                {item.label}
              </div>
              <div style={{fontFamily:"Sora,sans-serif",fontSize:28,fontWeight:700,marginTop:12}}>
                {item.value.toLocaleString()}
              </div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:3}}>{item.detail}</div>
            </article>
          ))}
        </section>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,320px),1fr))",gap:16,
          alignItems:"start"}}>
          <section style={{background:"#172235",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,
            overflow:"hidden"}}>
            <div style={{padding:"16px 18px",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
              <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0}}>Recent webhook activity</h2>
              <p style={{fontSize:12,color:"rgba(255,255,255,.42)",margin:"4px 0 0"}}>
                Latest events received by the platform
              </p>
            </div>
            {data?.recentWebhooks?.length ? (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:12}}>
                  <thead style={{color:"rgba(255,255,255,.42)"}}>
                    <tr>
                      <th style={{padding:"11px 18px",fontWeight:600}}>Event</th>
                      <th style={{padding:"11px 18px",fontWeight:600}}>Status</th>
                      <th style={{padding:"11px 18px",fontWeight:600}}>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentWebhooks.map(event => (
                      <tr key={event.id} style={{borderTop:"1px solid rgba(255,255,255,.06)"}}>
                        <td style={{padding:"13px 18px",whiteSpace:"nowrap"}}>
                          <div style={{fontWeight:600}}>{event.eventType}</div>
                          <div style={{color:"rgba(255,255,255,.38)",marginTop:3}}>
                            {event.wabaId || "WABA not specified"}
                          </div>
                        </td>
                        <td style={{padding:"13px 18px"}}>
                          <span style={{color:event.status === "PROCESSED" ? "#6ee7b7" : "#fcd34d"}}>
                            {event.status}
                          </span>
                        </td>
                        <td style={{padding:"13px 18px",whiteSpace:"nowrap",color:"rgba(255,255,255,.58)"}}>
                          {new Date(event.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{padding:24,fontSize:13,color:"rgba(255,255,255,.45)"}}>
                No webhook activity recorded yet.
              </div>
            )}
          </section>

          <section style={{background:"#172235",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,
            padding:18}}>
            <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:"0 0 16px"}}>Platform health</h2>
            {[{label:"API",value:data?.health?.api},{label:"Database",value:data?.health?.db}].map(service => (
              <div key={service.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"12px 0",borderTop:"1px solid rgba(255,255,255,.07)"}}>
                <span style={{fontSize:13,color:"rgba(255,255,255,.7)"}}>{service.label}</span>
                <span style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:12,color:"#6ee7b7"}}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:"#34d399"}} />
                  {service.value || "unknown"}
                </span>
              </div>
            ))}
            <div style={{paddingTop:14,fontSize:11,color:"rgba(255,255,255,.38)"}}>
              Status checked with the latest dashboard refresh.
            </div>
          </section>
        </div>
        </> : sectionLoading ? <div style={{padding:24,color:"rgba(255,255,255,.55)"}}>Loading {tab}…</div>
          : tab === "tenants" ? <section style={{background:"#172235",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:16,borderBottom:"1px solid rgba(255,255,255,.08)"}}>
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search organization or owner"
                style={{width:"min(100%,360px)",boxSizing:"border-box",border:"1px solid rgba(255,255,255,.16)",
                  borderRadius:5,padding:"9px 11px",background:"#0f172a",color:"#fff",fontSize:13}} />
            </div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:900,borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
              <thead style={{color:"rgba(255,255,255,.45)",background:"rgba(255,255,255,.025)"}}><tr>
                {[["Tenant",220],["Owner",200],["Onboarding",130],["WABA",180],["Plan",190],["Actions",200]].map(([label,width]) =>
                  <th key={label as string} style={{width:width as number,padding:"11px 14px",fontWeight:600}}>{label}</th>)}
              </tr></thead>
              <tbody>{tenants.map(tenant => <tr key={tenant.id} style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
                <td style={{padding:14}}><div style={{fontWeight:700}}>{tenant.name}{tenant.billingExempt && <span style={{marginLeft:6,fontSize:10,color:"#93c5fd",border:"1px solid #3b82f6",borderRadius:8,padding:"1px 6px"}}>INTERNAL</span>}</div>
                  <div style={{color:"rgba(255,255,255,.4)",marginTop:3}}>{tenant.slug} · {tenant.status}</div></td>
                <td style={{padding:14}}>{tenant.memberships[0]?.user.name || "-"}<div style={{color:"rgba(255,255,255,.4)",marginTop:3}}>{tenant.memberships[0]?.user.email || "No owner"}</div></td>
                <td style={{padding:14,color:"rgba(255,255,255,.65)"}}>{tenant.onboarding?.currentStep || "NOT_STARTED"}</td>
                <td style={{padding:14}}>{tenant.wabas.length ? tenant.wabas.map(waba => <div key={waba.id} style={{marginBottom:5}}>
                  <span style={{color:waba.status === "CONNECTED" ? "#6ee7b7" : "#fcd34d"}}>{waba.status}</span>
                  <div style={{color:"rgba(255,255,255,.42)",marginTop:2}}>{waba.phoneNumbers.length} phone(s)</div>
                </div>) : <span style={{color:"rgba(255,255,255,.4)"}}>Not connected</span>}
                  <a href={`/admin/customers/meta?org=${tenant.id}`} style={{display:"inline-block",marginTop:4,color:"#86efac",fontSize:11,fontWeight:700,textDecoration:"none"}}>Meta details →</a></td>
                <td style={{padding:14}}>
                  <select aria-label={`Plan for ${tenant.name}`} value={tenantPlanIds[tenant.id] || ""}
                    onChange={event => setTenantPlanIds(current => ({...current,[tenant.id]:event.target.value}))}
                    style={{width:"100%",maxWidth:175,padding:"7px 8px",borderRadius:4,background:"#0f172a",color:"#fff",border:"1px solid rgba(255,255,255,.15)"}}>
                    <option value="">Select plan</option>
                    {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · ₹{Number(plan.monthlyPrice).toLocaleString("en-IN")}/mo</option>)}
                  </select>
                  <div style={{color:"rgba(255,255,255,.4)",marginTop:4}}>Now: {tenant.subscriptions[0]?.plan.name || "None"}</div>
                </td>
                <td style={{padding:14}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    <button disabled={workingId === tenant.id || !tenantPlanIds[tenant.id]}
                      onClick={() => updateTenant(tenant.id,"assign-plan",{planId:tenantPlanIds[tenant.id]})}
                      style={{border:0,borderRadius:4,padding:"6px 8px",background:"#0e8b71",color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>Invoice plan</button>
                    <button disabled={workingId === tenant.id} onClick={() => updateTenant(tenant.id,tenant.status === "SUSPENDED" ? "activate" : "suspend")}
                      style={{border:"1px solid rgba(255,255,255,.16)",borderRadius:4,padding:"6px 8px",background:"transparent",color:"#fff",fontSize:10,cursor:"pointer"}}>
                      {tenant.status === "SUSPENDED" ? "Activate" : "Suspend"}
                    </button>
                    <button disabled={workingId === tenant.id} onClick={() => updateTenant(tenant.id,"set-internal",{internal:!tenant.billingExempt})}
                      title="Internal: all features, no limits, no plan or charges (your company and managed clients)"
                      style={{border:"1px solid #3b82f6",borderRadius:4,padding:"6px 8px",background:tenant.billingExempt?"#1d4ed8":"transparent",color:"#fff",fontSize:10,cursor:"pointer"}}>
                      {tenant.billingExempt ? "Internal ✓" : "Make internal"}</button>
                    {["TRIAL","EXPIRED"].includes(tenant.subscriptions[0]?.status) && <button disabled={workingId === tenant.id}
                      onClick={() => updateTenant(tenant.id,"extend-trial",{trialDays:7})}
                      style={{border:"1px solid rgba(255,255,255,.16)",borderRadius:4,padding:"6px 8px",background:"transparent",color:"#fff",fontSize:10,cursor:"pointer"}}>+7 trial days</button>}
                  </div>
                </td>
              </tr>)}</tbody>
            </table></div>
            {!tenants.length && <div style={{padding:22,color:"rgba(255,255,255,.45)",fontSize:13}}>No tenants found.</div>}
          </section> : tab === "payments" ? <section style={{background:"#172235",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,overflow:"hidden"}}>
            {payments.length ? <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:800,borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
              <thead style={{color:"rgba(255,255,255,.45)",background:"rgba(255,255,255,.025)"}}><tr>
                {[["Tenant",220],["Invoice",160],["Plan",150],["Amount",120],["UPI reference",180],["Review",180]].map(([label,width]) => <th key={label as string} style={{width:width as number,padding:"11px 14px",fontWeight:600}}>{label}</th>)}
              </tr></thead><tbody>{payments.map(payment => <tr key={payment.id} style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
                <td style={{padding:14}}><div style={{fontWeight:700}}>{payment.organization.legalName || payment.organization.name}</div><div style={{color:"rgba(255,255,255,.4)",marginTop:3}}>{payment.organization.gstin || "No GSTIN"}</div></td>
                <td style={{padding:14}}>{payment.invoice?.invoiceNumber || "Legacy payment"}</td>
                <td style={{padding:14}}>{payment.subscription?.plan.name || "-"}{payment.subscription && <div style={{color:"rgba(255,255,255,.4)",marginTop:3}}>{payment.subscription.billingInterval === "ANNUAL" ? "Yearly" : "Monthly"}</div>}</td>
                <td style={{padding:14}}>₹{Number(payment.amount).toLocaleString("en-IN",{minimumFractionDigits:2})}</td>
                <td style={{padding:14,wordBreak:"break-word"}}>{payment.transactionId || "-"}{payment.submittedAt && <div style={{color:"rgba(255,255,255,.4)",marginTop:3}}>Submitted {new Date(payment.submittedAt).toLocaleString("en-IN")}</div>}</td>
                <td style={{padding:14}}><div style={{display:"flex",gap:7}}>
                  <button disabled={workingId === payment.id} onClick={() => reviewPayment(payment.id,"approve")}
                    style={{border:0,borderRadius:4,padding:"7px 9px",background:"#047857",color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>Approve</button>
                  <button disabled={workingId === payment.id} onClick={() => reviewPayment(payment.id,"reject")}
                    style={{border:0,borderRadius:4,padding:"7px 9px",background:"#9f2d22",color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>Reject</button>
                </div></td>
              </tr>)}</tbody></table></div> : <div style={{padding:24,color:"rgba(255,255,255,.45)",fontSize:13}}>No pending payments.</div>}
          </section> : <section style={{background:"#172235",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,overflow:"hidden"}}>
            {wabas.length ? <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:900,borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
              <thead style={{color:"rgba(255,255,255,.45)",background:"rgba(255,255,255,.025)"}}><tr>
                {[["Tenant",200],["WABA",220],["Account state",130],["Phone numbers",240],["Meta token",150]].map(([label,width]) => <th key={label as string} style={{width:width as number,padding:"11px 14px",fontWeight:600}}>{label}</th>)}
              </tr></thead><tbody>{wabas.map(waba => <tr key={waba.id} style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
                <td style={{padding:14}}>{waba.organization.name}<div style={{color:"rgba(255,255,255,.4)",marginTop:3}}>{waba.organization.slug}</div></td>
                <td style={{padding:14}}>{waba.name}<div style={{color:"rgba(255,255,255,.4)",marginTop:3}}>{waba.wabaId}</div></td>
                <td style={{padding:14,color:waba.status === "CONNECTED" ? "#6ee7b7" : "#fcd34d"}}>{waba.status}</td>
                <td style={{padding:14}}>{waba.phoneNumbers.length ? waba.phoneNumbers.map(phone => <div key={phone.phoneNumber} style={{marginBottom:4}}>
                  {phone.phoneNumber} · {phone.status} · {phone.qualityRating || "No rating"}
                </div>) : "No numbers"}</td>
                <td style={{padding:14}}>{waba.organization.metaConnections[0]?.status || "Not connected"}
                  <div style={{color:"rgba(255,255,255,.4)",marginTop:3}}>{waba.organization.onboarding?.currentStep || "NOT_STARTED"}</div>
                </td>
              </tr>)}</tbody></table></div> : <div style={{padding:24,color:"rgba(255,255,255,.45)",fontSize:13}}>No WABAs are connected yet.</div>}
          </section>}
      </main>
    </div>
  )
}
