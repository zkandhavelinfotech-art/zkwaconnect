import { LogoLockup } from "@/components/Logo"

// Green background + white card used by the sign-in, forgot-password and reset-password pages.
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#075E54 0%,#128C7E 45%,#075E54 100%)", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "DM Sans,sans-serif" }}>
    <div style={{ display: "inline-flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)",
      borderRadius: 16, padding: "12px 20px", marginBottom: 24 }}><LogoLockup size={40} /></div>
    <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 20, padding: "clamp(22px,6vw,36px)", boxShadow: "0 24px 64px rgba(0,0,0,.25)", boxSizing: "border-box" }}>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 22px", lineHeight: 1.5 }}>{subtitle}</p>}
      {children}
    </div>
    <div style={{ marginTop: 16, fontSize: 11, display: "flex", gap: 14 }}>
      {[["Privacy", "/privacy"], ["Terms", "/terms"], ["Refunds", "/refund-policy"]].map(([text, href]) =>
        <a key={href} href={href} style={{ color: "rgba(255,255,255,.55)", textDecoration: "none" }}>{text}</a>)}
    </div>
  </div>
}

export const authButton = (busy: boolean): React.CSSProperties => ({ width: "100%", background: "#075E54", color: "#fff", border: "none", borderRadius: 10, padding: 13,
  fontFamily: "Sora,sans-serif", fontSize: 15, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .7 : 1, marginBottom: 14 })
export const authError: React.CSSProperties = { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b", marginBottom: 12 }
export const authNotice: React.CSSProperties = { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534", marginBottom: 12, lineHeight: 1.5 }
