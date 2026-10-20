"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Notice, primaryButton, secondaryButton } from "@/components/onboarding/OnboardingShell"

type Phone = { id: string; display_phone_number: string; verified_name?: string; quality_rating?: string; code_verification_status?: string }
type WabaOption = {
  id: string; name: string; currency: string | null; timezone: string | null; reviewStatus: string | null
  ownership: "owned" | "client"; phones: Phone[] | null; active: boolean; linkedElsewhere: boolean
}
type BusinessGroup = { id: string; name: string; verificationStatus: string | null; wabas: WabaOption[] }

function Pill({ text, tone }: { text: string; tone: "green" | "blue" | "amber" | "red" | "slate" }) {
  const colors = { green: ["#dcfce7", "#15803d"], blue: ["#dbeafe", "#1d4ed8"], amber: ["#fef9c3", "#a16207"], red: ["#fee2e2", "#b91c1c"], slate: ["#f1f5f9", "#475569"] }[tone]
  return <span style={{ background: colors[0], color: colors[1], borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{text}</span>
}

function qualityTone(value?: string): "green" | "amber" | "red" | "slate" {
  return value === "GREEN" ? "green" : value === "YELLOW" ? "amber" : value === "RED" ? "red" : "slate"
}

// Lists every WhatsApp Business Account the Facebook login can manage and activates the chosen one.
export function WabaStep({ onDone, onBack }: { onDone: (redirect: string) => void; onBack?: () => void }) {
  // Kept in a ref so a new onBack each render doesn't re-trigger loading.
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [metaErrors, setMetaErrors] = useState<string[]>([])
  const [selected, setSelected] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [warning, setWarning] = useState<{ message: string; redirect: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch("/api/onboarding/wabas", { cache: "no-store" })
      const body = await response.json()
      if (response.status === 409) { onBackRef.current?.(); throw new Error("Connect Facebook first.") }
      if (!response.ok) throw new Error(body.error || "Could not load your WhatsApp Business Accounts.")
      const businesses: BusinessGroup[] = body.businesses || []
      setGroups(businesses); setMetaErrors(body.errors || [])
      const all = businesses.flatMap(group => group.wabas)
      setSelected(current => current && all.some(waba => waba.id === current) ? current
        : all.find(waba => waba.active)?.id || all.find(waba => !waba.linkedElsewhere)?.id || "")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your WhatsApp Business Accounts.")
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const all = groups.flatMap(group => group.wabas.map(waba => ({ ...waba, businessId: group.id, businessName: group.name })))
  const current = all.find(waba => waba.active)
  const choice = all.find(waba => waba.id === selected)
  const query = search.trim().toLowerCase()
  const visibleGroups = useMemo(() => groups.map(group => ({ ...group, wabas: group.wabas.filter(waba => !query ||
    `${waba.name} ${waba.id} ${group.name} ${(waba.phones || []).map(phone => `${phone.display_phone_number} ${phone.verified_name || ""}`).join(" ")}`.toLowerCase().includes(query)) }))
    .filter(group => group.wabas.length), [groups, query])

  async function saveSelection(event: React.FormEvent) {
    event.preventDefault()
    if (!choice) return
    if (current && current.id !== choice.id && !window.confirm(`Switch this workspace from “${current.name}” to “${choice.name}”? Campaigns, chatbots and the inbox will use the new account.`)) return
    setSaving(true); setError("")
    try {
      const response = await fetch("/api/onboarding/wabas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wabaId: choice.id, businessId: choice.businessId }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not save the WhatsApp account.")
      if (body.warning) { setWarning({ message: body.warning, redirect: body.redirect }); setSaving(false); return }
      onDone(body.redirect || "/onboarding/phone-registration")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the WhatsApp account.")
      setSaving(false)
    }
  }

  return <div>
      {error && <Notice>{error}</Notice>}
      {metaErrors.map(item => <Notice key={item} tone="warning">Couldn&apos;t list accounts for {item}</Notice>)}
      {warning ? <>
        <Notice tone="warning">{warning.message}</Notice>
        <button onClick={() => onDone(warning.redirect)} style={primaryButton}>Continue →</button>
      </> : loading ? <p style={{ fontSize: 13, color: "#64748b" }}>Fetching your WhatsApp Business Accounts from Meta…</p> :
        all.length ? (
          <form onSubmit={saveSelection}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" }}>
                {all.length} account{all.length > 1 ? "s" : ""} in {groups.length} business portfolio{groups.length > 1 ? "s" : ""}</div>
              <div style={{ flex: 1 }} />
              {all.length > 4 && <input aria-label="Search accounts" value={search} onChange={event => setSearch(event.target.value)}
                placeholder="Search name, ID or number" style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 11px", fontSize: 12, minWidth: 220 }} />}
              <button type="button" onClick={load} style={{ ...secondaryButton, padding: "7px 12px", fontSize: 12 }}>↻ Refresh</button>
            </div>
            {current && <Notice tone="info">Currently active: <strong>{current.name}</strong> ({current.businessName})</Notice>}

            <div role="radiogroup" aria-label="WhatsApp Business Account" style={{ display: "grid", gap: 18 }}>
              {visibleGroups.map(group => <div key={group.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 15 }}>🏢</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{group.name}</span>
                  {group.verificationStatus && <Pill text={group.verificationStatus === "verified" ? "Business verified" : `Verification: ${group.verificationStatus.replace(/_/g, " ")}`}
                    tone={group.verificationStatus === "verified" ? "green" : "amber"} />}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {group.wabas.map(waba => {
                    const on = waba.id === selected
                    const disabled = waba.linkedElsewhere
                    return <label key={waba.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px", borderRadius: 10,
                      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .55 : 1,
                      border: `2px solid ${on ? "#075E54" : "#e2e8f0"}`, background: on ? "#f0fdf4" : "#fff" }}>
                      <input type="radio" name="waba" value={waba.id} checked={on} disabled={disabled} onChange={() => setSelected(waba.id)}
                        style={{ accentColor: "#075E54", width: 17, height: 17, marginTop: 3 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{waba.name}</span>
                          {waba.active && <Pill text="Active in this workspace" tone="green" />}
                          {disabled && <Pill text="Used by another workspace" tone="red" />}
                          {waba.ownership === "client" && <Pill text="Shared with you" tone="blue" />}
                          {waba.reviewStatus && waba.reviewStatus !== "APPROVED" && <Pill text={`Review: ${waba.reviewStatus.toLowerCase()}`} tone="amber" />}
                        </span>
                        <span style={{ display: "block", fontSize: 11, color: "#94a3b8", fontFamily: "monospace", marginTop: 3 }}>
                          WABA {waba.id}{waba.currency ? ` · ${waba.currency}` : ""}</span>
                        <span style={{ display: "grid", gap: 4, marginTop: 8 }}>
                          {waba.phones === null ? <span style={{ fontSize: 12, color: "#94a3b8" }}>Couldn&apos;t load phone numbers</span>
                            : waba.phones.length ? waba.phones.map(phone => <span key={phone.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#334155", flexWrap: "wrap" }}>
                              <span style={{ fontFamily: "monospace" }}>📱 {phone.display_phone_number}</span>
                              <span style={{ color: "#64748b" }}>{phone.verified_name || ""}</span>
                              {phone.quality_rating && <Pill text={`Quality ${phone.quality_rating.toLowerCase()}`} tone={qualityTone(phone.quality_rating)} />}
                            </span>) : <span style={{ fontSize: 12, color: "#b45309" }}>No phone numbers yet — add one in WhatsApp Manager</span>}
                        </span>
                      </span>
                    </label>
                  })}
                </div>
              </div>)}
              {!visibleGroups.length && <div style={{ fontSize: 13, color: "#64748b" }}>No accounts match “{search}”.</div>}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
              <button type="submit" disabled={!choice || choice.linkedElsewhere || saving} style={{ ...primaryButton, opacity: saving || !choice ? .65 : 1 }}>
                {saving ? "Saving…" : choice?.active ? "Keep this account →" : current ? "Switch to this account →" : "Use this account →"}
              </button>
              {onBack && <button type="button" onClick={onBack} style={secondaryButton}>← Back</button>}
            </div>
          </form>
        ) : !error ? (
          <Notice tone="info">Your Facebook login can&apos;t see any WhatsApp Business Accounts. Create one in WhatsApp Manager or ask your business admin
            for access, then reconnect Facebook.</Notice>
        ) : null}
  </div>
}
