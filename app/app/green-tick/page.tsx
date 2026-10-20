"use client"
import { useEffect, useState } from "react"

type Number = { id: string; phoneNumber: string; displayName: string | null; oba: { oba_status?: string; status_message?: string } | null
  info: { verified_name?: string; name_status?: string; quality_rating?: string; messaging_limit_tier?: string; is_official_business_account?: boolean; error?: string } }
type Data = { business: { name?: string; verification_status?: string; error?: string }; numbers: Number[] }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, marginBottom: 18 }
const input: React.CSSProperties = { boxSizing: "border-box", border: "1px solid #cbd5d3", borderRadius: 6, padding: "8px 10px", fontSize: 13, width: "100%" }

function Check({ ok, warn, children, hint }: { ok: boolean; warn?: boolean; children: React.ReactNode; hint?: string }) {
  return <li style={{ display: "flex", gap: 8, padding: "6px 0", fontSize: 13 }}>
    <span aria-hidden>{ok ? "✅" : warn ? "⚠️" : "❌"}</span><span><span style={{ color: "#183633" }}>{children}</span>{hint && !ok && <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>{hint}</span>}</span></li>
}

export default function GreenTickPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [form, setForm] = useState({ phoneId: "", website: "", country: "India", language: "English", parentBrand: "", links: ["", "", ""], additionalInfo: "" })
  const [busy, setBusy] = useState(false)

  const load = () => fetch("/api/green-tick").then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body)
    setForm(current => ({ ...current, phoneId: current.phoneId || body.numbers[0]?.id || "" })) }).catch(reason => setError(reason.message))
  useEffect(() => { load() }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/green-tick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneId: form.phoneId, website: form.website,
        country: form.country, language: form.language, parentBrand: form.parentBrand || undefined, supportingLinks: form.links.map(link => link.trim()).filter(Boolean), additionalInfo: form.additionalInfo || undefined }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setNotice(body.message); load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Failed") } finally { setBusy(false) }
  }

  const verified = data?.business.verification_status === "verified"
  return <div style={{ maxWidth: 900 }}>
    <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>✔️ Green tick (Official Business Account)</h1>
    <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 18px" }}>The green badge shows customers your WhatsApp number belongs to a notable, verified business. Meta decides who gets it — mainly brands that are well known
      and covered in independent news. Check your eligibility, then apply here.</p>
    {error && <div role="alert" style={{ padding: 11, background: "#fff1f0", color: "#9f2d22", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 11, background: "#eaf8f1", color: "#176b4b", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{notice}</div>}
    {!data ? !error && <p style={{ color: "#64748b" }}>Checking your account…</p> : <>
      {data.numbers.map(number => { const info = number.info, status = number.oba?.oba_status
        return <section key={number.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: 0 }}>{info.verified_name || number.displayName || "WhatsApp number"} · {number.phoneNumber}</h2>
            {info.is_official_business_account ? <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>✔ Green tick active</span>
              : status && status !== "NOT_STARTED" ? <span style={{ background: status === "REJECTED" ? "#fee2e2" : "#fef3c7", color: status === "REJECTED" ? "#991b1b" : "#92400e", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                Request {status.toLowerCase()}</span> : null}
          </div>
          {info.error ? <p style={{ fontSize: 12, color: "#92400e" }}>{info.error}</p> : <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
            <Check ok={verified} hint={data.business.error ? `Couldn't check: ${data.business.error}` : "Verify your business in Meta Business Settings → Security Centre (needs registration documents)."}>
              Business verification{data.business.name ? ` (${data.business.name})` : ""}: {data.business.verification_status || "unknown"}</Check>
            <Check ok={info.name_status === "APPROVED"} hint="Your display name must be approved by Meta and match your brand.">Display name status: {info.name_status?.toLowerCase().replace(/_/g, " ") || "unknown"}</Check>
            <Check ok={info.quality_rating === "GREEN"} warn={info.quality_rating === "YELLOW"} hint="Keep quality high: send messages people expect and make opting out easy.">Quality rating: {info.quality_rating?.toLowerCase() || "unknown"}</Check>
            <Check ok warn>Two-step verification PIN set on the number (check in WhatsApp Manager → Phone numbers → Settings)</Check>
          </ul>}
          {status === "REJECTED" && number.oba?.status_message && <p style={{ fontSize: 12, color: "#991b1b" }}>Meta&apos;s note: {number.oba.status_message} — you can reapply after 30 days with stronger press links.</p>}
        </section> })}

      <section style={card}>
        <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: "0 0 4px" }}>Apply</h2>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Tips that help approval: links to independent news coverage (not paid or press-release sites), a website that matches your display name, and a verified business.</p>
        {!verified && <p style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", borderRadius: 6, padding: "8px 10px" }}>Finish business verification first — Meta rejects unverified businesses.</p>}
        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#526763" }}>Number<select value={form.phoneId} onChange={event => setForm({ ...form, phoneId: event.target.value })} style={{ ...input, marginTop: 4 }}>
            {data.numbers.map(number => <option key={number.id} value={number.id}>{number.displayName || number.phoneNumber}</option>)}</select></label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#526763" }}>Website<input required type="url" placeholder="https://yourbrand.com" value={form.website} onChange={event => setForm({ ...form, website: event.target.value })} style={{ ...input, marginTop: 4 }} /></label>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#526763" }}>Main country<input required value={form.country} onChange={event => setForm({ ...form, country: event.target.value })} style={{ ...input, marginTop: 4 }} /></label>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#526763" }}>Main language<input required value={form.language} onChange={event => setForm({ ...form, language: event.target.value })} style={{ ...input, marginTop: 4 }} /></label>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#526763" }}>Parent brand (optional)<input value={form.parentBrand} onChange={event => setForm({ ...form, parentBrand: event.target.value })} style={{ ...input, marginTop: 4 }} /></label>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#526763" }}>News / press links about your business (1–5)</div>
          {form.links.map((link, index) => <input key={index} type="url" placeholder="https://news-site.com/article-about-you" value={link}
            onChange={event => setForm({ ...form, links: form.links.map((item, i) => i === index ? event.target.value : item) })} style={input} />)}
          {form.links.length < 5 && <button type="button" onClick={() => setForm({ ...form, links: [...form.links, ""] })} style={{ justifySelf: "start", border: 0, background: "none", color: "#075e54", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>+ Add link</button>}
          <label style={{ fontSize: 12, fontWeight: 700, color: "#526763" }}>Anything else Meta should know (optional)<textarea rows={3} maxLength={1000} value={form.additionalInfo}
            onChange={event => setForm({ ...form, additionalInfo: event.target.value })} style={{ ...input, marginTop: 4, fontFamily: "inherit" }} /></label>
          <button disabled={busy || !form.phoneId} type="submit" style={{ justifySelf: "start", border: 0, borderRadius: 6, padding: "10px 16px", background: "#075e54", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            {busy ? "Sending…" : "Send request to Meta"}</button>
        </form>
      </section>
    </>}
  </div>
}
