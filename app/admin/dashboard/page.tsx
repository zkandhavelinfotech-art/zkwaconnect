"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { SaasProfitDashboard } from "@/components/admin/SaasProfitDashboard"

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
type SignupRequest = { id:string; createdAt:string; metadata:{name?:string;businessName?:string;email?:string;phone?:string;expectedVolume?:string;message?:string}|null }
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
    id: string
    name: string
    slug: string
    status: string
    onboarding: { currentStep: string; phoneVerified: boolean } | null
    metaConnections: { status: string; tokenExpiresAt: string | null; lastSyncedAt: string | null }[]
  }
  phoneNumbers: { phoneNumber: string; status: string; verificationStatus: string | null; qualityRating: string | null }[]
}
type MetaSetupResult = {
  checks: { id:string; step:number; title:string; status:"pass"|"warn"|"fail"|"info"; detail:string }[]
  values: { appId:string; configId:string; publicUrl:string; graphVersion:string; appSecretSet:boolean }
  summary: { pass:number; attention:number }
  checkedAt: string
}
type AdminTab = "overview" | "onboarding" | "meta" | "profit" | "tenants" | "payments" | "wabas"

export default function AdminDashboard() {
  const router = useRouter()
  const [data, setData]     = useState<DashboardData | null>(null)
  const [loading,setLoading]= useState(true)
  const [error, setError]   = useState("")
  const [refresh, setRefresh] = useState(0)
  const [tab, setTab] = useState<AdminTab>("overview")
  const [tenants, setTenants] = useState<AdminTenant[]>([])
  const [plans, setPlans] = useState<AdminPlan[]>([])
  const [signupRequests, setSignupRequests] = useState<SignupRequest[]>([])
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [wabas, setWabas] = useState<AdminWaba[]>([])
  const [metaSetup, setMetaSetup] = useState<MetaSetupResult | null>(null)
  const [query, setQuery] = useState("")
  const [sectionLoading, setSectionLoading] = useState(false)
  const [sectionError, setSectionError] = useState("")
  const [notice, setNotice] = useState("")
  const [tenantPlanIds, setTenantPlanIds] = useState<Record<string,string>>({})
  const [workingId, setWorkingId] = useState("")
  const [showProvision, setShowProvision] = useState(false)
  const [provision, setProvision] = useState({organizationName:"",ownerName:"",email:"",password:"",phone:"",internal:false,signupRequestId:""})
  const [createdLogin, setCreatedLogin] = useState<{name:string;email:string;password:string}|null>(null)

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
    if (tab === "overview" || tab === "profit") return
    let active = true
    setSectionLoading(true)
    setSectionError("")
    setNotice("")
    const endpoint = tab === "tenants"
      ? `/api/admin/customers?q=${encodeURIComponent(query)}`
      : tab === "payments" ? "/api/admin/payments?status=PENDING" : "/api/admin/wabas"

    const request = tab === "meta"
      ? Promise.all([fetch("/api/admin/meta-setup"), fetch("/api/admin/wabas")]).then(async ([setupResponse,wabaResponse]) => {
          const setup = await setupResponse.json()
          const accounts = await wabaResponse.json()
          if (!setupResponse.ok) throw new Error(setup.error || "Could not inspect the Meta platform app.")
          if (!wabaResponse.ok) throw new Error(accounts.error || "Could not load connected portfolios.")
          return { setup, accounts }
        })
      : fetch(endpoint).then(async response => {
          const body = await response.json()
          if (!response.ok) throw new Error(body.error || "Could not load admin data.")
          return body
        })

    request
      .then(async response => {
        if (!active) return
        if (tab === "meta" && "setup" in response) {
          setMetaSetup(response.setup as MetaSetupResult)
          setWabas(response.accounts.wabas || [])
        } else if (tab === "tenants") {
          const body = response as {organizations?:AdminTenant[];plans?:AdminPlan[];signupRequests?:SignupRequest[]}
          setTenants(body.organizations || [])
          setPlans(body.plans || [])
          setSignupRequests(body.signupRequests || [])
          setTenantPlanIds(current => {
            const next = { ...current }
            for (const tenant of body.organizations || [])
              if (!next[tenant.id]) next[tenant.id] = tenant.subscriptions?.[0]?.plan?.id || ""
            return next
          })
        } else if (tab === "payments") setPayments((response as {payments?:AdminPayment[]}).payments || [])
        else setWabas((response as {wabas?:AdminWaba[]}).wabas || [])
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

  async function provisionCustomer(event: React.FormEvent) {
    event.preventDefault(); setWorkingId("provision"); setSectionError(""); setNotice(""); setCreatedLogin(null)
    try {
      const response = await fetch("/api/admin/customers", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(provision) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Customer provisioning failed.")
      setCreatedLogin({name:provision.organizationName,email:provision.email,password:provision.password})
      setNotice(body.message); setShowProvision(false); setProvision({organizationName:"",ownerName:"",email:"",password:"",phone:"",internal:false,signupRequestId:""}); setRefresh(value => value + 1)
    } catch (reason) { setSectionError(reason instanceof Error ? reason.message : "Customer provisioning failed.") }
    finally { setWorkingId("") }
  }

  function provisionFromRequest(request:SignupRequest) {
    const details = request.metadata || {}
    setProvision({organizationName:details.businessName || "",ownerName:details.name || "",email:details.email || "",password:"",phone:details.phone || "",internal:false,signupRequestId:request.id})
    setShowProvision(true); setCreatedLogin(null); setNotice("")
    window.scrollTo({top:0,behavior:"smooth"})
  }

  async function openOnboarding(id:string) {
    setWorkingId(id); setSectionError("")
    try {
      const response = await fetch("/api/admin/customers", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action:"open-onboarding"})})
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not open managed onboarding.")
      window.location.href = body.redirect || "/onboarding"
    } catch (reason) { setSectionError(reason instanceof Error ? reason.message : "Could not open managed onboarding."); setWorkingId("") }
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
      <div style={{background:"linear-gradient(120deg,#121f35 0%,#152a3b 55%,#12382f 100%)",borderBottom:"1px solid rgba(255,255,255,.08)",
        padding:"18px clamp(18px,3vw,36px)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,flexWrap:"wrap"}}>
        <div style={{fontFamily:"Sora,sans-serif",fontSize:18,fontWeight:700}}>
          ZKWAConnect Control Center
          <span style={{marginLeft:12,background:"rgba(220,38,38,.15)",
            border:"1px solid rgba(220,38,38,.3)",color:"#fca5a5",
            borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>SUPER ADMIN</span>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button type="button" onClick={()=>setTab("meta")} style={{background:"#25D366",border:0,color:"#052e2b",borderRadius:8,padding:"8px 13px",fontSize:12,fontWeight:800,cursor:"pointer"}}>
            Meta operations
          </button>
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
          <a href="/admin/partners" style={{background:"rgba(37,211,102,.15)",border:"1px solid rgba(37,211,102,.35)",
            color:"#86efac",borderRadius:6,padding:"7px 12px",fontSize:12,fontWeight:700,textDecoration:"none"}}>
            🤝 Partners
          </a>
          <a href="/admin/go-live" style={{background:"rgba(250,204,21,.15)",border:"1px solid rgba(250,204,21,.4)",
            color:"#fde68a",borderRadius:6,padding:"7px 12px",fontSize:12,fontWeight:700,textDecoration:"none"}}>
            🚀 Go-live checklist
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
          ["meta","Meta & portfolios"],
          ["onboarding","👑 Delegated Onboarding"],
          ["overview","Overview"],["profit","💰 Profit & Margins"],["tenants","Tenants"],["payments","Payments"],["wabas","WABA health"],
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
              {tab === "overview" ? "Operations overview" : tab === "onboarding" ? "Super Admin Delegated Tenant Onboarding" : tab === "meta" ? "Meta account & business portfolios" : tab === "profit" ? "SaaS Product Owner Profit Analytics" : tab === "tenants" ? "Customer management" : tab === "payments" ? "Payment review" : "WhatsApp health"}
            </h1>
            <p style={{fontSize:13,color:"rgba(255,255,255,.48)",margin:"6px 0 0"}}>
              {tab === "overview" ? "Customer, payment, messaging, and platform activity" :
                tab === "onboarding" ? "Inspect tenant onboarding sessions, review error diagnostics, and configure WABA assets on behalf of clients" :
                tab === "meta" ? "Create the platform app, create or select a portfolio, and manage customer access from one guided workspace" :
                tab === "profit" ? "Monthly, quarterly, and yearly net profit tracking per client and message commission" :
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

        <section style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,flexWrap:"wrap",padding:"20px 22px",marginBottom:18,borderRadius:14,background:"linear-gradient(105deg,rgba(37,211,102,.13),rgba(59,130,246,.08))",border:"1px solid rgba(37,211,102,.22)"}}>
          <div style={{maxWidth:720}}>
            <div style={{fontSize:10,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"#86efac"}}>Meta onboarding control</div>
            <h2 style={{fontFamily:"Sora,sans-serif",fontSize:18,margin:"6px 0"}}>Set up the platform once, then connect every customer safely.</h2>
            <p style={{fontSize:12,lineHeight:1.6,color:"rgba(255,255,255,.55)",margin:0}}>Create the ZKWAConnect Meta app, select the product-owner portfolio, and manage customer portfolio access with separate status for WABA, phone, webhook and outbound permission.</p>
          </div>
          <button type="button" onClick={()=>setTab("meta")} style={{border:0,borderRadius:8,padding:"10px 14px",background:"#25D366",color:"#052e2b",fontSize:12,fontWeight:850,cursor:"pointer"}}>Open Meta & portfolios →</button>
        </section>

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
        </> : tab === "onboarding" ? <DelegatedOnboardingTabContent />
          : tab === "meta" ? <MetaPortfolioPanel result={metaSetup} wabas={wabas} loading={sectionLoading} openCustomers={()=>setTab("tenants")} />
          : tab === "profit" ? <SaasProfitDashboard />
          : sectionLoading ? <div style={{padding:24,color:"rgba(255,255,255,.55)"}}>Loading {tab}…</div>
          : tab === "tenants" ? <section style={{background:"#172235",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:16,borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",flexWrap:"wrap"}}>
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search organization or owner"
                style={{width:"min(100%,360px)",boxSizing:"border-box",border:"1px solid rgba(255,255,255,.16)",
                  borderRadius:5,padding:"9px 11px",background:"#0f172a",color:"#fff",fontSize:13}} />
              <button type="button" onClick={()=>setShowProvision(value=>!value)} style={{border:0,borderRadius:6,padding:"9px 13px",background:"#25D366",color:"#052e2b",fontSize:12,fontWeight:800,cursor:"pointer"}}>{showProvision?"Close":"+ Create customer workspace"}</button>
            </div>
            {signupRequests.length>0&&<div style={{padding:16,background:"rgba(37,211,102,.06)",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
              <div style={{fontFamily:"Sora,sans-serif",fontSize:13,fontWeight:800,color:"#a7f3d0",marginBottom:9}}>Pending workspace requests ({signupRequests.length})</div>
              <div style={{display:"grid",gap:7}}>{signupRequests.slice(0,8).map(request=>{const details=request.metadata||{};return <div key={request.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",padding:"9px 11px",background:"#0f172a",borderRadius:6,fontSize:11}}>
                <div><strong>{details.businessName||"Unnamed business"}</strong> · {details.name||"Unknown contact"}<div style={{color:"rgba(255,255,255,.48)",marginTop:3}}>{details.email||"No email"} · {details.phone||"No phone"} · {details.expectedVolume||"Volume not supplied"} · {new Date(request.createdAt).toLocaleString("en-IN")}</div>{details.message&&<div style={{color:"rgba(255,255,255,.58)",marginTop:3}}>{details.message}</div>}</div>
                <button type="button" onClick={()=>provisionFromRequest(request)} style={{border:0,borderRadius:5,padding:"7px 10px",background:"#25D366",color:"#052e2b",fontSize:10,fontWeight:900,cursor:"pointer"}}>Review & provision</button>
              </div>})}</div>
            </div>}
            {showProvision&&<form onSubmit={provisionCustomer} style={{padding:16,background:"#101b2d",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
              <div style={{fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:700,marginBottom:4}}>Provision customer and login</div>
              <p style={{fontSize:11,color:"rgba(255,255,255,.48)",margin:"0 0 12px"}}>The client receives only the workspace login. Complete Meta onboarding before sharing it.</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:9}}>
                {([['organizationName','Business / workspace','Recruitment Training Academy'],['ownerName','Client owner name','RTA Admin'],['email','Login email','admin@client.com'],['password','Temporary password','Minimum 10 characters'],['phone','Client phone (optional)','+91…']] as const).map(([key,label,placeholder])=><label key={key} style={{fontSize:10,color:"rgba(255,255,255,.62)",fontWeight:700}}>{label}<input required={key!=="phone"} type={key==="password"?"text":key==="email"?"email":"text"} minLength={key==="password"?10:undefined} value={provision[key]} onChange={event=>setProvision(current=>({...current,[key]:event.target.value}))} placeholder={placeholder} style={{display:"block",width:"100%",boxSizing:"border-box",marginTop:4,border:"1px solid rgba(255,255,255,.16)",borderRadius:5,padding:"8px 9px",background:"#0f172a",color:"#fff",fontSize:12}}/></label>)}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12,flexWrap:"wrap"}}><label style={{fontSize:11,color:"rgba(255,255,255,.68)"}}><input type="checkbox" checked={provision.internal} onChange={event=>setProvision(current=>({...current,internal:event.target.checked}))}/> Managed/internal client (no billing limits)</label><button disabled={workingId==="provision"} type="submit" style={{border:0,borderRadius:5,padding:"8px 13px",background:"#0e8b71",color:"#fff",fontSize:11,fontWeight:800,cursor:"pointer"}}>{workingId==="provision"?"Creating…":"Create workspace & login"}</button></div>
            </form>}
            {createdLogin&&<div style={{margin:16,padding:14,background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.32)",borderRadius:7,color:"#a7f3d0",fontSize:12}}><strong>Credentials created for {createdLogin.name}</strong><div style={{marginTop:6}}>Login: <code>{createdLogin.email}</code> · Temporary password: <code>{createdLogin.password}</code></div><div style={{marginTop:5,color:"rgba(255,255,255,.55)"}}>Save and share securely after onboarding. The password is not retrievable later.</div></div>}
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
                    <button disabled={workingId === tenant.id} onClick={() => openOnboarding(tenant.id)}
                      style={{border:0,borderRadius:4,padding:"6px 8px",background:"#25D366",color:"#052e2b",fontSize:10,fontWeight:800,cursor:"pointer"}}>Manage onboarding</button>
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

function MetaPortfolioPanel({result,wabas,loading,openCustomers}:{
  result:MetaSetupResult|null; wabas:AdminWaba[]; loading:boolean; openCustomers:()=>void
}) {
  const connected = wabas.filter(item=>item.status==="CONNECTED")
  const connectedPortfolios = new Set(connected.map(item=>item.organization.id)).size
  const appReady = Boolean(result?.values.appId && result.values.appSecretSet)
  const attention = result?.summary.attention ?? 0
  const primary:React.CSSProperties = {display:"inline-flex",alignItems:"center",justifyContent:"center",border:0,borderRadius:8,padding:"9px 12px",background:"#25D366",color:"#052e2b",fontSize:12,fontWeight:800,textDecoration:"none",cursor:"pointer"}
  const secondary:React.CSSProperties = {...primary,background:"rgba(255,255,255,.07)",color:"#e2e8f0",border:"1px solid rgba(255,255,255,.13)"}

  if (loading && !result) return <div style={{padding:32,borderRadius:14,background:"#172235",color:"rgba(255,255,255,.55)"}}>Checking the Meta app and customer portfolios…</div>

  return <div style={{display:"grid",gap:18}}>
    <section style={{position:"relative",overflow:"hidden",padding:"clamp(22px,4vw,38px)",borderRadius:18,border:"1px solid rgba(37,211,102,.24)",background:"linear-gradient(135deg,#17263c 0%,#183449 56%,#124538 100%)"}}>
      <div aria-hidden="true" style={{position:"absolute",right:-70,top:-100,width:260,height:260,borderRadius:"50%",background:"rgba(37,211,102,.11)",filter:"blur(2px)"}} />
      <div style={{position:"relative",maxWidth:780}}>
        <div style={{display:"inline-flex",gap:7,alignItems:"center",padding:"5px 9px",borderRadius:20,background:appReady?"rgba(37,211,102,.12)":"rgba(251,191,36,.12)",color:appReady?"#86efac":"#fde68a",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:".07em"}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:"currentColor"}} />{appReady?"Platform app configured":"Platform setup required"}
        </div>
        <h2 style={{fontFamily:"Sora,sans-serif",fontSize:"clamp(22px,3vw,34px)",lineHeight:1.15,margin:"14px 0 10px"}}>One Meta app. Every customer portfolio. Clear access status.</h2>
        <p style={{margin:0,maxWidth:670,color:"rgba(255,255,255,.64)",fontSize:14,lineHeight:1.7}}>ZKWAConnect owns one platform Meta app. Each customer keeps ownership of their business portfolio and authorizes access through managed onboarding. This is the same scalable separation used by WhatsApp SaaS providers.</p>
        <div style={{display:"flex",gap:9,flexWrap:"wrap",marginTop:20}}>
          <a href="/admin/meta-setup" style={primary}>Open platform setup</a>
          <a href="https://business.facebook.com/settings" target="_blank" rel="noreferrer" style={secondary}>Open Meta Business Settings ↗</a>
        </div>
      </div>
    </section>

    <section aria-label="Meta setup operations" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))",gap:14}}>
      <OperationCard number="01" title="Create Meta developer app" status={appReady?"Configured":"Owner action"} good={appReady}
        body="Create the ZKWAConnect platform app once, then add WhatsApp and Facebook Login for Business. Customers never create a developer app."
        actions={<><a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" style={primary}>Create / open app ↗</a><a href="/admin/meta-setup" style={secondary}>Configure IDs</a></>} />
      <OperationCard number="02" title="Create business portfolio" status="Owner action" good={false}
        body="Create or select the product owner's Meta business portfolio. Meta requires a portfolio admin to complete this step in Business Suite."
        actions={<><a href="https://business.facebook.com/overview" target="_blank" rel="noreferrer" style={primary}>Create / select portfolio ↗</a><a href="https://business.facebook.com/settings/info" target="_blank" rel="noreferrer" style={secondary}>Portfolio information ↗</a></>} />
      <OperationCard number="03" title="Access customer portfolios" status={`${connectedPortfolios} connected`} good={connectedPortfolios>0}
        body="Provision a customer workspace, launch managed onboarding, then let the owner authorize the correct portfolio, WABA and phone number."
        actions={<><button type="button" onClick={openCustomers} style={primary}>Choose customer</button><a href="/admin/partners" style={secondary}>Agency partners</a></>} />
    </section>

    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",gap:14}}>
      <div style={{background:"#172235",border:"1px solid rgba(255,255,255,.08)",borderRadius:14,overflow:"hidden"}}>
        <div style={{padding:"17px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,borderBottom:"1px solid rgba(255,255,255,.07)"}}>
          <div><h3 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0}}>Connected customer assets</h3><p style={{fontSize:11,color:"rgba(255,255,255,.43)",margin:"4px 0 0"}}>Only current connected WABAs are counted</p></div>
          <span style={{fontSize:11,color:"#86efac",fontWeight:800}}>{connected.length} WABA{connected.length===1?"":"s"}</span>
        </div>
        {connected.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
          <thead style={{color:"rgba(255,255,255,.42)"}}><tr><th style={{padding:"11px 18px"}}>Customer</th><th style={{padding:"11px 18px"}}>WABA</th><th style={{padding:"11px 18px"}}>Phone</th><th style={{padding:"11px 18px"}}>Access</th></tr></thead>
          <tbody>{connected.slice(0,8).map(item=><tr key={item.id} style={{borderTop:"1px solid rgba(255,255,255,.06)"}}>
            <td style={{padding:"13px 18px",fontWeight:700}}>{item.organization.name}</td>
            <td style={{padding:"13px 18px"}}>{item.name}<div style={{color:"rgba(255,255,255,.4)",marginTop:3}}>{item.wabaId}</div></td>
            <td style={{padding:"13px 18px"}}>{item.phoneNumbers[0]?.phoneNumber||"Not registered"}</td>
            <td style={{padding:"13px 18px"}}><a href={`/admin/customers/meta?org=${item.organization.id}`} style={{color:"#86efac",fontWeight:800,textDecoration:"none"}}>View status →</a></td>
          </tr>)}</tbody>
        </table></div>:<div style={{padding:22,color:"rgba(255,255,255,.48)",fontSize:13}}>No customer portfolio is connected yet. Create a customer workspace and start managed onboarding.</div>}
      </div>
      <aside style={{background:"#172235",border:"1px solid rgba(255,255,255,.08)",borderRadius:14,padding:18}}>
        <h3 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:"0 0 14px"}}>Readiness</h3>
        <StatusRow label="Meta App ID" value={result?.values.appId||"Not configured"} good={Boolean(result?.values.appId)} />
        <StatusRow label="App secret" value={result?.values.appSecretSet?"Stored securely":"Missing"} good={Boolean(result?.values.appSecretSet)} />
        <StatusRow label="Embedded Signup" value={result?.values.configId?"Configured":"Needs configuration ID"} good={Boolean(result?.values.configId)} />
        <StatusRow label="Live checks" value={attention?`${attention} need attention`:`${result?.summary.pass||0} passing`} good={!attention&&Boolean(result)} />
        <a href="/admin/meta-setup" style={{...secondary,width:"100%",boxSizing:"border-box",marginTop:16}}>Review all checks</a>
      </aside>
    </section>
  </div>
}

function OperationCard({number,title,status,good,body,actions}:{number:string;title:string;status:string;good:boolean;body:string;actions:React.ReactNode}) {
  return <article style={{display:"flex",flexDirection:"column",minHeight:238,padding:19,borderRadius:14,background:"#172235",border:"1px solid rgba(255,255,255,.08)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}><span style={{fontFamily:"Sora,sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",fontWeight:800}}>{number}</span><span style={{fontSize:10,padding:"4px 8px",borderRadius:20,background:good?"rgba(37,211,102,.12)":"rgba(251,191,36,.1)",color:good?"#86efac":"#fde68a",fontWeight:800}}>{status}</span></div>
    <h3 style={{fontFamily:"Sora,sans-serif",fontSize:17,margin:"18px 0 8px"}}>{title}</h3>
    <p style={{fontSize:12,color:"rgba(255,255,255,.55)",lineHeight:1.65,margin:0}}>{body}</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:"auto",paddingTop:18}}>{actions}</div>
  </article>
}

function StatusRow({label,value,good}:{label:string;value:string;good:boolean}) {
  return <div style={{padding:"11px 0",borderTop:"1px solid rgba(255,255,255,.07)"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:11}}><span style={{color:"rgba(255,255,255,.48)"}}>{label}</span><span style={{color:good?"#86efac":"#fde68a",fontWeight:800,textAlign:"right",overflowWrap:"anywhere"}}>{value}</span></div></div>
}

function DelegatedOnboardingTabContent() {
  const [sessions, setSessions] = useState<any[]>([])
  const [summary, setSummary] = useState<any>({ total: 0, connected: 0, pending: 0, notStarted: 0 })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  useEffect(() => {
    fetch("/api/admin/onboarding/sessions")
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setSessions(data.sessions || [])
          setSummary(data.summary || { total: 0, connected: 0, pending: 0, notStarted: 0 })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = sessions.filter(s => !query || s.organizationName?.toLowerCase().includes(query.toLowerCase()) || s.phone?.phoneNumber?.includes(query))

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={{ background: "#172235", border: "1px solid rgba(255,255,255,.08)", padding: "8px 14px", borderRadius: 8, fontSize: 12 }}>
            Total Tenants: <strong style={{ color: "#fff" }}>{summary.total}</strong>
          </span>
          <span style={{ background: "#172235", border: "1px solid rgba(255,255,255,.08)", padding: "8px 14px", borderRadius: 8, fontSize: 12 }}>
            Connected: <strong style={{ color: "#86efac" }}>{summary.connected}</strong>
          </span>
          <span style={{ background: "#172235", border: "1px solid rgba(255,255,255,.08)", padding: "8px 14px", borderRadius: 8, fontSize: 12 }}>
            Pending: <strong style={{ color: "#fde68a" }}>{summary.pending}</strong>
          </span>
        </div>
        <a href="/admin/onboarding" style={{ background: "#25D366", color: "#052e2b", textDecoration: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 800 }}>
          Open Full Onboarding Console ↗
        </a>
      </div>

      <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tenant or phone…"
            style={{ width: "min(100%,320px)", background: "#0f172a", border: "1px solid rgba(255,255,255,.16)", borderRadius: 6, padding: "7px 10px", color: "#fff", fontSize: 12 }}
          />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
          <thead style={{ color: "rgba(255,255,255,.45)", background: "rgba(255,255,255,.02)" }}>
            <tr>
              <th style={{ padding: "10px 14px" }}>Tenant</th>
              <th style={{ padding: "10px 14px" }}>Status</th>
              <th style={{ padding: "10px 14px" }}>WABA ID</th>
              <th style={{ padding: "10px 14px" }}>Phone</th>
              <th style={{ padding: "10px 14px", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>Loading onboarding records…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>No tenants found.</td></tr>
            ) : (
              filtered.map(item => (
                <tr key={item.organizationId} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                  <td style={{ padding: "11px 14px", fontWeight: 700 }}>{item.organizationName}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 800, background: item.status === "CONNECTED" ? "rgba(16,185,129,.15)" : "rgba(245,158,11,.15)", color: item.status === "CONNECTED" ? "#86efac" : "#fde68a" }}>
                      {item.status}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px" }}><code>{item.waba?.wabaId || "—"}</code></td>
                  <td style={{ padding: "11px 14px" }}>{item.phone?.phoneNumber || "—"}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right" }}>
                    <a href="/admin/onboarding" style={{ color: "#38bdf8", fontWeight: 700, textDecoration: "none" }}>Assist →</a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
