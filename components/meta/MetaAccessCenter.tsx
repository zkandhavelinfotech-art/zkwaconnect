"use client"

import { useCallback, useEffect, useState } from "react"

type CheckStatus = "ready" | "action" | "manual" | "failed" | "unknown" | "optional"
type Check = { id: string; label: string; status: CheckStatus; detail: string; automated: boolean; action: string | null }
type Report = {
  organization: { id: string; name: string }
  overall: "ready" | "action_required" | "blocked"
  summary: string
  lastCheckedAt: string
  canManage: boolean
  ids: { appId: string | null; businessId: string | null; wabaId: string | null; agencyBusinessId: string | null }
  meta?: { wabaName: string; ownershipType: string | null; sharedWithPartners: boolean | null }
  checks: Check[]
  subscribedApps: { id: string; name: string }[]
  phones: { id: string; display: string; name: string | null; status: string; quality: string | null }[]
  links: { reconnect: string; wabaSettings?: string; partners?: string; appReview?: string }
}
type Step = { id: string; status: "success" | "failed" | "skipped"; message: string; resolution?: { title: string; action: string; code: number | null; subcode: number | null } }

const tones: Record<CheckStatus, { bg: string; border: string; color: string; label: string; icon: string }> = {
  ready: { bg: "#ecfdf5", border: "#a7f3d0", color: "#047857", label: "Ready", icon: "✓" },
  action: { bg: "#fffbeb", border: "#fde68a", color: "#b45309", label: "Action needed", icon: "!" },
  manual: { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8", label: "Owner action", icon: "↗" },
  failed: { bg: "#fef2f2", border: "#fecaca", color: "#b91c1c", label: "Failed", icon: "×" },
  unknown: { bg: "#f8fafc", border: "#e2e8f0", color: "#64748b", label: "Not verified", icon: "?" },
  optional: { bg: "#f8fafc", border: "#e2e8f0", color: "#64748b", label: "Optional", icon: "–" },
}
const actionMap: Record<string, string> = { subscription: "subscribe_app", userTasks: "assign_user", phones: "sync_assets" }

function Status({ value }: { value: CheckStatus }) {
  const tone = tones[value]
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
    <span aria-hidden>{tone.icon}</span>{tone.label}
  </span>
}

function CopyValue({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return <button type="button" onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) })}
    title={`Copy ${label}`} style={{ border: "1px solid #e2e8f0", background: "#fff", color: "#475569", borderRadius: 8, padding: "6px 9px", fontSize: 11, cursor: "pointer", textAlign: "left" }}>
    <span style={{ display: "block", color: "#94a3b8", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em" }}>{copied ? "Copied" : label}</span>
    <span style={{ fontFamily: "monospace" }}>{value}</span>
  </button>
}

export function MetaAccessCenter({ compact = false }: { compact?: boolean }) {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [steps, setSteps] = useState<Step[]>([])
  const [manualOpen, setManualOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch("/api/meta/access", { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not check Meta access.")
      setReport(body)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not check Meta access.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function repair(action: string) {
    setRunning(action); setError(""); setSteps([])
    try {
      const response = await fetch("/api/meta/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
      const body = await response.json()
      setSteps(body.steps || [])
      if (body.report) setReport({ ...body.report, canManage: report?.canManage ?? true })
      if (!response.ok && response.status !== 207) throw new Error(body.error || "Automatic repair could not finish.")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Automatic repair could not finish.") }
    finally { setRunning(null) }
  }

  if (!report) return <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24 }}>
    <div style={{ color: error ? "#b91c1c" : "#64748b", fontSize: 13 }}>{error || "Checking Meta access and outbound messaging…"}</div>
    {error && <button type="button" onClick={load} style={{ marginTop: 10 }}>Retry</button>}
  </section>

  const requiredChecks = report.checks.filter(item => item.status !== "optional")
  const ready = requiredChecks.filter(item => item.status === "ready").length
  const thirdParty = report.subscribedApps.filter(app => app.id !== report.ids.appId)
  const overallTone = report.overall === "ready" ? tones.ready : report.overall === "blocked" ? tones.failed : tones.action

  return <section style={{ background: "linear-gradient(145deg,#ffffff 0%,#f8fafc 100%)", border: "1px solid #dbe4ee", borderRadius: 18, overflow: "hidden", boxShadow: "0 8px 30px rgba(15,23,42,.05)" }}>
    <div style={{ padding: compact ? 20 : 24, borderBottom: "1px solid #e2e8f0", background: "radial-gradient(circle at 95% 0,#dcfce7 0,transparent 34%),#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "#075e54", color: "#fff", fontWeight: 900 }}>WA</span>
            <h2 style={{ margin: 0, fontFamily: "Sora,sans-serif", fontSize: compact ? 18 : 21, color: "#0f172a" }}>Permission access & outbound messaging</h2>
            <span style={{ background: overallTone.bg, border: `1px solid ${overallTone.border}`, color: overallTone.color, borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>
              {report.overall === "ready" ? "Operational" : report.overall === "blocked" ? "Blocked" : "Setup required"}
            </span>
          </div>
          <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.55, margin: "9px 0 0" }}>{report.summary} Each result below is checked against the currently connected workspace—nothing is tied to a fixed customer account.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={load} disabled={loading || Boolean(running)} style={{ border: "1px solid #cbd5e1", background: "#fff", color: "#334155", borderRadius: 9, padding: "9px 13px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{loading ? "Checking…" : "Refresh status"}</button>
          {report.canManage && <button type="button" onClick={() => repair("repair_all")} disabled={Boolean(running)} style={{ border: 0, background: "#075e54", color: "#fff", borderRadius: 9, padding: "9px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 5px 14px rgba(7,94,84,.18)" }}>{running === "repair_all" ? "Running repair…" : "Run automatic setup"}</button>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 17 }}>
        <div style={{ background: "#0f172a", color: "#fff", borderRadius: 9, padding: "7px 11px", fontSize: 11 }}><strong>{ready}/{requiredChecks.length}</strong> required checks ready</div>
        <CopyValue label="Business ID" value={report.ids.businessId} />
        <CopyValue label="WABA ID" value={report.ids.wabaId} />
        <CopyValue label="App ID" value={report.ids.appId} />
        <CopyValue label="Agency ID" value={report.ids.agencyBusinessId} />
      </div>
    </div>

    <div style={{ padding: compact ? 18 : 24 }}>
      {error && <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 10, padding: "10px 12px", fontSize: 12, marginBottom: 14 }}>{error}</div>}
      {steps.length > 0 && <div style={{ background: "#fff", border: "1px solid #dbe4ee", borderRadius: 12, padding: 13, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a", marginBottom: 7 }}>Latest automatic setup result</div>
        {steps.map(step => <div key={step.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderTop: "1px solid #f1f5f9", fontSize: 12, color: step.status === "success" ? "#047857" : "#b91c1c" }}>
          <strong>{step.status === "success" ? "✓" : "×"}</strong><span>{step.message}{step.resolution && <span style={{ display: "block", color: "#475569", marginTop: 2 }}>{step.resolution.action}{step.resolution.code ? ` (Code ${step.resolution.code}${step.resolution.subcode ? ` / ${step.resolution.subcode}` : ""})` : ""}</span>}</span>
        </div>)}
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,310px),1fr))", gap: 10 }}>
        {report.checks.map((check, index) => {
          const tone = tones[check.status]
          const action = actionMap[check.id]
          return <article key={check.id} style={{ background: "#fff", border: `1px solid ${check.status === "ready" ? "#e2e8f0" : tone.border}`, borderRadius: 12, padding: 14, minHeight: 116 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 9, alignItems: "center" }}><span style={{ width: 25, height: 25, borderRadius: 8, display: "grid", placeItems: "center", background: "#f1f5f9", color: "#475569", fontSize: 11, fontWeight: 900 }}>{index + 1}</span><h3 style={{ margin: 0, fontSize: 13, color: "#0f172a" }}>{check.label}</h3></div>
              <Status value={check.status} />
            </div>
            <p style={{ margin: "10px 0 0", color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>{check.detail}</p>
            {check.status !== "ready" && check.status !== "optional" && <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {action && report.canManage && <button type="button" onClick={() => repair(action)} disabled={Boolean(running)} style={{ border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, borderRadius: 7, padding: "5px 9px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>{running === action ? "Working…" : check.action}</button>}
              {report.canManage && (check.id === "connection" || check.id === "scopes") ? <a href={report.links.reconnect} style={{ color: "#075e54", fontSize: 11, fontWeight: 800, padding: "5px 0" }}>Reconnect Meta →</a> : null}
              {check.id === "waba" || check.id === "partner" || check.id === "outboundAuthorization" ? <button type="button" onClick={() => setManualOpen(true)} style={{ border: 0, background: "transparent", color: "#1d4ed8", padding: "5px 0", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>View manual solution →</button> : null}
            </div>}
          </article>
        })}
      </div>

      {thirdParty.length > 0 && <div style={{ marginTop: 14, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 11, padding: 13, color: "#92400e", fontSize: 12, lineHeight: 1.5 }}>
        <strong>Other BSP apps detected:</strong> {thirdParty.map(app => app.name || app.id).join(", ")}. This is not automatically treated as a “lock.” Remove a previous provider only when Meta or that provider confirms migration requires it; arbitrary app removal cannot be safely automated.
      </div>}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ color: "#94a3b8", fontSize: 10 }}>Last checked {new Date(report.lastCheckedAt).toLocaleString()}</span>
        <button type="button" onClick={() => setManualOpen(value => !value)} style={{ border: "1px solid #cbd5e1", background: "#fff", color: "#334155", borderRadius: 8, padding: "7px 11px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>{manualOpen ? "Hide manual setup" : "Manual setup & recovery"}</button>
      </div>

      {manualOpen && <div style={{ marginTop: 14, background: "#0f172a", color: "#e2e8f0", borderRadius: 14, padding: 18 }}>
        <h3 style={{ margin: "0 0 5px", color: "#fff", fontSize: 15 }}>Manual owner/admin setup</h3>
        <p style={{ margin: "0 0 14px", color: "#94a3b8", fontSize: 12 }}>{report.canManage?"Use this when automatic calls return Code 10, Code 200, or a partner assignment cannot be completed by API.":"These steps must be completed by your SaaS administrator or the Meta Business Portfolio owner. Share the failed check and Meta error code shown above with them."}</p>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10, fontSize: 12, lineHeight: 1.5 }}>
          <li>Sign in as an admin of the business that owns WABA <strong>{report.ids.wabaId || "shown in Meta"}</strong>.</li>
          <li>Open WhatsApp Accounts, select the WABA, then assign the intended business/system user with the <strong>Manage</strong> task. Messaging authorization comes from the app&apos;s <code>whatsapp_business_messaging</code> token scope.</li>
          {report.ids.agencyBusinessId && <li>Under Partners, add agency business <strong>{report.ids.agencyBusinessId}</strong> and share this exact WABA and phone number with Full control or messaging access.</li>}
          <li>Confirm the app is <strong>Live</strong> and has Advanced Access for <code>whatsapp_business_management</code>, <code>whatsapp_business_messaging</code>, and <code>business_management</code>, then reconnect Meta. If AiSensy/another BSP still owns the sending relationship, complete its official migration or partner-sharing flow.</li>
          <li>Return here, refresh status, and run automatic setup again. Retry the inbox message only after all sending checks are Ready.</li>
        </ol>
        {report.canManage&&<div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 15 }}>
          {report.links.wabaSettings && <a href={report.links.wabaSettings} target="_blank" rel="noreferrer" style={{ background: "#25D366", color: "#052e2b", borderRadius: 8, padding: "8px 11px", fontSize: 11, fontWeight: 900, textDecoration: "none" }}>Open WhatsApp assets ↗</a>}
          {report.links.partners && <a href={report.links.partners} target="_blank" rel="noreferrer" style={{ background: "#1d4ed8", color: "#fff", borderRadius: 8, padding: "8px 11px", fontSize: 11, fontWeight: 900, textDecoration: "none" }}>Open partner settings ↗</a>}
          {report.links.appReview && <a href={report.links.appReview} target="_blank" rel="noreferrer" style={{ border: "1px solid #475569", color: "#e2e8f0", borderRadius: 8, padding: "8px 11px", fontSize: 11, fontWeight: 900, textDecoration: "none" }}>Open app permissions ↗</a>}
        </div>}
      </div>}
    </div>
  </section>
}
