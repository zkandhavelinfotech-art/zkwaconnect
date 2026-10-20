"use client"
import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { GST_STATES, stateByName } from "@/lib/billing/states"
import { MessagingCosts } from "@/components/billing/MessagingCosts"

type BillingProfile = {
  legalName: string
  gstin: string
  billingAddress: string
  billingCity: string
  state: string
  billingStateCode: string
  billingPostalCode: string
}
type Interval = "MONTHLY" | "ANNUAL"
type Plan = { id: string; name: string; description?: string | null; monthlyPrice: number | string; annualPrice?: number | string | null
  maxUsers?: number | null; maxPhoneNumbers?: number | null; maxMessages?: number | null }
type Invoice = { id: string; invoiceNumber: string; description?: string | null; amount: number | string; tax: number | string; total: number | string
  status: string; issuedAt: string; dueAt?: string | null; paidAt?: string | null }
type Payment = { id: string; invoiceId?: string | null; amount: number | string; method: string; status: string; transactionId?: string | null
  rejectionReason?: string | null; createdAt: string; invoice?: { invoiceNumber: string } | null }
type Subscription = { id: string; status: string; billingInterval: Interval; trialEndsAt?: string | null; currentPeriodEnd?: string | null; plan: Plan }
type BillingData = {
  subscription: Subscription | null
  pending: { id: string; plan: Plan; billingInterval: Interval; invoice: Invoice } | null
  invoices: Invoice[]
  payments: Payment[]
  plans: Plan[]
  billingProfile: BillingProfile
  paymentDetails: { upiId: string; payeeName: string }
  usage?: { active: boolean; limits: { messages: number | null; users: number | null; numbers: number | null }; usage: { messages: number; users: number; invites: number; numbers: number } }
}

const emptyProfile: BillingProfile = {
  legalName:"",gstin:"",billingAddress:"",billingCity:"",state:"",billingStateCode:"",billingPostalCode:"",
}
const inputStyle: React.CSSProperties = {
  boxSizing:"border-box",width:"100%",minHeight:42,border:"1px solid #cbd5d3",borderRadius:6,
  padding:"9px 11px",fontSize:13,color:"#183633",background:"#fff",
}
const labelStyle: React.CSSProperties = {display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}
const card: React.CSSProperties = {background:"#fff",border:"1px solid #e2e8f0",borderRadius:8}
const primary: React.CSSProperties = {border:0,borderRadius:6,padding:"10px 14px",background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}
type FieldErrors = Partial<Record<keyof BillingProfile, string>>

// Same rules as the server, so missing details are pointed out before anything is sent.
function checkProfile(profile: BillingProfile): FieldErrors {
  const errors: FieldErrors = {}
  if (profile.legalName.trim().length < 2) errors.legalName = "Enter your legal or business name."
  if (profile.billingAddress.trim().length < 3) errors.billingAddress = "Enter your billing address."
  if (profile.billingCity.trim().length < 2) errors.billingCity = "Enter your city."
  const state = stateByName(profile.state)
  if (!state) errors.state = "Choose your state."
  if (!/^\d{6}$/.test(profile.billingPostalCode.trim())) errors.billingPostalCode = "Enter your 6-digit PIN code."
  const gstin = profile.gstin.trim().toUpperCase()
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) errors.gstin = "Enter a valid 15-character GSTIN or leave it blank."
  else if (gstin && state && gstin.slice(0, 2) !== state.code) errors.gstin = `This GSTIN starts with ${gstin.slice(0, 2)}, but ${state.name} is ${state.code}. Check the state or GSTIN.`
  return errors
}

const formatInr = (value: number | string) => `₹${Number(value).toLocaleString("en-IN", {minimumFractionDigits:2,maximumFractionDigits:2})}`
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"}) : "-"
const STATUS_COLORS: Record<string, [string, string]> = {
  ACTIVE:["#dcfce7","#166534"], PAID:["#dcfce7","#166534"], APPROVED:["#dcfce7","#166534"],
  TRIAL:["#e0f2fe","#075985"], DUE:["#fef3c7","#92400e"], PENDING:["#fef3c7","#92400e"], PENDING_PAYMENT:["#fef3c7","#92400e"],
  REJECTED:["#fee2e2","#991b1b"], EXPIRED:["#fee2e2","#991b1b"], PAST_DUE:["#fee2e2","#991b1b"], FAILED:["#fee2e2","#991b1b"],
}
const STATUS_LABELS: Record<string, string> = { PENDING:"Under review", PENDING_PAYMENT:"Awaiting payment", DUE:"Due", TRIAL:"Free trial" }

function Chip({ status }: { status: string }) {
  const [background, color] = STATUS_COLORS[status] || ["#eef2f1", "#49615e"]
  return <span style={{display:"inline-block",background,color,borderRadius:20,padding:"3px 9px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
    {STATUS_LABELS[status] || status.charAt(0) + status.slice(1).toLowerCase()}</span>
}

function upiLink(details: BillingData["paymentDetails"], invoice: Invoice) {
  return `upi://pay?${new URLSearchParams({pa:details.upiId,pn:details.payeeName,am:Number(invoice.total).toFixed(2),cu:"INR",tn:`Invoice ${invoice.invoiceNumber}`})}`
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null)
  const [profile, setProfile] = useState<BillingProfile>(emptyProfile)
  const [period, setPeriod] = useState<Interval>("MONTHLY")
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [qr, setQr] = useState("")
  const [transactionId, setTransactionId] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [busyPlan, setBusyPlan] = useState("")
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const profileRef = useRef<HTMLElement>(null)
  const payRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch("/api/billing")
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not load billing information.")
        if (active) {
          setData(body)
          setProfile(body.billingProfile)
          if (body.subscription?.status === "ACTIVE") setPeriod(body.subscription.billingInterval)
        }
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load billing information.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh])

  useEffect(() => {
    if (!data?.paymentDetails.upiId || !selectedInvoice) {
      setQr("")
      return
    }
    QRCode.toDataURL(upiLink(data.paymentDetails, selectedInvoice), { width:220, margin:1 })
      .then(setQr)
      .catch(() => setError("Could not create the UPI QR code."))
  }, [data, selectedInvoice])

  useEffect(() => {
    if (selectedInvoice) payRef.current?.scrollIntoView({ behavior:"smooth", block:"start" })
  }, [selectedInvoice])

  function updateProfile(field: keyof BillingProfile, value: string) {
    setProfile(current => ({...current,[field]:value,...(field === "state" ? {billingStateCode:stateByName(value)?.code || ""} : {})}))
    setFieldErrors(current => ({...current,[field]:undefined}))
  }

  async function saveProfile() {
    const errors = checkProfile(profile)
    setFieldErrors(errors)
    if (Object.keys(errors).length) {
      setError(data?.subscription || data?.pending ? "Please complete your billing details (highlighted below)." : "Add your billing details once before buying a plan — they're printed on your GST invoice.")
      profileRef.current?.scrollIntoView({ behavior:"smooth", block:"start" })
      return false
    }
    setSavingProfile(true)
    setError("")
    try {
      const response = await fetch("/api/billing", {
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(profile),
      })
      const body = await response.json()
      if (!response.ok) {
        if (body.fields) { setFieldErrors(body.fields); profileRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }) }
        throw new Error(body.error || "Could not save billing details.")
      }
      setNotice("Billing details saved.")
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save billing profile.")
      return false
    } finally {
      setSavingProfile(false)
    }
  }

  async function buyPlan(plan: Plan) {
    setBusyPlan(plan.id)
    setError("")
    setNotice("")
    try {
      const saved = await saveProfile()
      if (!saved) return
      const response = await fetch("/api/billing", {
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({planId:plan.id,interval:period}),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not create the invoice.")
      setNotice(`Invoice ${body.invoice.invoiceNumber} is ready. Scan the QR code below to pay, then enter the UPI reference.`)
      setSelectedInvoice({ id:body.invoice.id, invoiceNumber:body.invoice.invoiceNumber, total:body.invoice.total, amount:0, tax:0, status:"DUE", issuedAt:new Date().toISOString() })
      setRefresh(value => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the invoice.")
    } finally {
      setBusyPlan("")
    }
  }

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedInvoice) return
    setSubmittingPayment(true)
    setError("")
    try {
      const response = await fetch("/api/payments", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({invoiceId:selectedInvoice.id,method:"UPI",upiId:data?.paymentDetails.upiId,transactionId}),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not submit payment.")
      setNotice("Thanks! Your payment reference was submitted. Your plan activates as soon as our team confirms it (usually within a few hours, at most 24).")
      setSelectedInvoice(null)
      setTransactionId("")
      setRefresh(value => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit payment.")
    } finally {
      setSubmittingPayment(false)
    }
  }

  async function copyUpi() {
    if (!data?.paymentDetails.upiId) return
    try { await navigator.clipboard.writeText(data.paymentDetails.upiId); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }

  if (loading && !data) return <div style={{padding:32,color:"#526763"}}>Loading billing…</div>

  const subscription = data?.subscription
  const pending = data?.pending
  const underReview = new Set((data?.payments || []).filter(payment => payment.status === "PENDING").map(payment => payment.invoiceId))
  const pendingReviewed = pending && underReview.has(pending.invoice.id)
  const anyAnnual = data?.plans.some(plan => Number(plan.annualPrice) > 0)
  const activePaid = subscription?.status === "ACTIVE"

  function planAction(plan: Plan) {
    if (pending && pending.plan.id === plan.id && pending.billingInterval === period) return { label: pendingReviewed ? "Payment under review" : "Pay pending invoice", disabled: Boolean(pendingReviewed) }
    if (!activePaid || !subscription) return { label: subscription?.status === "TRIAL" && subscription.plan.id === plan.id ? "Buy this plan" : "Choose plan", disabled:false }
    if (subscription.plan.id === plan.id) return { label: period === subscription.billingInterval ? "Renew plan" : `Switch to ${period === "ANNUAL" ? "yearly" : "monthly"}`, disabled:false }
    if (Number(plan.monthlyPrice) > Number(subscription.plan.monthlyPrice)) return { label:"Upgrade", disabled:false }
    return { label:"Smaller plan", disabled:true }
  }

  const profileSection = <section ref={profileRef} style={{...card,padding:20,marginBottom:18,scrollMarginTop:80,
    borderColor:Object.values(fieldErrors).some(Boolean) ? "#f3b5ae" : "#e2e8f0"}}>
    <h2 style={{fontFamily:"Sora,sans-serif",fontSize:16,margin:"0 0 5px",color:"#102a2a"}}>Billing details for GST invoices</h2>
    <p style={{fontSize:12,color:"#64748b",margin:"0 0 16px"}}>Needed once before your first purchase. Add your GSTIN to claim input tax credit.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:12}}>
      {([
        ["legalName","Legal / business name","Your company or full name"],["gstin","GSTIN (optional)","e.g. 33ABCDE1234F1Z5"],
        ["billingAddress","Billing address","Door no., street, area"],["billingCity","City",""],["state","State",""],["billingPostalCode","PIN code","6 digits"],
      ] as [keyof BillingProfile,string,string][]).map(([field,label,placeholder]) => {
        const problem = fieldErrors[field]
        const style = {...inputStyle,borderColor:problem ? "#d93025" : "#cbd5d3"}
        return <label key={field} style={{display:"block"}}>
          <span style={labelStyle}>{label}{field !== "gstin" && <span style={{color:"#d93025"}}> *</span>}</span>
          {field === "state"
            ? <select value={stateByName(profile.state)?.name || ""} onChange={event => updateProfile("state",event.target.value)} aria-invalid={Boolean(problem)} style={style}>
                <option value="">Choose state…</option>
                {GST_STATES.map(state => <option key={state.code} value={state.name}>{state.name} ({state.code})</option>)}
              </select>
            : <input value={profile[field]} placeholder={placeholder} aria-invalid={Boolean(problem)}
                onChange={event => updateProfile(field,field === "gstin" ? event.target.value.toUpperCase() : event.target.value)}
                maxLength={field === "gstin" ? 15 : field === "billingPostalCode" ? 6 : undefined}
                inputMode={field === "billingPostalCode" ? "numeric" : undefined} style={style} />}
          {problem && <span role="alert" style={{display:"block",fontSize:11,color:"#c5221f",marginTop:4}}>{problem}</span>}
        </label>
      })}
    </div>
    <button onClick={saveProfile} disabled={savingProfile} style={{...primary,marginTop:14,padding:"9px 13px"}}>
      {savingProfile ? "Saving…" : "Save billing details"}
    </button>
  </section>
  const profileComplete = Object.keys(checkProfile(data?.billingProfile || emptyProfile)).length === 0

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:22}}>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>Billing &amp; plans</h1>
          <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>Buy or renew a plan with UPI, download GST invoices, and see your payments</p>
        </div>
        <button onClick={() => setRefresh(value => value + 1)} style={{background:"#fff",border:"1px solid #cbd5d3",
          borderRadius:6,padding:"8px 12px",color:"#24433e",fontSize:12,fontWeight:700,cursor:"pointer"}}>Refresh</button>
      </div>

      {error && <div role="alert" style={{padding:12,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
      {notice && <div role="status" style={{padding:12,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13}}>{notice}</div>}

      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:12,marginBottom:18}}>
        <article style={{...card,padding:18}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>Current plan</div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
            <span style={{fontFamily:"Sora,sans-serif",fontSize:20,fontWeight:700,color:"#0f172a"}}>{subscription?.plan.name || "No plan"}</span>
            {subscription && <Chip status={subscription.status} />}
          </div>
          <div style={{fontSize:12,color:"#64748b",marginTop:6}}>
            {!subscription ? "Choose a plan below"
              : subscription.status === "TRIAL" ? `Trial ends ${formatDate(subscription.trialEndsAt || subscription.currentPeriodEnd)}`
              : subscription.status === "ACTIVE" ? `${subscription.billingInterval === "ANNUAL" ? "Yearly" : "Monthly"} · renews ${formatDate(subscription.currentPeriodEnd)}`
              : subscription.status === "EXPIRED" ? `Ended ${formatDate(subscription.currentPeriodEnd)} — choose a plan to continue`
              : subscription.status}
          </div>
        </article>
        {data?.usage&&<article style={{...card,padding:18}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>Usage</div>
          {([["Messages this month",data.usage.usage.messages,data.usage.limits.messages],["Team seats",data.usage.usage.users+data.usage.usage.invites,data.usage.limits.users],
            ["WhatsApp numbers",data.usage.usage.numbers,data.usage.limits.numbers]] as [string,number,number|null][]).map(([label,used,limit])=>{
            const share=limit?Math.min(100,Math.round(used/limit*100)):0
            return <div key={label} style={{marginTop:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#334155"}}><span>{label}</span><strong>{used.toLocaleString("en-IN")}{limit!==null?` / ${limit.toLocaleString("en-IN")}`:" · unlimited"}</strong></div>
              {limit!==null&&<div style={{height:5,background:"#e9efed",borderRadius:3,marginTop:3}}><div style={{width:`${share}%`,height:"100%",borderRadius:3,background:share>=100?"#dc2626":share>=90?"#f59e0b":"#25d366"}}/></div>}
            </div>})}
        </article>}
        <article style={{...card,padding:18}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>Pay to</div>
          <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginTop:8}}>{data?.paymentDetails.payeeName}</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{data?.paymentDetails.upiId ? `UPI: ${data.paymentDetails.upiId}` : "UPI details not configured"}</div>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>GPay · PhonePe · Paytm · BHIM · any bank UPI app</div>
        </article>
      </section>

      {pending && !selectedInvoice && <section style={{...card,borderColor:"#f5d27a",background:"#fffbeb",padding:16,marginBottom:18,
        display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div style={{fontSize:13,color:"#78350f"}}>
          <strong>{pending.plan.name} ({pending.billingInterval === "ANNUAL" ? "yearly" : "monthly"})</strong> — invoice {pending.invoice.invoiceNumber} for <strong>{formatInr(pending.invoice.total)}</strong>{" "}
          {pendingReviewed ? "is being verified. Your plan activates once it's approved." : "is waiting for payment."}
        </div>
        {!pendingReviewed && <button onClick={() => setSelectedInvoice(pending.invoice)} style={primary}>Pay now with UPI</button>}
      </section>}

      {selectedInvoice && <section ref={payRef} style={{...card,borderColor:"#b9d9d1",padding:20,marginBottom:18,scrollMarginTop:80}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:14}}>
          <div>
            <h2 style={{fontFamily:"Sora,sans-serif",fontSize:16,margin:"0 0 4px",color:"#102a2a"}}>Pay invoice {selectedInvoice.invoiceNumber}</h2>
            <div style={{fontSize:13,color:"#64748b"}}>Total including GST: <strong style={{color:"#102a2a",fontSize:16}}>{formatInr(selectedInvoice.total)}</strong></div>
          </div>
          <button onClick={() => setSelectedInvoice(null)} style={{background:"none",border:0,color:"#64748b",fontSize:12,cursor:"pointer"}}>Close ✕</button>
        </div>
        {!data?.paymentDetails.upiId ? <p style={{fontSize:13,color:"#9f2d22"}}>UPI payments aren&apos;t set up yet. Please contact support to pay this invoice.</p> :
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,250px),1fr))",gap:24}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#075e54",marginBottom:8}}>1. Scan &amp; pay</div>
            {qr && <img src={qr} alt={`UPI QR code to pay invoice ${selectedInvoice.invoiceNumber}`} width={220} height={220}
              style={{display:"block",border:"1px solid #e2e8f0",padding:8,borderRadius:8,background:"#fff"}} />}
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,fontSize:12,color:"#49615e",flexWrap:"wrap"}}>
              UPI ID: <strong>{data.paymentDetails.upiId}</strong>
              <button type="button" onClick={copyUpi} style={{border:"1px solid #cbd5d3",background:"#fff",borderRadius:5,padding:"3px 8px",fontSize:11,cursor:"pointer"}}>{copied ? "Copied ✓" : "Copy"}</button>
            </div>
            <a href={upiLink(data.paymentDetails, selectedInvoice)} style={{display:"inline-block",marginTop:10,color:"#087763",fontSize:12,fontWeight:700}}>
              On your phone? Open UPI app →</a>
            <p style={{fontSize:11,color:"#71817e",lineHeight:1.5,margin:"10px 0 0"}}>The amount and invoice number are filled in automatically. Please don&apos;t change the amount.</p>
          </div>
          <form onSubmit={submitPayment}>
            <div style={{fontSize:12,fontWeight:700,color:"#075e54",marginBottom:8}}>2. Enter the payment reference</div>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:"#526763",marginBottom:7}} htmlFor="txn-id">UPI transaction ID / UTR number</label>
            <input id="txn-id" required minLength={4} maxLength={120} value={transactionId} placeholder="e.g. 429183746512" inputMode="text"
              onChange={event => setTransactionId(event.target.value)} style={inputStyle} />
            <p style={{fontSize:11,lineHeight:1.5,color:"#71817e"}}>You&apos;ll find the 12-digit UTR / UPI reference in your UPI app&apos;s payment details. We match it with our bank account and activate your plan — usually within a few hours, at most 24.</p>
            <button type="submit" disabled={submittingPayment || transactionId.trim().length < 4}
              style={{...primary,opacity:submittingPayment || transactionId.trim().length < 4 ? .6 : 1}}>{submittingPayment ? "Submitting…" : "I have paid — submit reference"}</button>
            <div style={{marginTop:12}}><a href={`/api/billing/invoices/${selectedInvoice.id}`} style={{color:"#087763",fontSize:12,fontWeight:700}}>Download invoice PDF</a></div>
          </form>
        </div>}
      </section>}

      {!profileComplete && profileSection}

      <section style={{marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:12}}>
          <h2 style={{fontFamily:"Sora,sans-serif",fontSize:16,margin:0,color:"#102a2a"}}>Plans</h2>
          {anyAnnual && <div role="radiogroup" aria-label="Billing period" style={{display:"inline-flex",background:"#e9efed",borderRadius:20,padding:3}}>
            {(["MONTHLY","ANNUAL"] as Interval[]).map(option => <button key={option} role="radio" aria-checked={period === option} onClick={() => setPeriod(option)}
              style={{border:0,borderRadius:18,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",
                background:period === option ? "#075e54" : "transparent",color:period === option ? "#fff" : "#49615e"}}>
              {option === "MONTHLY" ? "Monthly" : "Yearly · 2 months free"}</button>)}
          </div>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:12}}>
          {data?.plans.map(plan => {
            const current = subscription?.plan.id === plan.id && ["ACTIVE","TRIAL"].includes(subscription.status)
            const yearly = period === "ANNUAL" && Number(plan.annualPrice) > 0
            const action = planAction(plan)
            const unavailable = period === "ANNUAL" && !yearly
            return <article key={plan.id} style={{...card,border:`1px solid ${current ? "#0e8b71" : "#e2e8f0"}`,padding:18,display:"flex",flexDirection:"column",minHeight:200}}>
              <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"space-between"}}>
                <span style={{fontSize:14,fontWeight:700,color:"#183633"}}>{plan.name}</span>
                {current && <Chip status={subscription!.status} />}
              </div>
              <div style={{fontFamily:"Sora,sans-serif",fontSize:24,fontWeight:800,color:"#075e54",marginTop:9}}>
                {formatInr(yearly ? plan.annualPrice! : plan.monthlyPrice)}<span style={{fontFamily:"DM Sans,sans-serif",fontSize:11,fontWeight:500,color:"#64748b"}}>/{yearly ? "year" : "month"} + GST</span>
              </div>
              {yearly && <div style={{fontSize:11,color:"#168253",fontWeight:700,marginTop:2}}>
                ≈ {formatInr(Number(plan.annualPrice) / 12)}/month · save {formatInr(Number(plan.monthlyPrice) * 12 - Number(plan.annualPrice))}</div>}
              <div style={{fontSize:11,color:"#64748b",lineHeight:1.6,marginTop:8,flex:1}}>
                {plan.maxUsers ?? "Unlimited"} users · {plan.maxPhoneNumbers ?? "Unlimited"} phone numbers · {plan.maxMessages ? Number(plan.maxMessages).toLocaleString("en-IN") : "Unlimited"} messages
              </div>
              <button onClick={() => pending && pending.plan.id === plan.id && pending.billingInterval === period ? setSelectedInvoice(pending.invoice) : buyPlan(plan)}
                disabled={action.disabled || unavailable || Boolean(busyPlan)}
                style={{marginTop:12,border:0,borderRadius:6,padding:"9px 12px",background:action.disabled || unavailable ? "#e9efed" : "#075e54",
                  color:action.disabled || unavailable ? "#49615e" : "#fff",fontWeight:700,fontSize:12,cursor:action.disabled || unavailable ? "default" : "pointer"}}>
                {busyPlan === plan.id ? "Creating invoice…" : unavailable ? "Monthly only" : action.label}
              </button>
            </article>
          })}
        </div>
        <p style={{fontSize:11,color:"#71817e",margin:"10px 0 0"}}>Prices exclude GST (added on the invoice). Your current plan keeps working until the new one is paid and activated.</p>
      </section>

      <MessagingCosts refreshKey={refresh} onInvoice={invoice=>{
        setNotice(`Invoice ${invoice.invoiceNumber} created. Scan the QR code below to pay; credits are added once the payment is approved.`)
        setSelectedInvoice({ id:invoice.id, invoiceNumber:invoice.invoiceNumber, total:invoice.total, amount:0, tax:0, status:"DUE", issuedAt:new Date().toISOString() })
        setRefresh(value=>value+1)
      }}/>

      {profileComplete && profileSection}


      <section style={{...card,overflow:"hidden",marginBottom:18}}>
        <div style={{padding:"15px 18px",borderBottom:"1px solid #e8efee"}}>
          <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0,color:"#102a2a"}}>Invoices</h2>
        </div>
        {data?.invoices.length ? <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
          <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>
            <th style={{padding:11}}>Invoice</th><th style={{padding:11}}>Date</th><th style={{padding:11}}>Total</th><th style={{padding:11}}>Status</th><th style={{padding:11}}>Actions</th>
          </tr></thead><tbody>{data.invoices.map(invoice => <tr key={invoice.id} style={{borderTop:"1px solid #edf1f0"}}>
            <td style={{padding:11}}><div style={{fontWeight:700,color:"#183633"}}>{invoice.invoiceNumber}</div>
              {invoice.description && <div style={{color:"#71817e",marginTop:2}}>{invoice.description}</div>}</td>
            <td style={{padding:11,color:"#647b77"}}>{formatDate(invoice.issuedAt)}</td>
            <td style={{padding:11,color:"#183633"}}>{formatInr(invoice.total)}</td>
            <td style={{padding:11}}><Chip status={invoice.status === "DUE" && underReview.has(invoice.id) ? "PENDING" : invoice.status} /></td>
            <td style={{padding:11,whiteSpace:"nowrap"}}>
              <a href={`/api/billing/invoices/${invoice.id}`} style={{color:"#087763",fontWeight:700,textDecoration:"none",marginRight:12}}>⬇ PDF</a>
              {invoice.status === "DUE" && !underReview.has(invoice.id) && <button onClick={() => setSelectedInvoice(invoice)}
                style={{padding:0,border:0,background:"transparent",color:"#087763",fontWeight:700,cursor:"pointer"}}>Pay with UPI</button>}
            </td>
          </tr>)}</tbody></table></div> : <p style={{padding:18,fontSize:12,color:"#71817e"}}>No invoices yet. Choose a plan to create one.</p>}
      </section>

      <section style={{...card,overflow:"hidden"}}>
        <div style={{padding:"15px 18px",borderBottom:"1px solid #e8efee"}}><h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0,color:"#102a2a"}}>Payment history</h2></div>
        {data?.payments.length ? <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
          <thead style={{background:"#f7faf9",color:"#647b77"}}><tr><th style={{padding:11}}>Date</th><th style={{padding:11}}>Invoice</th><th style={{padding:11}}>Amount</th>
            <th style={{padding:11}}>Method</th><th style={{padding:11}}>Reference</th><th style={{padding:11}}>Status</th></tr></thead>
          <tbody>{data.payments.map(payment => <tr key={payment.id} style={{borderTop:"1px solid #edf1f0"}}>
            <td style={{padding:11,color:"#647b77"}}>{formatDate(payment.createdAt)}</td>
            <td style={{padding:11}}>{payment.invoice?.invoiceNumber || "-"}</td><td style={{padding:11}}>{formatInr(payment.amount)}</td>
            <td style={{padding:11}}>{payment.method}</td>
            <td style={{padding:11}}>{payment.transactionId || "-"}</td>
            <td style={{padding:11}}><Chip status={payment.status} />
              {payment.status === "REJECTED" && <div style={{color:"#991b1b",marginTop:4,maxWidth:260}}>{payment.rejectionReason || "Could not be verified."} You can pay again from the invoice.</div>}</td>
          </tr>)}</tbody></table></div> : <p style={{padding:18,fontSize:12,color:"#71817e"}}>No payments yet.</p>}
      </section>
    </div>
  )
}
