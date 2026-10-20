import { LogoLockup } from "@/components/Logo"

// Company details shown on the legal pages (set in the environment so the live site shows the registered details).
export function company() {
  return {
    name: process.env.COMPANY_NAME || "ZKandavel Infotech",
    address: process.env.COMPANY_ADDRESS || "",
    gstin: process.env.GSTIN || "",
    email: process.env.SUPPORT_EMAIL || "support@zkwaconnect.in",
    grievance: process.env.GRIEVANCE_OFFICER || "",
    jurisdiction: process.env.LEGAL_JURISDICTION || "",
    product: "ZKWAConnect",
    site: (process.env.APP_URL || "https://app.zkwaconnect.in").replace(/\/+$/, ""),
  }
}

export const EFFECTIVE_DATE = "20 October 2026"

const links = [["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["Refund & Cancellation", "/refund-policy"], ["Data Deletion", "/data-deletion"]]

export function LegalPage({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  const c = company()
  return <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "DM Sans,system-ui,sans-serif" }}>
    <header style={{ background: "#075e54", padding: "14px 16px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <a href="/" aria-label="ZKWAConnect home" style={{ textDecoration: "none" }}><LogoLockup size={32} /></a>
        <a href="/login" style={{ color: "#dcf8c6", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Sign in →</a>
      </div>
    </header>
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 48px", lineHeight: 1.7, fontSize: 15 }}>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: "clamp(24px,5vw,32px)", margin: "0 0 4px" }}>{title}</h1>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>Effective {EFFECTIVE_DATE} · {c.product} by {c.name}</p>
      {intro && <p>{intro}</p>}
      <div className="zk-legal">{children}</div>
      <section style={{ marginTop: 32, padding: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 14 }}>
        <strong>Contact</strong><br />
        {c.name}{c.address && <><br />{c.address}</>}{c.gstin && <><br />GSTIN: {c.gstin}</>}<br />
        Email: <a href={`mailto:${c.email}`} style={{ color: "#075e54" }}>{c.email}</a>
      </section>
      <nav aria-label="Legal" style={{ marginTop: 20, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        {links.map(([text, href]) => <a key={href} href={href} style={{ color: "#075e54" }}>{text}</a>)}
      </nav>
    </main>
    <style>{`.zk-legal h2{font-family:Sora,sans-serif;font-size:19px;margin:28px 0 8px}.zk-legal ul{padding-left:20px}.zk-legal li{margin:4px 0}.zk-legal a{color:#075e54}`}</style>
  </div>
}
