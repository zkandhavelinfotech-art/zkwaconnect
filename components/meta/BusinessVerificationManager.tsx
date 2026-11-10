"use client"
import { useCallback, useEffect, useState } from "react"

type BusinessItem = {
  id: string
  name: string
  legalName: string | null
  verificationStatus: string
  isVerified: boolean
  inReview: boolean
  twoFactorType: string
  twoFactorEnforced: boolean
  ownedDomains?: { id: string; name: string; status?: string }[]
  securityCentreUrl: string
  businessInfoUrl: string
  domainsUrl: string
  whatsappAccountsUrl: string
}

type ResponseData = {
  connected: boolean
  count: number
  businesses: BusinessItem[]
  appId: string | null
  message?: string
  error?: string
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "20px 22px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
}

const headStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  fontFamily: "Sora, sans-serif",
  color: "#0f172a",
  margin: "0 0 12px",
  display: "flex",
  alignItems: "center",
  gap: 8,
}

const linkBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 12,
  fontWeight: 700,
  padding: "7px 12px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  color: "#1e293b",
  textDecoration: "none",
  cursor: "pointer",
}

export function BusinessVerificationManager() {
  const [data, setData] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // DNS checker state
  const [domainInput, setDomainInput] = useState("")
  const [checkingDns, setCheckingDns] = useState(false)
  const [dnsResult, setDnsResult] = useState<{
    ok: boolean
    verified: boolean
    message: string
    code?: string
    rootDomain?: string
    provider?: { name: string; link: string | null; isCloudflare: boolean }
  } | null>(null)

  // Cloudflare 1-click deploy states
  const [showCfForm, setShowCfForm] = useState(false)
  const [cfToken, setCfToken] = useState("")
  const [cfVerificationCode, setCfVerificationCode] = useState("")
  const [cfDeploying, setCfDeploying] = useState(false)
  const [cfResult, setCfResult] = useState<{ ok: boolean; message: string } | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/meta/business-verification", { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to load verification status.")
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error checking verification.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  async function runDnsCheck(domainName: string) {
    const target = domainName.trim()
    if (!target) return
    setDomainInput(target)
    setCheckingDns(true)
    setDnsResult(null)
    try {
      const res = await fetch("/api/meta/business-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_domain_dns", domain: target }),
      })
      const body = await res.json()
      setDnsResult({
        ok: Boolean(body.ok),
        verified: Boolean(body.verified),
        message: body.message || body.error || "DNS query completed.",
        code: body.verificationCode,
        rootDomain: body.rootDomain,
        provider: body.provider,
      })
      if (body.provider?.isCloudflare) {
        setShowCfForm(true)
      }
    } catch (err) {
      setDnsResult({
        ok: false,
        verified: false,
        message: err instanceof Error ? err.message : "DNS check failed.",
      })
    } finally {
      setCheckingDns(false)
    }
  }

  async function checkDomainDns(e: React.FormEvent) {
    e.preventDefault()
    runDnsCheck(domainInput)
  }

  async function handleDeployCloudflare(e: React.FormEvent) {
    e.preventDefault()
    if (!cfToken.trim() || !cfVerificationCode.trim()) return
    setCfDeploying(true)
    setCfResult(null)
    try {
      const res = await fetch("/api/meta/business-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_cloudflare_dns",
          apiToken: cfToken.trim(),
          verificationCode: cfVerificationCode.trim(),
          targetDomain: domainInput.trim() || "recruitmenttrainingacademy.com",
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to deploy to Cloudflare.")
      setCfResult({ ok: true, message: body.message })
      setTimeout(() => runDnsCheck(domainInput || "recruitmenttrainingacademy.com"), 3000)
    } catch (err) {
      setCfResult({ ok: false, message: err instanceof Error ? err.message : "Deployment failed" })
    } finally {
      setCfDeploying(false)
    }
  }

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "DM Sans, system-ui, sans-serif" }}>
      {/* Title & Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
            Meta Business Portfolio & Verification Hub
          </h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
            Real-time verification status from Meta Security Centre, Automated Instant-Match tooling, and deep links.
          </p>
        </div>
        <button
          type="button"
          onClick={loadStatus}
          disabled={loading}
          style={{
            background: "#fff",
            border: "1.5px solid #cbd5e1",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            color: "#334155",
          }}
        >
          {loading ? "Checking Meta API…" : "↻ Check Live Status"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 12, borderRadius: 8, color: "#991b1b", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Live Business Portfolio Cards */}
      {data && (
        <div style={{ display: "grid", gap: 14 }}>
          {data.businesses.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center", padding: 30, color: "#64748b" }}>
              <p style={{ margin: "0 0 10px", fontSize: 14 }}>No Meta Business Portfolios detected on this connection.</p>
              <a
                href="https://business.facebook.com/settings/security"
                target="_blank"
                rel="noreferrer"
                style={{ ...linkBtnStyle, background: "#1877F2", color: "#fff", border: 0 }}
              >
                Open Meta Security Centre ↗
              </a>
            </div>
          ) : (
            data.businesses.map(b => (
              <div
                key={b.id}
                style={{
                  ...cardStyle,
                  borderLeft: `4px solid ${b.isVerified ? "#16a34a" : b.inReview ? "#f59e0b" : "#ef4444"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>🏢</span>
                      <strong style={{ fontSize: 16, color: "#0f172a" }}>{b.name}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", marginTop: 4 }}>
                      Business ID: {b.id} {b.legalName ? `· Legal Entity: ${b.legalName}` : ""}
                    </div>
                  </div>

                  {/* Live Status Badge */}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "4px 12px",
                      borderRadius: 20,
                      background: b.isVerified ? "#dcfce7" : b.inReview ? "#fef9c3" : "#fee2e2",
                      color: b.isVerified ? "#15803d" : b.inReview ? "#a16207" : "#b91c1c",
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                    }}
                  >
                    {b.isVerified ? "VERIFIED ✓" : b.inReview ? "IN REVIEW ⏳" : "NOT VERIFIED ✕"}
                  </span>
                </div>

                {/* Registered Domains from Meta */}
                {b.ownedDomains && b.ownedDomains.length > 0 && (
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Registered Domains in Meta:
                    </span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                      {b.ownedDomains.map(d => (
                        <span
                          key={d.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            background: "#f1f5f9",
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                        >
                          <strong style={{ color: "#0f172a" }}>{d.name}</strong>
                          {d.status && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                color: d.status === "VERIFIED" ? "#15803d" : "#b45309",
                              }}
                            >
                              ({d.status})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => runDnsCheck(d.name)}
                            style={{
                              border: "1px solid #cbd5e1",
                              background: "#fff",
                              borderRadius: 4,
                              padding: "2px 7px",
                              fontSize: 10,
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            ⚡ Auto-Test DNS
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Direct Deep-Links */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                  <a href={b.securityCentreUrl} target="_blank" rel="noreferrer" style={linkBtnStyle}>
                    🛡️ Security Centre ↗
                  </a>
                  <a href={b.businessInfoUrl} target="_blank" rel="noreferrer" style={linkBtnStyle}>
                    🏢 Business Info ↗
                  </a>
                  <a href={b.domainsUrl} target="_blank" rel="noreferrer" style={linkBtnStyle}>
                    🌐 Brand Safety & Domains ↗
                  </a>
                  <a href={b.whatsappAccountsUrl} target="_blank" rel="noreferrer" style={linkBtnStyle}>
                    📱 WhatsApp Accounts ↗
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Solutions Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16 }}>
        {/* Solution 1: Automated Verification (Instant Match) */}
        <div style={{ ...cardStyle, borderTop: "3px solid #16a34a" }}>
          <div style={headStyle}>
            <span>⚡</span> Solution 1: Automated Verification (Instant Match)
          </div>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px", lineHeight: 1.5 }}>
            Allows Meta to verify your business automatically without human document delays using domain DNS and corporate email matching:
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            {/* Step 1: 2FA */}
            <div style={{ padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: 12, color: "#0f172a" }}>1. Enforce Two-Factor Authentication (2FA) for Everyone</strong>
              <p style={{ fontSize: 11, color: "#64748b", margin: "3px 0 6px" }}>
                In Meta Security Centre &rarr; Two-factor authentication &rarr; Select <strong>Everyone (Admins + Employees)</strong>.
              </p>
              <div style={{ fontSize: 10, color: "#15803d", fontWeight: 700 }}>
                💡 Meta rejects auto-verification if 2FA is set to &ldquo;No one&rdquo; or &ldquo;Admins only&rdquo;.
              </div>
            </div>

            {/* Step 2: Live Domain DNS Verification Test */}
            <div style={{ padding: 12, background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
              <strong style={{ fontSize: 12, color: "#14532d" }}>2. Verify Your Website Domain (Live DNS Scanner)</strong>
              <p style={{ fontSize: 11, color: "#166534", margin: "3px 0 8px" }}>
                Select a domain or enter your website to test the <code>facebook-domain-verification=...</code> TXT record:
              </p>

              {/* Quick Domain Selector Chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {["recruitmenttrainingacademy.com", "rta.academy"].map(dom => (
                  <button
                    key={dom}
                    type="button"
                    onClick={() => runDnsCheck(dom)}
                    style={{
                      background: domainInput === dom ? "#15803d" : "#fff",
                      color: domainInput === dom ? "#fff" : "#14532d",
                      border: "1px solid #86efac",
                      borderRadius: 16,
                      padding: "3px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ⚡ {dom}
                  </button>
                ))}
              </div>

              <form onSubmit={checkDomainDns} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input
                  value={domainInput}
                  onChange={e => setDomainInput(e.target.value)}
                  placeholder="e.g. recruitmenttrainingacademy.com or rta.academy"
                  required
                  style={{
                    flex: 1,
                    minWidth: 180,
                    padding: "7px 10px",
                    borderRadius: 6,
                    border: "1.5px solid #cbd5e1",
                    fontSize: 12,
                    background: "#fff",
                  }}
                />
                <button
                  type="submit"
                  disabled={checkingDns}
                  style={{
                    background: "#075e54",
                    color: "#fff",
                    border: 0,
                    borderRadius: 6,
                    padding: "7px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {checkingDns ? "Scanning DNS…" : "Check DNS TXT"}
                </button>
              </form>

              <div style={{ fontSize: 10, color: "#166534", marginTop: 6, lineHeight: 1.4 }}>
                💡 <strong>Important Meta Rule:</strong> Meta requires verifying your <strong>root domain</strong> (e.g. <code>recruitmenttrainingacademy.com</code>). Subdomains (like <code>learner...</code>) are automatically verified once the root domain is verified.
              </div>

              {dnsResult && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 12,
                    background: dnsResult.verified ? "#dcfce7" : "#fee2e2",
                    border: `1px solid ${dnsResult.verified ? "#86efac" : "#fca5a5"}`,
                    color: dnsResult.verified ? "#15803d" : "#991b1b",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {dnsResult.verified ? "✓ Verified" : "✕ Not Verified Yet"}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 3 }}>{dnsResult.message}</div>

                  {dnsResult.provider && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#334155" }}>
                      📡 <strong>Detected DNS Host:</strong> {dnsResult.provider.name}{" "}
                      {dnsResult.provider.link && (
                        <a
                          href={dnsResult.provider.link}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#1877F2", fontWeight: 700, textDecoration: "none", marginLeft: 6 }}
                        >
                          Open {dnsResult.provider.name} Dashboard ↗
                        </a>
                      )}
                    </div>
                  )}

                  {!dnsResult.verified && (
                    <div style={{ marginTop: 10, background: "#fff", border: "1px solid #fecaca", borderRadius: 6, padding: 8, color: "#0f172a", fontSize: 11 }}>
                      <strong>How to add in {dnsResult.provider?.name || "your DNS manager"}:</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 4, marginTop: 6, fontFamily: "monospace", fontSize: 11 }}>
                        <span style={{ color: "#64748b" }}>Type:</span>
                        <span><strong>TXT</strong></span>
                        <span style={{ color: "#64748b" }}>Name / Host:</span>
                        <span><strong>@</strong> (or {dnsResult.rootDomain || domainInput})</span>
                        <span style={{ color: "#64748b" }}>Value:</span>
                        <span><strong>facebook-domain-verification=your_code_from_meta</strong></span>
                        <span style={{ color: "#64748b" }}>TTL:</span>
                        <span><strong>300 / Auto</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Automated Cloudflare 1-Click DNS Deploy Form */}
              <div style={{ marginTop: 12, borderTop: "1px dashed #86efac", paddingTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowCfForm(prev => !prev)}
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#075e54",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {showCfForm ? "▲ Hide Cloudflare Automated Deploy" : "⚡ Using Cloudflare? Auto-Deploy TXT via Cloudflare API →"}
                </button>

                {showCfForm && (
                  <form onSubmit={handleDeployCloudflare} style={{ marginTop: 8, background: "#fff", padding: 10, borderRadius: 6, border: "1px solid #cbd5e1", display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>Cloudflare 1-Click Auto-Deploy:</div>
                    <input
                      type="password"
                      value={cfToken}
                      onChange={e => setCfToken(e.target.value)}
                      placeholder="Paste Cloudflare API Token (Zone.DNS Edit)"
                      required
                      style={{ padding: "6px 8px", fontSize: 11, borderRadius: 4, border: "1px solid #cbd5e1" }}
                    />
                    <input
                      value={cfVerificationCode}
                      onChange={e => setCfVerificationCode(e.target.value)}
                      placeholder="Meta Verification Code (e.g. 1a2b3c... or facebook-domain-verification=...)"
                      required
                      style={{ padding: "6px 8px", fontSize: 11, borderRadius: 4, border: "1px solid #cbd5e1" }}
                    />
                    <button
                      type="submit"
                      disabled={cfDeploying}
                      style={{
                        background: "#f97316",
                        color: "#fff",
                        border: 0,
                        borderRadius: 4,
                        padding: "6px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {cfDeploying ? "Deploying to Cloudflare…" : "🚀 Auto-Add TXT Record to Cloudflare"}
                    </button>
                    {cfResult && (
                      <div style={{ fontSize: 11, color: cfResult.ok ? "#15803d" : "#b91c1c", marginTop: 4 }}>
                        {cfResult.message}
                      </div>
                    )}
                  </form>
                )}
              </div>
            </div>

            {/* Step 3: Corporate Domain Email */}
            <div style={{ padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: 12, color: "#0f172a" }}>3. Use a Corporate Domain Email for OTP</strong>
              <p style={{ fontSize: 11, color: "#64748b", margin: "3px 0 0", lineHeight: 1.5 }}>
                When prompted for verification method, select <strong>Email</strong> and use an address matching your verified domain (e.g. <code>admin@yourdomain.in</code>). Meta auto-approves instantly upon entering the 6-digit OTP!
              </p>
            </div>
          </div>
        </div>

        {/* Solution 2: Manual Verification (Document Upload) */}
        <div style={{ ...cardStyle, borderTop: "3px solid #2563eb" }}>
          <div style={headStyle}>
            <span>📑</span> Solution 2: Manual Verification (24–48 Hours)
          </div>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px", lineHeight: 1.5 }}>
            Submit formal legal documents if you do not have domain email or if Meta requires document proof:
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: 12, color: "#0f172a" }}>Step 1: Legal Business Name Proof (Upload 1)</strong>
              <ul style={{ fontSize: 11, color: "#475569", margin: "4px 0 0", paddingLeft: 16, lineHeight: 1.6 }}>
                <li>GST Certificate (Form GST REG-06 &mdash; all pages)</li>
                <li>Certificate of Incorporation (ROC / MCA)</li>
                <li>Udyam / MSME Registration Certificate</li>
              </ul>
              <div style={{ fontSize: 10, color: "#b45309", marginTop: 4, fontWeight: 700 }}>
                ⚠️ Name in Meta Business Info must match character-by-character with the document.
              </div>
            </div>

            <div style={{ padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: 12, color: "#0f172a" }}>Step 2: Physical Address & Phone Proof</strong>
              <ul style={{ fontSize: 11, color: "#475569", margin: "4px 0 0", paddingLeft: 16, lineHeight: 1.6 }}>
                <li>Recent Electricity / Utility Bill (within 3 months)</li>
                <li>Bank Statement with official bank stamp/letterhead</li>
              </ul>
            </div>

            <div style={{ padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: 12, color: "#0f172a" }}>Step 3: Receive 6-Digit OTP</strong>
              <p style={{ fontSize: 11, color: "#475569", margin: "3px 0 0" }}>
                Select SMS or Voice Call to your WhatsApp Business number. Enter the 6-digit code in Security Centre to finalize submission.
              </p>
            </div>
          </div>
        </div>

        {/* Card 3: Un-greying "Start Verification" Troubleshooter */}
        <div style={{ ...cardStyle, gridColumn: "1 / -1", background: "#f8fafc", border: "1.5px dashed #cbd5e1" }}>
          <div style={headStyle}>
            <span>❓</span> Why is the &ldquo;Start Verification&rdquo; Button Greyed Out?
          </div>
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
            If the <strong>Start verification</strong> button in your Security Centre cannot be clicked:
            <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li>
                Open <strong><a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" style={{ color: "#1877F2" }}>Meta for Developers</a></strong> &rarr; click your App (<code>{data?.appId || "1710743377107186"}</code>).
              </li>
              <li>
                In the left menu, ensure <strong>WhatsApp</strong> and <strong>Facebook Login for Business</strong> are added under Products.
              </li>
              <li>
                Go to <strong>App settings &rarr; Basic</strong> &rarr; under <strong>Verification</strong>, click <strong>Start Verification</strong>.
              </li>
              <li>
                Return to <strong><a href="https://business.facebook.com/settings/security" target="_blank" rel="noreferrer" style={{ color: "#1877F2" }}>Meta Security Centre</a></strong> and refresh &mdash; the button will turn blue and clickable immediately.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

