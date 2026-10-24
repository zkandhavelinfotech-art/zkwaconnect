"use client"
import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { UpiAppButtons } from "@/components/payments/UpiAppButtons"
import { upiAppLinks, upiUri } from "@/lib/payments/upi"

type Partner = { id: string; name: string; slug: string; status: string; model: "WHOLESALE" | "COMMISSION"; discountPercent: number; commissionPercent: number; walletBalance: number
  brandName: string | null; primaryColor: string | null; supportEmail: string | null; supportPhone: string | null; hidePoweredBy: boolean; customDomain: string | null; domainVerifiedAt: string | null; role: string }
type Client = { id: string; name: string; status: string; createdAt: string; subscription: { status: string; currentPeriodEnd: string | null; billingInterval: string; plan: { name: string } } | null
  owners: { name: string; email: string }[]; numbers: string[] }
type Plan = { id: string; name: string; monthlyPrice: number; annualPrice: number | null; wholesaleMonthly: number; wholesaleAnnual: number | null }
type Ledger = { id: string; type: string; amount: string | number; balanceAfter: string | number; description: string; createdAt: string }
type Topup = { id: string; invoiceNumber: string; total: string | number; status: string; issuedAt: string; payments: { status: string; transactionId: string | null }[] }
type Data = { partner: Partner | null; workspaces?: { id: string; name: string }[]; brand?: { logoUrl: string | null } | null; baseDomain: string; clients?: Client[]; ledger?: Ledger[]
  plans?: Plan[]; topups?: Topup[]; upi?: { upiId: string; payeeName: string }; cnameTarget?: string }

const page: React.CSSProperties = { minHeight: "100vh", background: "#f0f4f3", fontFamily: "DM Sans,system-ui,sans-serif", color: "#0f172a" }
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18, marginBottom: 16 }
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 40, padding: "8px 10px", border: "1px solid #cbd5d3", borderRadius: 6, fontSize: 13 }
const label: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#526763", margin: "10px 0 5px" }
const btn = (bg = "#075e54", color = "#fff"): React.CSSProperties => ({ border: bg === "#fff" ? "1px solid #cbd5d3" : 0, borderRadius: 6, padding: "9px 14px", background: bg, color, fontSize: 12, fontWeight: 700, cursor: "pointer" })
const inr = (value: number | string) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`

export default function PartnerPage() {
  const [data, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState<"clients" | "money" | "brand">("clients")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState("")
  const [apply, setApply] = useState({ organizationId: "", name: "", slug: "", note: "" })
  const [client, setClient] = useState({ name: "", ownerEmail: "" })
  const [invite, setInvite] = useState("")
  const [planFor, setPlanFor] = useState<{ id: string; planId: string; interval: "MONTHLY" | "ANNUAL" } | null>(null)
  const [topup, setTopup] = useState({ amount: "5000", invoice: null as null | { id: string; invoiceNumber: string; total: number }, utr: "", qr: "" })
  const [brand, setBrand] = useState({ brandName: "", primaryColor: "", supportEmail: "", supportPhone: "", hidePoweredBy: false, logo: "" })
  const [domain, setDomain] = useState("")

  async function load() {
    const response = await fetch("/api/partner")
    const body = await response.json()
    if (!response.ok) { setError(body.error); return }
    setData(body)
    if (body.partner) {
      setBrand({ brandName: body.partner.brandName || body.partner.name, primaryColor: body.partner.primaryColor || "", supportEmail: body.partner.supportEmail || "",
        supportPhone: body.partner.supportPhone || "", hidePoweredBy: body.partner.hidePoweredBy, logo: "" })
      setDomain(body.partner.customDomain || "")
    } else if (body.workspaces?.[0]) setApply(current => ({ ...current, organizationId: current.organizationId || body.workspaces[0].id }))
  }
  useEffect(() => { load() }, [])

  async function call(url: string, method: string, body: unknown, key: string) {
    setBusy(key); setError(""); setNotice("")
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) { setError(result.error || "Request failed."); return null }
      if (result.message) setNotice(result.message)
      load(); return result
    } finally { setBusy("") }
  }

  async function startTopup() {
    const result = await call("/api/partner/topup", "POST", { amount: Number(topup.amount) }, "topup")
    if (result && data?.upi?.upiId) setTopup(current => ({ ...current, invoice: result.invoice, qr: "" }))
    if (result && data?.upi?.upiId) QRCode.toDataURL(upiUri({ upiId: data.upi.upiId, payeeName: data.upi.payeeName, amount: result.invoice.total, note: `Invoice ${result.invoice.invoiceNumber}` }), { width: 200, margin: 1 })
      .then(qr => setTopup(current => ({ ...current, qr }))).catch(() => null)
  }
  function readLogo(file: File | undefined) {
    if (!file) return
    if (file.size > 500_000) { setError("Logo must be under 500 KB."); return }
    const reader = new FileReader(); reader.onload = () => setBrand(current => ({ ...current, logo: String(reader.result) })); reader.readAsDataURL(file)
  }

  const partner = data?.partner
  const color = partner?.primaryColor || "#075e54"

  return <div style={page}>
    <header style={{ background: color, color: "#fff", padding: "14px 16px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {data?.brand?.logoUrl ? <img src={data.brand.logoUrl} alt="" height={32} style={{ borderRadius: 6, background: "#fff" }} /> : <span style={{ fontSize: 22 }}>🤝</span>}
        <strong style={{ fontFamily: "Sora,sans-serif", fontSize: 17 }}>{partner ? `${partner.brandName || partner.name} · Partner panel` : "ZKWAConnect partner programme"}</strong>
        <a href="/projects" style={{ marginLeft: "auto", color: "#fff", fontSize: 13, opacity: .85 }}>All projects →</a>
      </div>
    </header>
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 40px" }}>
      {error && <div role="alert" style={{ padding: 11, background: "#fff1f0", color: "#9f2d22", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
      {notice && <div role="status" style={{ padding: 11, background: "#eaf8f1", color: "#176b4b", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{notice}</div>}
      {!data && !error && <div style={{ color: "#64748b" }}>Loading…</div>}

      {data && !partner && <section style={card}>
        <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 20, margin: "0 0 6px" }}>Become a partner</h1>
        <p style={{ fontSize: 13, color: "#475569", margin: "0 0 10px", lineHeight: 1.6 }}>Run WhatsApp for your clients under your own brand: your logo, colours and web address. Either buy client plans at a <strong>wholesale discount</strong> and bill clients yourself, or let clients pay us and earn a <strong>commission</strong> on every payment. We'll confirm which programme suits you when we approve your application.</p>
        <form onSubmit={event => { event.preventDefault(); call("/api/partner", "POST", apply, "apply") }} style={{ maxWidth: 480 }}>
          <label style={label}>Your agency workspace</label>
          <select required value={apply.organizationId} onChange={event => setApply({ ...apply, organizationId: event.target.value })} style={field}>
            {data.workspaces?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <label style={label}>Agency / brand name</label>
          <input required minLength={2} maxLength={80} value={apply.name} onChange={event => setApply({ ...apply, name: event.target.value, slug: apply.slug || event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) })} style={field} />
          <label style={label}>Your sub-domain</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><input required value={apply.slug} onChange={event => setApply({ ...apply, slug: event.target.value.toLowerCase() })} style={field} />
            <span style={{ fontSize: 13, color: "#64748b", whiteSpace: "nowrap" }}>.{data.baseDomain || "zkwaconnect.in"}</span></div>
          <label style={label}>About your business (optional)</label>
          <textarea rows={3} maxLength={500} value={apply.note} onChange={event => setApply({ ...apply, note: event.target.value })} style={field} placeholder="How many clients, which industries…" />
          <button type="submit" disabled={busy === "apply" || !data.workspaces?.length} style={{ ...btn(), marginTop: 12 }}>Apply</button>
          {!data.workspaces?.length && <p style={{ fontSize: 12, color: "#b45309" }}>Create your own workspace first (All projects → New project).</p>}
        </form>
      </section>}

      {partner && partner.status !== "ACTIVE" && <section style={card}>
        <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 20, margin: "0 0 6px" }}>{partner.status === "PENDING" ? "⏳ Application received" : "Partner account suspended"}</h1>
        <p style={{ fontSize: 13, color: "#475569" }}>{partner.status === "PENDING" ? "We'll review it shortly and switch on your partner panel." : "Please contact ZKWAConnect support."}</p>
      </section>}

      {partner?.status === "ACTIVE" && <>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ ...card, marginBottom: 0, flex: "1 1 200px" }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>CLIENTS</div><div style={{ fontSize: 24, fontWeight: 800 }}>{data?.clients?.length || 0}</div></div>
          <div style={{ ...card, marginBottom: 0, flex: "1 1 200px" }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{partner.model === "WHOLESALE" ? "WALLET" : "EARNINGS TO BE PAID"}</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{inr(partner.walletBalance)}</div></div>
          <div style={{ ...card, marginBottom: 0, flex: "1 1 200px" }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>PROGRAMME</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{partner.model === "WHOLESALE" ? `Wholesale · ${partner.discountPercent}% off list prices` : `Commission · ${partner.commissionPercent}% of client payments`}</div></div>
        </div>
        <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {([["clients", "Clients"], ["money", partner.model === "WHOLESALE" ? "Wallet" : "Earnings"], ["brand", "Branding & domain"]] as const).map(([key, text]) =>
            <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => setTab(key)} style={tab === key ? btn(color) : btn("#fff", "#334155")}>{text}</button>)}
        </div>

        {tab === "clients" && <>
          <section style={card}>
            <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Add a client</h2>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>Creates their workspace{partner.model === "WHOLESALE" ? " (7-day trial until you assign a plan)" : " with a 7-day trial; they then buy a plan and you earn commission"}. You stay an owner so you can set it up for them.</p>
            <form onSubmit={async event => { event.preventDefault(); const result = await call("/api/partner/clients", "POST", client, "client"); if (result) { setInvite(result.inviteUrl || ""); setClient({ name: "", ownerEmail: "" }) } }}
              style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ flex: "1 1 200px" }}><span style={label}>Business name</span><input required minLength={2} value={client.name} onChange={event => setClient({ ...client, name: event.target.value })} style={field} /></label>
              <label style={{ flex: "1 1 220px" }}><span style={label}>Client&apos;s email (optional — sends an invite)</span><input type="email" value={client.ownerEmail} onChange={event => setClient({ ...client, ownerEmail: event.target.value })} style={field} /></label>
              <button type="submit" disabled={busy === "client"} style={btn(color)}>Create client</button>
            </form>
            {invite && <div style={{ marginTop: 10, fontSize: 12, wordBreak: "break-all" }}>Invitation link (valid 7 days): <code>{invite}</code>{" "}
              <button type="button" onClick={() => navigator.clipboard?.writeText(invite)} style={btn("#fff", "#075e54")}>Copy</button></div>}
          </section>
          <section style={{ ...card, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead style={{ background: "#f7faf9", color: "#647b77", fontSize: 12 }}><tr>{["Client", "Plan", "Until", "Owner", "WhatsApp", ""].map(text => <th key={text} style={{ padding: 11, fontWeight: 600 }}>{text}</th>)}</tr></thead>
              <tbody>{data?.clients?.map(item => <tr key={item.id} style={{ borderTop: "1px solid #edf1f0", verticalAlign: "top" }}>
                <td style={{ padding: 11, fontWeight: 700 }}>{item.name}</td>
                <td style={{ padding: 11 }}>{item.subscription ? `${item.subscription.plan.name} · ${item.subscription.status.toLowerCase()}` : "Free"}</td>
                <td style={{ padding: 11 }}>{item.subscription?.currentPeriodEnd ? new Date(item.subscription.currentPeriodEnd).toLocaleDateString("en-IN") : "-"}</td>
                <td style={{ padding: 11 }}>{item.owners.filter(owner => owner.email).map(owner => owner.email).join(", ") || "-"}</td>
                <td style={{ padding: 11 }}>{item.numbers.join(", ") || "Not connected"}</td>
                <td style={{ padding: 11 }}>{partner.model === "WHOLESALE" && (planFor?.id === item.id
                  ? <div style={{ display: "grid", gap: 6, minWidth: 220 }}>
                      <select aria-label="Plan" value={planFor.planId} onChange={event => setPlanFor({ ...planFor, planId: event.target.value })} style={field}>
                        {data?.plans?.map(plan => <option key={plan.id} value={plan.id}>{plan.name} — {inr(planFor.interval === "ANNUAL" ? plan.wholesaleAnnual ?? 0 : plan.wholesaleMonthly)} (list {inr(planFor.interval === "ANNUAL" ? plan.annualPrice ?? 0 : plan.monthlyPrice)})</option>)}</select>
                      <select aria-label="Billing period" value={planFor.interval} onChange={event => setPlanFor({ ...planFor, interval: event.target.value as "MONTHLY" | "ANNUAL" })} style={field}><option value="MONTHLY">1 month</option><option value="ANNUAL">12 months</option></select>
                      <div style={{ display: "flex", gap: 6 }}><button type="button" disabled={busy === item.id} onClick={async () => { if (await call("/api/partner/clients", "PUT", { organizationId: item.id, planId: planFor.planId, interval: planFor.interval }, item.id)) setPlanFor(null) }} style={btn(color)}>Pay from wallet</button>
                        <button type="button" onClick={() => setPlanFor(null)} style={btn("#fff", "#475569")}>Cancel</button></div>
                    </div>
                  : <button type="button" onClick={() => setPlanFor({ id: item.id, planId: data?.plans?.[0]?.id || "", interval: "MONTHLY" })} style={btn("#fff", "#075e54")}>Buy / renew plan</button>)}</td>
              </tr>)}</tbody>
            </table>
            {!data?.clients?.length && <div style={{ padding: 16, fontSize: 13, color: "#64748b" }}>No clients yet.</div>}
          </section>
        </>}

        {tab === "money" && <>
          {partner.model === "WHOLESALE" && <section style={card}>
            <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Top up wallet</h2>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>You get a GST invoice; the amount before GST is added to your wallet once the UPI payment is confirmed.</p>
            {!topup.invoice ? <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label><span style={label}>Amount (₹, before GST)</span><input type="number" min={500} step={100} value={topup.amount} onChange={event => setTopup({ ...topup, amount: event.target.value })} style={{ ...field, width: 160 }} /></label>
              <button type="button" disabled={busy === "topup"} onClick={startTopup} style={btn(color)}>Create invoice</button>
            </div> : <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))" }}>
              <div>
                <div style={{ fontSize: 13 }}>Invoice <strong>{topup.invoice.invoiceNumber}</strong> · pay <strong>{inr(topup.invoice.total)}</strong> to {data?.upi?.upiId}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {topup.qr && <img src={topup.qr} alt="UPI QR code" width={180} height={180} style={{ marginTop: 8, border: "1px solid #e2e8f0", borderRadius: 8 }} />}
                {data?.upi?.upiId && <div style={{ marginTop: 8 }}><UpiAppButtons links={upiAppLinks({ upiId: data.upi.upiId, payeeName: data.upi.payeeName, amount: topup.invoice.total, note: `Invoice ${topup.invoice.invoiceNumber}` })} /></div>}
              </div>
              <form onSubmit={async event => { event.preventDefault(); if (await call("/api/partner/topup", "PUT", { invoiceId: topup.invoice!.id, utr: topup.utr }, "utr")) setTopup({ amount: "5000", invoice: null, utr: "", qr: "" }) }}>
                <label style={label}>UTR / UPI reference after paying</label>
                <input required value={topup.utr} onChange={event => setTopup({ ...topup, utr: event.target.value })} placeholder="12-digit number" style={{ ...field, fontFamily: "monospace" }} />
                <button type="submit" disabled={busy === "utr"} style={{ ...btn(color), marginTop: 8 }}>I&apos;ve paid — submit UTR</button>
              </form>
            </div>}
            {!!data?.topups?.length && <div style={{ marginTop: 12, fontSize: 12, color: "#475569" }}>{data.topups.map(item => <div key={item.id}>{item.invoiceNumber} · {inr(item.total)} · {item.status === "PAID" ? "✅ credited" : item.payments[0]?.status === "PENDING" ? "⏳ being verified" : "waiting for payment"}</div>)}</div>}
          </section>}
          {partner.model === "COMMISSION" && <section style={card}>
            <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Commission</h2>
            <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>You earn {partner.commissionPercent}% of every plan payment (before GST) your clients make, including automatic renewals. We pay out your balance monthly to your bank / UPI — contact us for payout details.</p>
          </section>}
          <section style={{ ...card, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead style={{ background: "#f7faf9", color: "#647b77", fontSize: 12 }}><tr>{["Date", "What", "Amount", "Balance"].map(text => <th key={text} style={{ padding: 11, fontWeight: 600 }}>{text}</th>)}</tr></thead>
              <tbody>{data?.ledger?.map(row => <tr key={row.id} style={{ borderTop: "1px solid #edf1f0" }}>
                <td style={{ padding: 11 }}>{new Date(row.createdAt).toLocaleDateString("en-IN")}</td><td style={{ padding: 11 }}>{row.description}</td>
                <td style={{ padding: 11, color: Number(row.amount) < 0 ? "#b91c1c" : "#15803d", fontWeight: 700 }}>{Number(row.amount) < 0 ? "−" : "+"}{inr(Math.abs(Number(row.amount)))}</td><td style={{ padding: 11 }}>{inr(row.balanceAfter)}</td>
              </tr>)}</tbody>
            </table>
            {!data?.ledger?.length && <div style={{ padding: 16, fontSize: 13, color: "#64748b" }}>Nothing yet.</div>}
          </section>
        </>}

        {tab === "brand" && <>
          <section style={card}>
            <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Your brand</h2>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>Shown to your clients on the sign-in page at your web address and inside their workspace.</p>
            <form onSubmit={event => { event.preventDefault(); call("/api/partner/brand", "PUT", { ...brand, logo: brand.logo || undefined }, "brand") }} style={{ display: "grid", gap: 4, maxWidth: 520 }}>
              <label style={label}>Brand name</label><input required value={brand.brandName} onChange={event => setBrand({ ...brand, brandName: event.target.value })} style={field} />
              <label style={label}>Logo (PNG, JPG or WebP, under 500 KB)</label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => readLogo(event.target.files?.[0])} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {(brand.logo || data?.brand?.logoUrl) && <img src={brand.logo || data!.brand!.logoUrl!} alt="Logo preview" height={48} style={{ marginTop: 6, objectFit: "contain", alignSelf: "flex-start" }} />}
              <label style={label}>Main colour</label><div style={{ display: "flex", gap: 8 }}><input type="color" aria-label="Pick colour" value={brand.primaryColor || "#075e54"} onChange={event => setBrand({ ...brand, primaryColor: event.target.value })} />
                <input value={brand.primaryColor} placeholder="#075E54" onChange={event => setBrand({ ...brand, primaryColor: event.target.value })} style={field} /></div>
              <label style={label}>Support email</label><input type="email" value={brand.supportEmail} onChange={event => setBrand({ ...brand, supportEmail: event.target.value })} style={field} />
              <label style={label}>Support WhatsApp / phone</label><input value={brand.supportPhone} onChange={event => setBrand({ ...brand, supportPhone: event.target.value })} style={field} />
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 10 }}><input type="checkbox" checked={brand.hidePoweredBy} onChange={event => setBrand({ ...brand, hidePoweredBy: event.target.checked })} /> Hide &quot;Powered by ZKWAConnect&quot;</label>
              <button type="submit" disabled={busy === "brand"} style={{ ...btn(color), marginTop: 10, justifySelf: "start" }}>Save branding</button>
            </form>
          </section>
          <section style={card}>
            <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Web address</h2>
            {data?.baseDomain ? <div style={{ fontSize: 13, marginBottom: 12 }}>Your sub-domain: <a href={`https://${partner.slug}.${data.baseDomain}/login`} target="_blank" rel="noreferrer" style={{ color: "#075e54", fontWeight: 700 }}>https://{partner.slug}.{data.baseDomain}</a></div>
              : <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>Sub-domains are being set up — use your own domain below meanwhile.</div>}
            <label style={label}>Your own domain (optional)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input value={domain} placeholder="app.youragency.com" onChange={event => setDomain(event.target.value)} style={{ ...field, flex: "1 1 220px" }} />
              <button type="button" disabled={busy === "domain"} onClick={() => call("/api/partner/brand", "POST", { action: "save", domain }, "domain")} style={btn("#fff", "#075e54")}>Save</button>
              {partner.customDomain && <button type="button" disabled={busy === "verify"} onClick={() => call("/api/partner/brand", "POST", { action: "verify" }, "verify")} style={btn(color)}>Verify</button>}</div>
            {partner.customDomain && <div style={{ fontSize: 12, color: "#475569", marginTop: 8, lineHeight: 1.6 }}>{partner.domainVerifiedAt ? "✅ Verified." : <>In your domain&apos;s DNS, add a <strong>CNAME</strong> record: <code>{partner.customDomain}</code> → <code>{data?.cnameTarget}</code>, then click Verify.</>}</div>}
          </section>
        </>}
      </>}
    </main>
  </div>
}
