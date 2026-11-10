"use client"
import { useState } from "react"

export function WorkspaceCreatorModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated?: (workspaceId: string) => void
}) {
  const [name, setName] = useState("")
  const [industry, setIndustry] = useState("General Business")
  const [gstin, setGstin] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) {
      setError("Project workspace name needs at least 2 characters.")
      return
    }
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          gstin: gstin.trim() || undefined,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not create project workspace.")
      if (onCreated) onCreated(body.id)
      window.location.href = "/app"
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project workspace.")
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create New Project Workspace"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 110,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 460,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h3 style={{ fontFamily: "Sora,sans-serif", fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              🏢 Create New Project Workspace
            </h3>
            <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
              Add a new multi-tenant brand or client workspace to your account.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ border: 0, background: "none", fontSize: 18, cursor: "pointer", color: "#64748b", padding: 4 }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: "10px 12px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 5 }}>
              Project / Brand Name <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Acme Retail or Recruitment Training Academy"
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                color: "#0f172a",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 5 }}>
              Industry / Business Category
            </label>
            <select
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                color: "#0f172a",
                background: "#ffffff",
                outline: "none",
              }}
            >
              {[
                "General Business",
                "E-Commerce & Retail",
                "Education & Training",
                "Healthcare & Clinics",
                "Real Estate & Property",
                "Financial & Legal Services",
                "Automotive & Transport",
                "Hospitality & Restaurants",
                "Information Technology & SaaS",
              ].map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 5 }}>
              GSTIN (Optional)
            </label>
            <input
              maxLength={15}
              value={gstin}
              onChange={e => setGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 33AAAAA0000A1Z5"
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                color: "#0f172a",
                outline: "none",
              }}
            />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
              Used on GST invoices to claim input tax credits.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              disabled={loading || name.trim().length < 2}
              style={{
                flex: 1,
                border: 0,
                borderRadius: 10,
                padding: "12px 16px",
                background: "#075e54",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 13,
                cursor: loading || name.trim().length < 2 ? "default" : "pointer",
                opacity: loading || name.trim().length < 2 ? 0.6 : 1,
                boxShadow: "0 2px 6px rgba(7,94,84,0.3)",
              }}
            >
              {loading ? "Creating workspace…" : "Create & Switch Workspace →"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                borderRadius: 10,
                padding: "12px 16px",
                color: "#64748b",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
