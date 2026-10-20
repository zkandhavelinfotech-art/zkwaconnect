"use client"
import { useEffect, useMemo, useState } from "react"
import { AD_TYPES, type AdType, type Location } from "@/lib/meta/ads"

type Options = {
  missingPermissions: string[]
  adAccounts: { id: string; name: string; currency: string; timezone: string | null; active: boolean }[]
  pages: { id: string; name: string; picture: string | null; instagram: { id: string; username: string | null; picture: string | null } | null }[]
  leadForms: { id: string; name: string; pageId: string }[]
  whatsappNumbers: { phoneNumber: string; displayName: string | null }[]
}
type Created = { campaignId: string; adSetId: string; adId: string; adsManagerUrl: string; status: "PAUSED" | "ACTIVE" }

const TYPE_ICONS: Record<AdType, string> = { WHATSAPP: "💬", INSTAGRAM_DIRECT: "📸", WEBSITE: "🌐", LEAD_FORM: "📝" }
const SPECIAL_LABELS: Record<string, string> = { NONE: "None", EMPLOYMENT: "Employment (jobs, recruitment)", HOUSING: "Housing (real estate)",
  FINANCIAL_PRODUCTS_SERVICES: "Financial products and services" }

const card: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(11,20,26,.06)", marginBottom: 16 }
const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "#0f172a", margin: "14px 0 6px" }
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 44, padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8,
  fontSize: 14, color: "#0f172a", background: "#f8fafc", fontFamily: "inherit" }
const hint: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 5, lineHeight: 1.5 }
const nextBtn: React.CSSProperties = { border: 0, borderRadius: 8, padding: "11px 18px", background: "#054640", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }

function localDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function compact(n: number) {
  return n >= 1e7 ? `${(n / 1e7).toFixed(1)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} L` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)
}

export default function CreateAdPage() {
  const [options, setOptions] = useState<Options | null>(null)
  const [loadError, setLoadError] = useState("")
  const [step, setStep] = useState(1)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [adType, setAdType] = useState<AdType>("WHATSAPP")
  // Targeting
  const [locations, setLocations] = useState<Location[]>([{ key: "IN", name: "India", type: "country" }])
  const [locationQuery, setLocationQuery] = useState("")
  const [locationResults, setLocationResults] = useState<Location[]>([])
  const [ageMin, setAgeMin] = useState(18)
  const [ageMax, setAgeMax] = useState(65)
  const [gender, setGender] = useState<"ALL" | "MALE" | "FEMALE">("ALL")
  const [platforms, setPlatforms] = useState<("facebook" | "instagram")[]>(["facebook", "instagram"])
  const [specialCategory, setSpecialCategory] = useState<"NONE" | "EMPLOYMENT" | "HOUSING" | "FINANCIAL_PRODUCTS_SERVICES">("NONE")
  // Budget
  const [adAccountId, setAdAccountId] = useState("")
  const [dailyBudget, setDailyBudget] = useState(300)
  const [startTime, setStartTime] = useState(localDateTime(new Date(Date.now() + 15 * 60_000)))
  const [endTime, setEndTime] = useState("")
  const [name, setName] = useState("")
  // Creative
  const [pageId, setPageId] = useState("")
  const [primaryText, setPrimaryText] = useState("")
  const [headline, setHeadline] = useState("")
  const [description, setDescription] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [callToAction, setCallToAction] = useState("WHATSAPP_MESSAGE")
  const [leadFormId, setLeadFormId] = useState("")
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null)
  const [previewOn, setPreviewOn] = useState<"facebook" | "instagram">("facebook")
  // Results
  const [estimate, setEstimate] = useState<{ lower: number | null; upper: number | null; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [created, setCreated] = useState<Created | null>(null)

  useEffect(() => {
    fetch("/api/meta/ads/create").then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not load your Meta ad accounts.")
      setOptions(body)
      setAdAccountId(body.adAccounts.find((item: Options["adAccounts"][number]) => item.active)?.id || body.adAccounts[0]?.id || "")
      setPageId(body.pages[0]?.id || "")
    }).catch(reason => setLoadError(reason instanceof Error ? reason.message : "Could not load your Meta ad accounts."))
  }, [])

  const type = AD_TYPES[adType]
  useEffect(() => { setCallToAction(type.ctas[0].value); if (adType === "INSTAGRAM_DIRECT") setPreviewOn("instagram") }, [adType]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setName(current => current || `${type.label} · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`) }, [type.label])

  const page = options?.pages.find(item => item.id === pageId)
  const account = options?.adAccounts.find(item => item.id === adAccountId)
  const pageForms = options?.leadForms.filter(form => form.pageId === pageId) || []
  const special = specialCategory !== "NONE"
  const targeting = useMemo(() => ({ locations, ageMin, ageMax, gender, platforms: adType === "INSTAGRAM_DIRECT" ? ["instagram" as const] : platforms, specialCategory }),
    [locations, ageMin, ageMax, gender, platforms, specialCategory, adType])

  // Location search (debounced).
  useEffect(() => {
    if (locationQuery.trim().length < 2) { setLocationResults([]); return }
    const timer = setTimeout(() => {
      fetch(`/api/meta/ads/locations?q=${encodeURIComponent(locationQuery.trim())}`).then(response => response.json())
        .then(body => setLocationResults(body.locations || [])).catch(() => setLocationResults([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [locationQuery])

  // Reach estimate (debounced).
  useEffect(() => {
    if (!adAccountId || !locations.length) return
    const timer = setTimeout(() => {
      fetch("/api/meta/ads/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adAccountId, adType, targeting }) })
        .then(async response => { const body = await response.json(); setEstimate(response.ok ? body : { lower: null, upper: null, error: body.error }) })
        .catch(() => setEstimate(null))
    }, 600)
    return () => clearTimeout(timer)
  }, [adAccountId, adType, targeting, locations.length])

  const stepValid: Record<number, string> = {
    1: "",
    2: !locations.length ? "Add at least one location." : ageMin > ageMax ? "Minimum age must be below maximum age." : !targeting.platforms.length ? "Pick at least one platform." : "",
    3: !adAccountId ? "Choose an ad account." : !(dailyBudget > 0) ? "Enter a daily budget." : name.trim().length < 2 ? "Name your campaign." :
      endTime && new Date(endTime) <= new Date(startTime) ? "End date must be after the start date." : "",
    4: !pageId ? "Choose a Facebook Page." : !image ? "Upload an ad image." : !primaryText.trim() ? "Write the ad text." :
      adType === "WEBSITE" && !/^https?:\/\/\S+\.\S+/.test(websiteUrl) ? "Add a valid website URL." : adType === "LEAD_FORM" && !leadFormId ? "Choose a Lead Form." :
      adType === "INSTAGRAM_DIRECT" && !page?.instagram ? "This Page has no linked Instagram account." : "",
  }
  function next(current: number) {
    if (stepValid[current]) { setError(stepValid[current]); return }
    setError(""); setDone(previous => new Set(previous).add(current)); setStep(current + 1)
  }

  function onImage(file: File | undefined) {
    if (!file) return
    if (!/^image\/(jpeg|png)$/.test(file.type)) { setError("Use a JPG or PNG image."); return }
    if (file.size > 5_000_000) { setError("Image must be 5 MB or smaller."); return }
    const reader = new FileReader()
    reader.onload = () => { setImage({ dataUrl: String(reader.result), name: file.name }); setError("") }
    reader.readAsDataURL(file)
  }

  async function create() {
    const invalid = [2, 3, 4].map(n => stepValid[n]).find(Boolean)
    if (invalid) { setError(invalid); return }
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/meta/ads/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        adType, name, adAccountId, pageId, instagramUserId: page?.instagram?.id || "", targeting, dailyBudget,
        startTime: new Date(startTime).toISOString(), endTime: endTime ? new Date(endTime).toISOString() : "",
        creative: { primaryText, headline, description, websiteUrl, callToAction, leadFormId, imageBase64: image!.dataUrl, imageName: image!.name },
      }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Meta couldn't create the ad.")
      setCreated({ ...body, status: "PAUSED" })
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Meta couldn't create the ad.") }
    finally { setBusy(false) }
  }

  async function setLive(action: "activate" | "pause") {
    if (!created) return
    if (action === "activate" && !window.confirm(`Activate this ad? It will start spending up to ${account?.currency || "₹"} ${dailyBudget} per day once Meta approves it.`)) return
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/meta/ads/create", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: created.campaignId, adSetId: created.adSetId, adId: created.adId, action }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Couldn't change the ad status.")
      setCreated({ ...created, status: body.status })
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn't change the ad status.") }
    finally { setBusy(false) }
  }

  // A render function, not a component: defining a component here would remount inputs and drop focus on every keystroke.
  const renderStep = ({ n, title, subtitle, children }: { n: number; title: string; subtitle: string; children: React.ReactNode }) => {
    const open = step === n
    const complete = done.has(n) && !open
    return <section style={{ ...card, borderBottom: open ? "3px solid #25D366" : card.border as string }}>
      <button type="button" onClick={() => (done.has(n) || n <= step) && setStep(n)} style={{ display: "flex", gap: 14, alignItems: "flex-start", width: "100%",
        textAlign: "left", background: "none", border: 0, padding: "20px 22px", cursor: done.has(n) || n <= step ? "pointer" : "default" }}>
        <span style={{ position: "relative", width: 34, height: 34, borderRadius: 8, border: "1.5px solid #054640", display: "grid", placeItems: "center",
          fontSize: 14, color: "#054640", flexShrink: 0 }}>{n}
          {complete && <span style={{ position: "absolute", right: -7, bottom: -7, width: 18, height: 18, borderRadius: "50%", background: "#25D366", color: "#fff",
            fontSize: 11, display: "grid", placeItems: "center", border: "2px solid #fff" }}>✓</span>}</span>
        <span><span style={{ display: "block", fontSize: 17, color: "#0f172a", fontWeight: 600 }}>{title}</span>
          <span style={{ display: "block", fontSize: 13, color: "#64748b", marginTop: 3 }}>{subtitle}</span></span>
      </button>
      {open && <div style={{ padding: "0 22px 22px" }}>{children}</div>}
    </section>
  }

  if (loadError) return <div style={{ ...card, padding: 24 }}>
    <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 20, margin: "0 0 8px" }}>Create New Ad</h1>
    <p style={{ fontSize: 14, color: "#b91c1c", margin: "0 0 14px" }}>{loadError}</p>
    <a href="/onboarding" style={{ ...nextBtn, textDecoration: "none", display: "inline-block" }}>Connect Facebook →</a>
  </div>
  if (!options) return <p style={{ fontSize: 13, color: "#64748b" }}>Loading your ad accounts and Pages from Meta…</p>

  const ctaLabel = type.ctas.find(item => item.value === callToAction)?.label || "Learn more"
  const domain = (() => { try { return new URL(websiteUrl).hostname.replace(/^www\./, "").toUpperCase() } catch { return "" } })()

  return <div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <a href="/app/ads" aria-label="Back to Ads Manager" style={{ fontSize: 22, color: "#054640", textDecoration: "none" }}>←</a>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 600, margin: 0 }}>Create New Ad</h1>
    </div>

    {options.missingPermissions.length > 0 && <div style={{ ...card, padding: 16, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 13 }}>
      <strong>Reconnect Facebook to create ads.</strong> ZKWAConnect needs extra permission ({options.missingPermissions.join(", ")}).{" "}
      <a href="/onboarding/meta-connect" style={{ color: "#92400e", fontWeight: 700 }}>Reconnect now →</a></div>}
    {!options.adAccounts.length && <div style={{ ...card, padding: 16, fontSize: 13, color: "#475569" }}>
      No ad accounts found for your Facebook login. Create one in{" "}
      <a href="https://business.facebook.com/settings/ad-accounts" target="_blank" rel="noreferrer" style={{ color: "#1877F2", fontWeight: 700 }}>Meta Business Settings ↗</a>, add a payment method, then reload.</div>}
    {created && <div style={{ ...card, padding: 18, border: "1.5px solid #bbf7d0", background: "#f0fdf4" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#14532d" }}>{created.status === "ACTIVE" ? "✓ Your ad is active" : "✓ Ad created — paused"}</div>
      <p style={{ fontSize: 13, color: "#166534", margin: "6px 0 12px" }}>{created.status === "ACTIVE"
        ? "Meta reviews new ads (usually within 24 hours). Delivery starts after approval."
        : "Nothing is being spent yet. Review it in Ads Manager, then activate when you're ready."}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {created.status === "PAUSED"
          ? <button onClick={() => setLive("activate")} disabled={busy} style={{ ...nextBtn, background: "#25D366", color: "#053d36" }}>▶ Activate ad</button>
          : <button onClick={() => setLive("pause")} disabled={busy} style={nextBtn}>⏸ Pause ad</button>}
        <a href={created.adsManagerUrl} target="_blank" rel="noreferrer" style={{ ...nextBtn, background: "#fff", color: "#054640", border: "1px solid #bbf7d0", textDecoration: "none" }}>Open in Meta Ads Manager ↗</a>
        <a href="/app/ads" style={{ ...nextBtn, background: "#fff", color: "#054640", border: "1px solid #bbf7d0", textDecoration: "none" }}>Back to Ads Manager</a>
      </div>
    </div>}
    {error && <div role="alert" style={{ ...card, padding: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13 }}>{error}</div>}

    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 20, alignItems: "start" }} className="zk-ad-grid">
      <style>{`@media(max-width:1100px){.zk-ad-grid{grid-template-columns:minmax(0,1fr)!important}}`}</style>
      <div>
        {renderStep({ n: 1, title: "Where should people go after clicking your ad?", subtitle: "This choice determines the campaign setup and the results you can optimise for.", children: <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 14 }}>
            {(Object.keys(AD_TYPES) as AdType[]).map(key => {
              const on = adType === key
              return <button type="button" key={key} onClick={() => setAdType(key)} style={{ display: "flex", gap: 14, alignItems: "flex-start", textAlign: "left",
                padding: 18, borderRadius: 12, cursor: "pointer", background: on ? "#f0fdf4" : "#fff", border: `${on ? 2 : 1}px solid ${on ? "#054640" : "#e2e8f0"}` }}>
                <span style={{ fontSize: 22 }}>{TYPE_ICONS[key]}</span>
                <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{AD_TYPES[key].label}</span>
                  <span style={{ display: "block", fontSize: 13, color: "#64748b", marginTop: 4 }}>{AD_TYPES[key].description}</span></span>
                <span style={{ width: 22, height: 22, borderRadius: "50%", border: on ? 0 : "1.5px solid #cbd5e1", background: on ? "#054640" : "#fff", color: "#fff",
                  display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0 }}>{on ? "✓" : ""}</span>
              </button>
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 6 }}>
            <label><span style={label}>Ad objective</span><input readOnly value={type.objectiveLabel} style={{ ...field, color: "#64748b" }} /></label>
            <label><span style={label}>Performance goal</span><input readOnly value={type.goalLabel} style={field} /></label>
          </div>
          {adType === "WHATSAPP" && <p style={hint}>Customers tap the ad and land in a WhatsApp chat with your business number
            {options.whatsappNumbers[0] ? ` (${options.whatsappNumbers[0].phoneNumber})` : ""}. Your Facebook Page must be linked to that WhatsApp number in Meta.</p>}
          <div style={{ textAlign: "right", marginTop: 18 }}><button type="button" onClick={() => next(1)} style={nextBtn}>Next →</button></div>
        </> })}

        {renderStep({ n: 2, title: "Ad Targeting & Audience", subtitle: "Select geo location in which you would like to advertise. Select gender and age group of your audience.", children: <>
          <label style={label}>Locations</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {locations.map(item => <span key={item.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#dcf8c6", color: "#054640",
              borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>{item.name}
              <button type="button" aria-label={`Remove ${item.name}`} onClick={() => setLocations(current => current.filter(other => other.key !== item.key))}
                style={{ border: 0, background: "none", cursor: "pointer", color: "#054640", padding: 0 }}>✕</button></span>)}
          </div>
          <div style={{ position: "relative" }}>
            <input value={locationQuery} onChange={event => setLocationQuery(event.target.value)} placeholder="Search a country, state or city (e.g. Chennai)" style={field} />
            {locationResults.length > 0 && <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 5, background: "#fff", border: "1px solid #e2e8f0",
              borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,.12)", marginTop: 4, maxHeight: 260, overflowY: "auto" }}>
              {locationResults.map(item => <button type="button" key={item.key} onClick={() => {
                setLocations(current => current.some(other => other.key === item.key) ? current : [...current, item]); setLocationQuery(""); setLocationResults([])
              }} style={{ display: "flex", justifyContent: "space-between", width: "100%", textAlign: "left", border: 0, background: "none", padding: "10px 12px", cursor: "pointer", fontSize: 13 }}>
                <span>{item.name}</span><span style={{ color: "#94a3b8", fontSize: 11, textTransform: "capitalize" }}>{item.type}</span></button>)}
            </div>}
          </div>
          <label style={label}>Special ad category</label>
          <select value={specialCategory} onChange={event => setSpecialCategory(event.target.value as typeof specialCategory)} style={field}>
            {Object.entries(SPECIAL_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          {special && <p style={hint}>Meta requires this for jobs, housing and credit ads. Age and gender targeting are not allowed, and cities use a 25 km radius.</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,160px),1fr))", gap: 12 }}>
            <label><span style={label}>Minimum age</span><select disabled={special} value={ageMin} onChange={event => setAgeMin(Number(event.target.value))} style={field}>
              {Array.from({ length: 48 }, (_, i) => i + 18).map(age => <option key={age} value={age}>{age}</option>)}</select></label>
            <label><span style={label}>Maximum age</span><select disabled={special} value={ageMax} onChange={event => setAgeMax(Number(event.target.value))} style={field}>
              {Array.from({ length: 48 }, (_, i) => i + 18).map(age => <option key={age} value={age}>{age === 65 ? "65+" : age}</option>)}</select></label>
            <label><span style={label}>Gender</span><select disabled={special} value={gender} onChange={event => setGender(event.target.value as typeof gender)} style={field}>
              <option value="ALL">All</option><option value="MALE">Men</option><option value="FEMALE">Women</option></select></label>
          </div>
          <label style={label}>Show on</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(["facebook", "instagram"] as const).map(platform => {
              const forcedIg = adType === "INSTAGRAM_DIRECT"
              const on = forcedIg ? platform === "instagram" : platforms.includes(platform)
              return <label key={platform} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, fontSize: 14, cursor: forcedIg ? "default" : "pointer",
                border: `1.5px solid ${on ? "#054640" : "#e2e8f0"}`, background: on ? "#f0fdf4" : "#fff" }}>
                <input type="checkbox" checked={on} disabled={forcedIg} onChange={() => setPlatforms(current => current.includes(platform) ? current.filter(item => item !== platform) : [...current, platform])} />
                {platform === "facebook" ? "Facebook" : "Instagram"}</label>
            })}
          </div>
          <div style={{ textAlign: "right", marginTop: 18 }}><button type="button" onClick={() => next(2)} style={nextBtn}>Next →</button></div>
        </> })}

        {renderStep({ n: 3, title: "Ad Budget", subtitle: "Select the daily budget you would like to spend on the ad and the time period it will run.", children: <>
          <label style={label}>Ad account</label>
          <select value={adAccountId} onChange={event => setAdAccountId(event.target.value)} style={field}>
            {options.adAccounts.map(item => <option key={item.id} value={item.id}>{item.name} · {item.currency}{item.active ? "" : " (inactive)"}</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 12 }}>
            <label><span style={label}>Daily budget ({account?.currency || "INR"})</span>
              <input type="number" min={1} step={1} value={dailyBudget} onChange={event => setDailyBudget(Number(event.target.value))} style={field} /></label>
            <label><span style={label}>Start</span><input type="datetime-local" value={startTime} onChange={event => setStartTime(event.target.value)} style={field} /></label>
            <label><span style={label}>End (optional)</span><input type="datetime-local" value={endTime} onChange={event => setEndTime(event.target.value)} style={field} /></label>
          </div>
          <p style={hint}>{endTime ? `Runs about ${Math.max(1, Math.ceil((new Date(endTime).getTime() - new Date(startTime).getTime()) / 86_400_000))} day(s) — up to ${account?.currency || "INR"} ${(dailyBudget * Math.max(1, Math.ceil((new Date(endTime).getTime() - new Date(startTime).getTime()) / 86_400_000))).toLocaleString()} in total.`
            : "Runs until you pause it. Meta may spend up to 75% more on a good day, but never more than 7× the daily budget in a week."}</p>
          <label style={label}>Campaign name</label>
          <input value={name} maxLength={120} onChange={event => setName(event.target.value)} style={field} />
          <div style={{ textAlign: "right", marginTop: 18 }}><button type="button" onClick={() => next(3)} style={nextBtn}>Next →</button></div>
        </> })}

        {renderStep({ n: 4, title: "Ad Creative", subtitle: "Provide details to create the ad creative. Your ad will look like the preview.", children: <>
          <label style={label}>Facebook Page</label>
          <select value={pageId} onChange={event => { setPageId(event.target.value); setLeadFormId("") }} style={field}>
            {options.pages.length ? options.pages.map(item => <option key={item.id} value={item.id}>{item.name}{item.instagram?.username ? ` · @${item.instagram.username}` : ""}</option>)
              : <option value="">No Pages found</option>}
          </select>
          {(adType === "INSTAGRAM_DIRECT" || platforms.includes("instagram")) && <p style={hint}>{page?.instagram
            ? `Instagram: @${page.instagram.username || page.instagram.id}` : "This Page has no linked Instagram account — Instagram placements will use the Page's name."}</p>}
          <label style={label}>Ad image</label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 90, border: "1.5px dashed #94a3b8", borderRadius: 10,
            cursor: "pointer", background: "#f8fafc", fontSize: 13, color: "#475569" }}>
            <input type="file" accept="image/jpeg,image/png" onChange={event => onImage(event.target.files?.[0])} style={{ display: "none" }} />
            {image ? <>🖼️ {image.name} · <strong style={{ color: "#054640" }}>Change</strong></> : <>⬆ Upload a JPG or PNG (1080×1080 recommended, max 5 MB)</>}
          </label>
          <label style={label}>Primary text</label>
          <textarea rows={3} maxLength={2000} value={primaryText} onChange={event => setPrimaryText(event.target.value)}
            placeholder="Looking for expert home care? Chat with us on WhatsApp for a free consultation." style={{ ...field, resize: "vertical" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 12 }}>
            <label><span style={label}>Headline</span><input maxLength={255} value={headline} onChange={event => setHeadline(event.target.value)} placeholder="Book a free consultation" style={field} /></label>
            <label><span style={label}>Button</span><select value={callToAction} onChange={event => setCallToAction(event.target.value)} style={field}>
              {type.ctas.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
          {adType === "WEBSITE" && <>
            <label style={label}>Website URL</label>
            <input value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value.trim())} placeholder="https://yourbusiness.com/offer" style={field} />
            <label style={label}>Description (optional)</label>
            <input maxLength={255} value={description} onChange={event => setDescription(event.target.value)} style={field} />
          </>}
          {adType === "LEAD_FORM" && <>
            <label style={label}>Lead Form</label>
            <select value={leadFormId} onChange={event => setLeadFormId(event.target.value)} style={field}>
              <option value="">{pageForms.length ? "Choose a form" : "This Page has no Lead Forms"}</option>
              {pageForms.map(form => <option key={form.id} value={form.id}>{form.name}</option>)}
            </select>
            <p style={hint}>Create forms in <a href="https://business.facebook.com/latest/instant_forms" target="_blank" rel="noreferrer" style={{ color: "#1877F2" }}>Meta Instant Forms ↗</a>.
              Leads appear in ZKWAConnect under Ads Manager → Lead Forms.</p>
          </>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Created paused — nothing is spent until you activate it.</span>
            <button type="button" onClick={create} disabled={busy || Boolean(created) || options.missingPermissions.length > 0 || !options.adAccounts.length}
              style={{ ...nextBtn, background: "#25D366", color: "#053d36", opacity: busy || created ? .6 : 1 }}>{busy ? "Creating on Meta…" : created ? "Created ✓" : "Create ad"}</button>
          </div>
        </> })}
      </div>

      {/* Preview and reach */}
      <aside style={{ position: "sticky", top: 76 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {(["facebook", "instagram"] as const).map(item => <button key={item} type="button" onClick={() => setPreviewOn(item)} style={{ flex: 1, padding: "8px 10px",
            borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${previewOn === item ? "#054640" : "#e2e8f0"}`,
            background: previewOn === item ? "#054640" : "#fff", color: previewOn === item ? "#fff" : "#475569" }}>{item === "facebook" ? "Facebook feed" : "Instagram feed"}</button>)}
        </div>
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
            {(previewOn === "instagram" ? page?.instagram?.picture : page?.picture) ? <img src={(previewOn === "instagram" ? page?.instagram?.picture : page?.picture)!} alt="" width={36} height={36} style={{ borderRadius: "50%" }} />
              : <span style={{ width: 36, height: 36, borderRadius: "50%", background: "#075E54", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>{(page?.name || "B")[0]}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {previewOn === "instagram" ? (page?.instagram?.username || page?.name || "yourbusiness") : (page?.name || "Your Business Page")}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Sponsored{previewOn === "facebook" ? " · 🌐" : ""}</div>
            </div>
            <span style={{ color: "#64748b" }}>•••</span>
          </div>
          {previewOn === "facebook" && <div style={{ padding: "0 14px 10px", fontSize: 14, color: primaryText ? "#0f172a" : "#94a3b8", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
            {primaryText || "Your primary text appears here"}</div>}
          <div style={{ aspectRatio: "1 / 1", background: "#f1f5f9", display: "grid", placeItems: "center" }}>
            {image ? <img src={image.dataUrl} alt="Ad preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 54, color: "#cbd5e1" }}>🖼️</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: previewOn === "instagram" ? "#fff" : "#f0f2f5",
            borderBottom: previewOn === "instagram" ? "1px solid #e2e8f0" : 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>{adType === "WEBSITE" ? domain || "YOURWEBSITE.COM" : adType === "LEAD_FORM" ? "Lead form" : adType === "WHATSAPP" ? "WhatsApp" : "Instagram"}</div>
              <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{headline || "Your headline"}</div>
            </div>
            <span style={{ border: adType === "WHATSAPP" ? 0 : "1px solid #cbd5e1", background: adType === "WHATSAPP" ? "#25D366" : "#fff", color: adType === "WHATSAPP" ? "#fff" : "#0f172a",
              borderRadius: 6, padding: "7px 12px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{adType === "WHATSAPP" ? "💬 " : ""}{ctaLabel}</span>
          </div>
          {previewOn === "instagram" && <div style={{ padding: "10px 14px 12px", fontSize: 13, color: primaryText ? "#0f172a" : "#94a3b8" }}>
            <strong>{page?.instagram?.username || page?.name || "yourbusiness"}</strong> {primaryText || "Your primary text appears here"}</div>}
          {previewOn === "facebook" && <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px", fontSize: 14, color: "#475569", borderTop: "1px solid #e2e8f0" }}>
            <span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span></div>}
        </div>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Estimated audience</div>
          <div style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 700, color: "#054640", margin: "8px 0 6px" }}>
            {estimate?.lower && estimate.upper ? `${compact(estimate.lower)} – ${compact(estimate.upper)}` : estimate?.error ? "—" : "Calculating…"}
            <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}> {estimate?.lower ? "monthly active people" : ""}</span></div>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{estimate?.error ? `Meta couldn't estimate this audience: ${estimate.error}`
            : "Estimates from Meta, based on your targeting. Actual results depend on budget, creative and competition."}</div>
        </div>
      </aside>
    </div>
  </div>
}
