"use client"
import { useEffect, useState } from "react"

type Key = {
  id: string
  name: string
  prefix: string
  scopes: string[] | null
  rateLimit: number
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

type Delivery = {
  id: string
  event: string
  status: string
  attempts: number
  responseStatus: number | null
  error: string | null
  createdAt: string
  deliveredAt: string | null
  nextAttemptAt: string
}

type Endpoint = {
  id: string
  url: string
  events: string[]
  description: string | null
  active: boolean
  failureCount: number
  lastDeliveryAt: string | null
  lastStatus: number | null
  lastError: string | null
  createdAt: string
  deliveries: Delivery[]
}

type Scope = { id: string; name: string; description: string }

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 24,
  marginBottom: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
}

const inputStyle: React.CSSProperties = {
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "9px 12px",
  fontSize: 13,
  color: "#0f172a",
  background: "#fff",
  width: "100%",
}

const primaryBtn: React.CSSProperties = {
  border: 0,
  borderRadius: 6,
  padding: "9px 16px",
  background: "#075e54",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
}

const linkBtn: React.CSSProperties = {
  border: 0,
  background: "none",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  padding: 0,
}

const codeBox: React.CSSProperties = {
  display: "block",
  background: "#0f172a",
  color: "#f8fafc",
  borderRadius: 8,
  padding: "14px 16px",
  fontSize: 12,
  overflowX: "auto",
  whiteSpace: "pre",
  lineHeight: 1.6,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
}

const when = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "never"

const DELIVERY_COLORS: Record<string, string> = {
  DELIVERED: "#166534",
  PENDING: "#92400e",
  SENDING: "#075985",
  FAILED: "#991b1b",
}

function SecretModal({
  title,
  apiKey,
  secretKey,
  onDone,
}: {
  title: string
  apiKey: string
  secretKey?: string
  onDone: () => void
}) {
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15,23,42,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          maxWidth: 580,
          width: "100%",
          padding: 24,
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>🔐</span>
          <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>{title} Created</h3>
        </div>

        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fef3c7",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 16,
            fontSize: 12.5,
            color: "#92400e",
            lineHeight: 1.5,
          }}
        >
          <b>⚠️ Important:</b> Copy your API Key and Secret Key now. The Secret Key will <b>never</b> be shown again.
          Store it securely in your external application backend (e.g. <code>ZKLeadFlowCRM</code> environment variables).
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 }}>
            API Key (Public Identifier)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              readOnly
              value={apiKey}
              style={{ ...inputStyle, background: "#f8fafc", fontFamily: "monospace", fontSize: 12 }}
            />
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(apiKey)
                setCopiedKey(true)
                setTimeout(() => setCopiedKey(false), 2000)
              }}
              style={{ ...primaryBtn, padding: "8px 14px", whiteSpace: "nowrap" }}
            >
              {copiedKey ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>

        {secretKey && (
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 }}>
              Secret Key (HMAC Signing Secret)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                readOnly
                value={secretKey}
                style={{ ...inputStyle, background: "#f8fafc", fontFamily: "monospace", fontSize: 12 }}
              />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(secretKey)
                  setCopiedSecret(true)
                  setTimeout(() => setCopiedSecret(false), 2000)
                }}
                style={{ ...primaryBtn, padding: "8px 14px", whiteSpace: "nowrap" }}
              >
                {copiedSecret ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
              Use this secret to generate HMAC-SHA256 signatures in the <code>X-ZKWA-Signature</code> header.
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onDone} style={{ ...primaryBtn, width: "100%", justifyContent: "center" }}>
            I have saved these credentials securely
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DevelopersPage() {
  const [activeTab, setActiveTab] = useState<"keys" | "webhooks" | "docs">("keys")
  const [keys, setKeys] = useState<Key[]>([])
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [events, setEvents] = useState<Record<string, string>>({})
  const [availableScopes, setAvailableScopes] = useState<Scope[]>([])

  // Create Key Form State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [appName, setAppName] = useState("")
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "messages:send",
    "messages:read",
    "templates:read",
    "contacts:read",
    "contacts:write",
  ])
  const [rateLimit, setRateLimit] = useState(60)
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null)

  // Webhook Form State
  const [hookUrl, setHookUrl] = useState("")
  const [hookEvents, setHookEvents] = useState<string[]>(["message.received", "message.status", "order.created"])
  const [hookDesc, setHookDesc] = useState("")

  const [activeSecretModal, setActiveSecretModal] = useState<{
    title: string
    apiKey: string
    secretKey?: string
  } | null>(null)

  const [openLog, setOpenLog] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [copiedBaseUrl, setCopiedBaseUrl] = useState(false)

  const apiBaseUrl = "https://api.zkwaconnect.in/api/v1"

  async function load() {
    const [a, b] = await Promise.all([fetch("/api/developer/keys"), fetch("/api/developer/webhooks")])
    const [keyBody, hookBody] = await Promise.all([a.json(), b.json()])
    if (!a.ok) throw new Error(keyBody.error || "Could not load API keys.")
    setKeys(keyBody.keys || [])
    if (keyBody.availableScopes) setAvailableScopes(keyBody.availableScopes)
    setEndpoints(hookBody.endpoints || [])
    setEvents(hookBody.events || {})
  }

  useEffect(() => {
    load().catch(reason => setError(reason.message))
  }, [])

  async function call(url: string, method: string, body?: unknown) {
    setError("")
    setNotice("")
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Something went wrong.")
      if (data.message) setNotice(data.message)
      await load()
      return data
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.")
      return null
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault()
    const data = await call("/api/developer/keys", "POST", {
      name: appName,
      scopes: selectedScopes,
      rateLimit: Number(rateLimit),
      expiresInDays: expiresInDays ? Number(expiresInDays) : null,
    })
    if (data && data.apiKey) {
      setActiveSecretModal({
        title: data.name || appName,
        apiKey: data.apiKey,
        secretKey: data.secretKey,
      })
      setAppName("")
      setShowCreateModal(false)
    }
  }

  async function handleAddWebhook(e: React.FormEvent) {
    e.preventDefault()
    const data = await call("/api/developer/webhooks", "POST", {
      url: hookUrl,
      events: hookEvents,
      description: hookDesc || undefined,
    })
    if (data && data.secret) {
      setActiveSecretModal({
        title: "Webhook Signing Secret",
        apiKey: data.url,
        secretKey: data.secret,
      })
      setHookUrl("")
      setHookDesc("")
    }
  }

  const curlExample = `curl -X POST ${apiBaseUrl}/messages/send \\
  -H "X-ZKWA-Key: zk_live_YOUR_KEY" \\
  -H "X-ZKWA-Timestamp: 1793952000" \\
  -H "X-ZKWA-Signature: 5a8e2b...hmac_sha256" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "919876543210",
    "message": "Thank you for contacting ZKLeadFlowCRM! Your inquiry has been confirmed.",
    "type": "text"
  }'`

  const nodeExample = `// Node.js External Integration (e.g. ZKLeadFlowCRM, ZKCMS)
import crypto from "node:crypto";

const API_KEY = process.env.ZKWA_API_KEY;       // e.g. "zk_live_..."
const SECRET_KEY = process.env.ZKWA_SECRET_KEY; // e.g. "zk_secret_..."
const API_URL = "${apiBaseUrl}/messages/send";

async function sendWhatsAppAlert(phone, text) {
  const payload = JSON.stringify({ phone, message: text, type: "text" });
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Compute HMAC-SHA256 signature
  const stringToSign = \`\${timestamp}.POST./api/v1/messages/send.\${payload}\`;
  const signature = crypto.createHmac("sha256", SECRET_KEY)
    .update(stringToSign)
    .digest("hex");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ZKWA-Key": API_KEY,
      "X-ZKWA-Timestamp": timestamp,
      "X-ZKWA-Signature": signature
    },
    body: payload
  });

  return await response.json();
}`

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>
              Developer API & Integrations
            </h1>
            <p style={{ fontSize: 13.5, color: "#64748b", margin: 0 }}>
              Integrate external platforms like <b>ZKLeadFlowCRM</b>, <b>ZKCommerce</b>, websites, and custom backends with ZKWAConnect.
            </p>
          </div>
          <button onClick={() => setShowCreateModal(true)} style={primaryBtn}>
            <span>+</span> Create API Key
          </button>
        </div>
      </div>

      {/* Domain Architecture Notice Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #075e54 0%, #128c7e 100%)",
          color: "#fff",
          borderRadius: 10,
          padding: "16px 20px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          boxShadow: "0 4px 6px -1px rgba(7,94,84,0.15)",
        }}
      >
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: "#a7f3d0", fontWeight: 700, marginBottom: 2 }}>
            Official REST API Endpoint
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: "#fff" }}>
            {apiBaseUrl}
          </div>
          <div style={{ fontSize: 12, color: "#d1fae5", marginTop: 4 }}>
            <b>Architecture:</b> <code>zkwaconnect.in</code> (Website) &nbsp;·&nbsp; <code>app.zkwaconnect.in</code> (Dashboard) &nbsp;·&nbsp; <code>api.zkwaconnect.in</code> (Public API)
          </div>
        </div>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(apiBaseUrl)
            setCopiedBaseUrl(true)
            setTimeout(() => setCopiedBaseUrl(false), 2000)
          }}
          style={{
            border: "1px solid rgba(255,255,255,0.4)",
            borderRadius: 6,
            padding: "8px 14px",
            background: "rgba(255,255,255,0.15)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {copiedBaseUrl ? "Base URL Copied ✓" : "Copy Base URL"}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ padding: 12, background: "#fff1f0", color: "#9f2d22", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" style={{ padding: 12, background: "#eaf8f1", color: "#176b4b", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {notice}
        </div>
      )}

      {/* Secret Modal */}
      {activeSecretModal && (
        <SecretModal
          title={activeSecretModal.title}
          apiKey={activeSecretModal.apiKey}
          secretKey={activeSecretModal.secretKey}
          onDone={() => setActiveSecretModal(null)}
        />
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0", marginBottom: 22, gap: 24 }}>
        {[
          { id: "keys", label: `🔑 API Keys (${keys.filter(k => !k.revokedAt).length})` },
          { id: "webhooks", label: `🔔 Webhooks (${endpoints.length})` },
          { id: "docs", label: "📘 API Reference & Quickstarts" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #075e54" : "2px solid transparent",
              padding: "10px 4px",
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? "#075e54" : "#64748b",
              cursor: "pointer",
              marginBottom: -2,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: API KEYS */}
      {activeTab === "keys" && (
        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, margin: "0 0 4px", color: "#0f172a" }}>
                API Keys & Secret Signatures
              </h2>
              <p style={{ fontSize: 12.5, color: "#64748b", margin: 0 }}>
                Manage API credentials for external applications. Requests are signed using HMAC-SHA256 for OWASP security.
              </p>
            </div>
            <button onClick={() => setShowCreateModal(true)} style={{ ...primaryBtn, padding: "7px 12px", fontSize: 12 }}>
              + Create Key
            </button>
          </div>

          {keys.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b" }}>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>Application / Name</th>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>Key Prefix</th>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>Rate Limit</th>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>Expires</th>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>Last Used</th>
                    <th style={{ padding: "10px 8px", fontWeight: 600 }}>Created</th>
                    <th style={{ padding: "10px 8px", fontWeight: 600, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map(k => (
                    <tr key={k.id} style={{ borderTop: "1px solid #f1f5f9", opacity: k.revokedAt ? 0.5 : 1 }}>
                      <td style={{ padding: "12px 8px", fontWeight: 700, color: "#0f172a" }}>
                        {k.name}
                        {k.revokedAt && (
                          <span style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px", background: "#fee2e2", color: "#991b1b", borderRadius: 4 }}>
                            Revoked
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11.5 }}>
                          {k.prefix}
                        </code>
                      </td>
                      <td style={{ padding: "12px 8px", color: "#475569" }}>{k.rateLimit || 60} req/min</td>
                      <td style={{ padding: "12px 8px", color: "#475569" }}>
                        {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString("en-IN") : "Never"}
                      </td>
                      <td style={{ padding: "12px 8px", color: "#475569" }}>{when(k.lastUsedAt)}</td>
                      <td style={{ padding: "12px 8px", color: "#64748b" }}>{when(k.createdAt)}</td>
                      <td style={{ padding: "12px 8px", textAlign: "right" }}>
                        {!k.revokedAt ? (
                          <div style={{ display: "inline-flex", gap: 12 }}>
                            <button
                              onClick={async () => {
                                if (window.confirm(`Regenerate credentials for “${k.name}”? The old API key and secret will stop working immediately.`)) {
                                  const res = await call("/api/developer/keys", "POST", { action: "regenerate", id: k.id })
                                  if (res && res.apiKey) {
                                    setActiveSecretModal({
                                      title: res.name || k.name,
                                      apiKey: res.apiKey,
                                      secretKey: res.secretKey,
                                    })
                                  }
                                }
                              }}
                              style={{ ...linkBtn, color: "#075e54" }}
                            >
                              Regenerate
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Revoke “${k.name}”? All external applications using this key will be rejected immediately.`)) {
                                  call(`/api/developer/keys?id=${k.id}`, "DELETE")
                                }
                              }}
                              style={{ ...linkBtn, color: "#b91c1c" }}
                            >
                              Revoke
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 11 }}>Inactive</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "36px 12px", color: "#64748b" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔑</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>No API Keys Created Yet</div>
              <p style={{ fontSize: 12.5, margin: "6px 0 16px" }}>
                Generate credentials to connect ZKLeadFlowCRM, websites, and external applications.
              </p>
              <button onClick={() => setShowCreateModal(true)} style={primaryBtn}>
                Create Your First API Key
              </button>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: WEBHOOKS */}
      {activeTab === "webhooks" && (
        <section style={card}>
          <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, margin: "0 0 4px", color: "#0f172a" }}>
            🔔 Outbound Webhook Subscriptions
          </h2>
          <p style={{ fontSize: 12.5, color: "#64748b", margin: "0 0 16px" }}>
            ZKWAConnect automatically POSTs JSON payloads to your HTTPS endpoint when messages or orders occur, signed with HMAC-SHA256.
          </p>

          <form onSubmit={handleAddWebhook} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>
                Target Webhook URL (HTTPS required)
              </label>
              <input
                required
                type="url"
                value={hookUrl}
                onChange={e => setHookUrl(e.target.value)}
                placeholder="https://crm.yourcompany.com/api/webhooks/whatsapp"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>
                Description / Application Name
              </label>
              <input
                value={hookDesc}
                onChange={e => setHookDesc(e.target.value)}
                placeholder="e.g. ZKLeadFlowCRM Inbound Webhook"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>
                Events to Subscribe:
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(events).map(([name, desc]) => {
                  const on = hookEvents.includes(name)
                  return (
                    <label
                      key={name}
                      title={desc}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        border: `1px solid ${on ? "#075e54" : "#cbd5e1"}`,
                        borderRadius: 20,
                        padding: "4px 10px",
                        fontSize: 11.5,
                        cursor: "pointer",
                        background: on ? "#f0fdf4" : "#fff",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setHookEvents(curr => (on ? curr.filter(item => item !== name) : [...curr, name]))
                        }
                      />
                      <code>{name}</code>
                    </label>
                  )
                })}
              </div>
            </div>
            <button type="submit" disabled={!hookEvents.length} style={primaryBtn}>
              Register Webhook Endpoint
            </button>
          </form>

          {endpoints.map(endpoint => (
            <div key={endpoint.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: !endpoint.active ? "#94a3b8" : endpoint.failureCount ? "#f59e0b" : "#22c55e" }} />
                <code style={{ fontSize: 12.5, fontWeight: 700, wordBreak: "break-all", flex: 1, color: "#0f172a" }}>
                  {endpoint.url}
                </code>
                <button onClick={() => call("/api/developer/webhooks", "POST", { action: "test", id: endpoint.id }).then(() => setOpenLog(endpoint.id))} style={{ ...linkBtn, color: "#075e54" }}>
                  Send Test
                </button>
                <button onClick={() => setOpenLog(openLog === endpoint.id ? "" : endpoint.id)} style={{ ...linkBtn, color: "#075e54" }}>
                  Deliveries
                </button>
                <button onClick={() => call("/api/developer/webhooks", "PATCH", { id: endpoint.id, active: !endpoint.active })} style={{ ...linkBtn, color: "#92400e" }}>
                  {endpoint.active ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm("Create a new signing secret? The current secret stops working immediately.")) return
                    const data = await call("/api/developer/webhooks", "PATCH", { id: endpoint.id, rotateSecret: true })
                    if (data?.secret) {
                      setActiveSecretModal({ title: "New Webhook Signing Secret", apiKey: endpoint.url, secretKey: data.secret })
                    }
                  }}
                  style={{ ...linkBtn, color: "#475569" }}
                >
                  Rotate Secret
                </button>
                <button onClick={() => window.confirm("Delete this webhook endpoint?") && call(`/api/developer/webhooks?id=${endpoint.id}`, "DELETE")} style={{ ...linkBtn, color: "#b91c1c" }}>
                  Delete
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 8 }}>
                {endpoint.events.join(" · ")} &nbsp;·&nbsp; Last delivery: {when(endpoint.lastDeliveryAt)}
                {endpoint.lastStatus ? ` (HTTP ${endpoint.lastStatus})` : ""}
                {!endpoint.active && " · Paused"}
              </div>
              {openLog === endpoint.id && (
                <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Recent Deliveries:</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <tbody>
                      {endpoint.deliveries.length ? (
                        endpoint.deliveries.map(del => (
                          <tr key={del.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "5px 6px" }}><code>{del.event}</code></td>
                            <td style={{ padding: "5px 6px", color: DELIVERY_COLORS[del.status], fontWeight: 700 }}>
                              {del.status.toLowerCase()}{del.responseStatus ? ` · HTTP ${del.responseStatus}` : ""}
                            </td>
                            <td style={{ padding: "5px 6px", color: "#64748b" }}>
                              {when(del.createdAt)} · {del.attempts} attempt(s)
                            </td>
                            <td style={{ padding: "5px 6px", color: "#991b1b" }}>{del.error || ""}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td style={{ padding: 6, color: "#94a3b8" }}>No deliveries yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* TAB 3: REST API REFERENCE & QUICKSTARTS */}
      {activeTab === "docs" && (
        <section style={card}>
          <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, margin: "0 0 8px", color: "#0f172a" }}>
            📘 REST API Endpoints Specification
          </h2>
          <p style={{ fontSize: 12.5, color: "#64748b", margin: "0 0 16px" }}>
            Permanent public API base: <code>{apiBaseUrl}</code>. All requests require authentication via API Key & HMAC-SHA256 signature.
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 20 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #cbd5e1", color: "#475569", textAlign: "left" }}>
                <th style={{ padding: "8px 10px", width: 75 }}>Method</th>
                <th style={{ padding: "8px 10px", width: 230 }}>Endpoint</th>
                <th style={{ padding: "8px 10px" }}>Purpose / Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["GET", "/api/v1/account", "Account details, active plan, wallet credits, and WABA status"],
                ["GET", "/api/v1/whatsapp/phone-numbers", "List connected WhatsApp numbers and quality ratings"],
                ["GET", "/api/v1/templates", "Approved WhatsApp message templates and variable counts"],
                ["POST", "/api/v1/messages/send", "Send text or media WhatsApp message (inside 24h window)"],
                ["POST", "/api/v1/messages/template", "Send approved WhatsApp template anytime (bypasses 24h window)"],
                ["GET", "/api/v1/messages/{id}", "Query message delivery status (sent, delivered, read)"],
                ["GET", "/api/v1/contacts", "Retrieve and filter contacts by phone or tag with pagination"],
                ["POST", "/api/v1/contacts", "Create or update customer contact with custom tags & attributes"],
                ["GET", "/api/v1/webhooks", "List all registered webhook subscriptions"],
                ["POST", "/api/v1/webhooks", "Register a new external webhook endpoint"],
                ["GET", "/api/v1/usage", "Retrieve API request usage statistics and rate limit info"],
              ].map(([m, p, d]) => (
                <tr key={p} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 800, color: m === "GET" ? "#0369a1" : "#15803d" }}>
                    {m}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <code style={{ background: "#f8fafc", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace" }}>
                      {p}
                    </code>
                  </td>
                  <td style={{ padding: "8px 10px", color: "#334155" }}>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "20px 0 8px", color: "#0f172a" }}>
            1. Direct cURL Request
          </h3>
          <code style={codeBox}>{curlExample}</code>

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "24px 0 8px", color: "#0f172a" }}>
            2. Node.js & ZKLeadFlowCRM Integration (HMAC-SHA256 Signed)
          </h3>
          <code style={codeBox}>{nodeExample}</code>
        </section>
      )}

      {/* CREATE API KEY MODAL */}
      {showCreateModal && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15,23,42,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 540,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>Create New API Key</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateKey}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>
                  Application / Project Name
                </label>
                <input
                  required
                  value={appName}
                  onChange={e => setAppName(e.target.value)}
                  placeholder="e.g. ZKLeadFlowCRM, ZKCMS, Storefront Backend"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>
                    Rate Limit (Req / Minute)
                  </label>
                  <select
                    value={rateLimit}
                    onChange={e => setRateLimit(Number(e.target.value))}
                    style={inputStyle}
                  >
                    <option value={60}>60 req / min (Standard)</option>
                    <option value={120}>120 req / min (Pro)</option>
                    <option value={300}>300 req / min (High Traffic)</option>
                    <option value={600}>600 req / min (Unlimited)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>
                    Key Expiration
                  </label>
                  <select
                    value={expiresInDays === null ? "never" : String(expiresInDays)}
                    onChange={e => setExpiresInDays(e.target.value === "never" ? null : Number(e.target.value))}
                    style={inputStyle}
                  >
                    <option value="never">Never Expires</option>
                    <option value="30">30 Days</option>
                    <option value="90">90 Days</option>
                    <option value="365">1 Year</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>
                  Permissions & Scopes
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {(availableScopes.length > 0 ? availableScopes : [
                    { id: "messages:send", name: "Send Messages" },
                    { id: "messages:read", name: "Read Messages" },
                    { id: "templates:read", name: "Read Templates" },
                    { id: "contacts:read", name: "Read Contacts" },
                    { id: "contacts:write", name: "Write Contacts" },
                    { id: "webhooks:manage", name: "Manage Webhooks" },
                    { id: "account:read", name: "Account Details" },
                  ]).map(s => {
                    const checked = selectedScopes.includes(s.id)
                    return (
                      <label
                        key={s.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          color: "#334155",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedScopes(curr =>
                              checked ? curr.filter(id => id !== s.id) : [...curr, s.id]
                            )
                          }
                        />
                        <span>{s.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ ...primaryBtn, background: "#f1f5f9", color: "#475569" }}
                >
                  Cancel
                </button>
                <button type="submit" disabled={!appName.trim()} style={primaryBtn}>
                  Generate API & Secret Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
