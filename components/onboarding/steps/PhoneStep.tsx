"use client"
import { useEffect, useRef, useState } from "react"
import { Notice, primaryButton, secondaryButton } from "@/components/onboarding/OnboardingShell"

type MetaPhone = { id: string; display_phone_number: string; verified_name?: string; code_verification_status?: string }
type SavedPhone = { phoneNumberId: string; verificationStatus: string | null; status: string }

const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 52, padding: "10px 12px", border: "1.5px solid #e2e8f0",
  borderRadius: 8, fontSize: 22, letterSpacing: 10, textAlign: "center", fontFamily: "monospace" }
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }

// Registers a business number on the WhatsApp Cloud API: code (SMS/voice) unless Meta already verified it, then a 6-digit PIN.
export function PhoneStep({ onDone, onBack, onWabaName }: { onDone: (redirect: string) => void; onBack?: () => void; onWabaName?: (name: string) => void }) {
  const [phones, setPhones] = useState<MetaPhone[]>([])
  const [savedPhones, setSavedPhones] = useState<SavedPhone[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [method, setMethod] = useState<"SMS" | "VOICE">("SMS")
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const onWabaNameRef = useRef(onWabaName)
  onWabaNameRef.current = onWabaName

  useEffect(() => {
    let active = true
    fetch("/api/onboarding/phones", { cache: "no-store" })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not load phone numbers.")
        if (!active) return
        const list: MetaPhone[] = body.phones || []
        const saved: SavedPhone[] = body.savedPhones || []
        setPhones(list); setSavedPhones(saved)
        onWabaNameRef.current?.(body.waba?.name || "")
        // Prefer a number that's mid-setup, then any not yet registered.
        const pick = list.find(phone => saved.some(item => item.phoneNumberId === phone.id && item.status !== "CONNECTED"))
          || list.find(phone => !saved.some(item => item.phoneNumberId === phone.id && item.status === "CONNECTED")) || list[0]
        setSelectedId(pick?.id || "")
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load phone numbers.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const selectedPhone = phones.find(phone => phone.id === selectedId)
  const saved = savedPhones.find(item => item.phoneNumberId === selectedId)
  const registered = saved?.status === "CONNECTED" && saved.verificationStatus === "VERIFIED"
  const pinOnly = !registered && (saved?.verificationStatus === "CODE_VERIFIED" || selectedPhone?.code_verification_status === "VERIFIED")
  const awaitingCode = !registered && !pinOnly && (codeSent || saved?.verificationStatus === "CODE_SENT")

  async function requestCode() {
    if (!selectedId) return
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/onboarding/phone/request-code", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumberId: selectedId, codeMethod: method }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not send verification code.")
      setCodeSent(true); setNotice(body.message || "Verification code sent.")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send verification code.") }
    finally { setBusy(false) }
  }

  async function verifyAndRegister(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/onboarding/phone/verify-code", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumberId: selectedId, code: pinOnly ? "" : code, pin }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not register the phone number.")
      onDone(body.redirect || "/onboarding/complete")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not register the phone number.")
      setBusy(false)
    }
  }

  if (loading) return <p style={{ fontSize: 13, color: "#64748b" }}>Loading phone numbers from Meta…</p>
  return <div>
    {error && <Notice>{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {phones.length ? <div>
      <div style={labelStyle}>Business phone number</div>
      <div role="radiogroup" aria-label="Business phone number" style={{ display: "grid", gap: 10 }}>
        {phones.map(phone => {
          const on = phone.id === selectedId
          const row = savedPhones.find(item => item.phoneNumberId === phone.id)
          const isRegistered = row?.status === "CONNECTED" && row.verificationStatus === "VERIFIED"
          return <label key={phone.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderRadius: 10, cursor: "pointer",
            border: `2px solid ${on ? "#075E54" : "#e2e8f0"}`, background: on ? "#f0fdf4" : "#fff" }}>
            <input type="radio" name="phone" checked={on} onChange={() => { setSelectedId(phone.id); setCodeSent(false); setCode(""); setNotice("") }}
              style={{ accentColor: "#075E54", width: 17, height: 17 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 700, fontFamily: "monospace", letterSpacing: .5 }}>{phone.display_phone_number}</span>
              <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>{phone.verified_name || "Display name pending"}</span>
            </span>
            {isRegistered ? <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>✓ Active</span>
              : row?.verificationStatus === "CODE_VERIFIED" || phone.code_verification_status === "VERIFIED"
                ? <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Verified · needs PIN</span>
                : <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Not verified</span>}
          </label>
        })}
      </div>

      {registered ? <div style={{ marginTop: 22 }}>
        <Notice tone="success">This number is registered and active on the WhatsApp Business API.</Notice>
        <button type="button" onClick={() => onDone("/onboarding/complete")} style={primaryButton}>Continue →</button>
      </div> : pinOnly || awaitingCode ? (
        <form onSubmit={verifyAndRegister} style={{ marginTop: 24 }}>
          {pinOnly && <Notice tone="info">Meta has already verified this number. Choose a 6-digit PIN to activate it on the WhatsApp Business API.</Notice>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 14 }}>
            {!pinOnly && <div>
              <label htmlFor="verification-code" style={labelStyle}>6-digit code from Meta</label>
              <input id="verification-code" inputMode="numeric" autoComplete="one-time-code" placeholder="······" pattern="[0-9]{6}" maxLength={6}
                value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} required style={inputStyle} />
            </div>}
            <div>
              <label htmlFor="two-step-pin" style={labelStyle}>Choose a 6-digit PIN</label>
              <input id="two-step-pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="······"
                value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} required style={inputStyle} />
            </div>
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.5, color: "#64748b", margin: "10px 0 16px" }}>
            {pinOnly ? "Keep the PIN safe — Meta asks for it if you ever move this number." : "The code is valid for 10 minutes. Keep the PIN safe — Meta asks for it if you ever move this number."}{" "}
            {!pinOnly && <button type="button" onClick={() => { setCodeSent(false); setCode(""); setSavedPhones(current => current.map(item => item.phoneNumberId === selectedId ? { ...item, verificationStatus: null } : item)) }}
              style={{ border: 0, background: "none", color: "#075E54", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 12 }}>Didn&apos;t get it? Send again</button>}
          </p>
          <button type="submit" disabled={busy || (!pinOnly && code.length !== 6) || pin.length !== 6}
            style={{ ...primaryButton, background: "#25D366", opacity: busy || (!pinOnly && code.length !== 6) || pin.length !== 6 ? .6 : 1 }}>
            {busy ? "Activating…" : pinOnly ? "Activate number" : "Verify & activate number"}
          </button>
        </form>
      ) : (
        <div style={{ marginTop: 22 }}>
          <div style={labelStyle}>Send the code by</div>
          <div role="radiogroup" aria-label="Code delivery" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 420, marginBottom: 16 }}>
            {([["SMS", "💬 Text message"], ["VOICE", "📞 Voice call"]] as const).map(([value, text]) => {
              const on = method === value
              return <label key={value} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${on ? "#075E54" : "#e2e8f0"}`, background: on ? "#f0fdf4" : "#fff", color: on ? "#075E54" : "#0f172a" }}>
                <input type="radio" name="method" checked={on} onChange={() => setMethod(value)} style={{ accentColor: "#075E54" }} />{text}
              </label>
            })}
          </div>
          <button type="button" onClick={requestCode} disabled={busy || !selectedId} style={{ ...primaryButton, opacity: busy ? .65 : 1 }}>
            {busy ? "Sending…" : "Send verification code"}
          </button>
        </div>
      )}
      {onBack && <div style={{ marginTop: 20 }}>
        <button type="button" onClick={onBack} style={secondaryButton}>← Back to WhatsApp account</button>
      </div>}
    </div> : !error ? (
      <Notice tone="info">Meta returned no phone numbers for this WhatsApp account. Add a number in{" "}
        <a href="https://business.facebook.com/wa/manage/phone-numbers/" target="_blank" rel="noreferrer" style={{ color: "#1e40af", fontWeight: 700 }}>WhatsApp Manager</a>, then refresh.</Notice>
    ) : null}
  </div>
}
