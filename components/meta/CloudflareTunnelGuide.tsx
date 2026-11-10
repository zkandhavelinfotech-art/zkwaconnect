"use client"
import { useState } from "react"

export function CloudflareTunnelGuide({ isModal = false, onClose }: { isModal?: boolean; onClose?: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<number>(1)

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, color: "#1e293b", fontSize: 13, lineHeight: 1.6 }}>
      {/* Overview Banner */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, color: "#1d4ed8", fontSize: 14 }}>
          <span>🔒</span> Why Meta Blocks Embedded Signup on HTTP Localhost
        </div>
        <p style={{ margin: "6px 0 0", color: "#334155", fontSize: 12.5, lineHeight: 1.5 }}>
          Meta strictly enforces HTTPS on all Facebook Login and Embedded Signup SDK invocations:
          <br />
          <code style={{ background: "#dbeafe", color: "#1e40af", padding: "2px 6px", borderRadius: 4, fontSize: 11.5, display: "inline-block", marginTop: 4 }}>
            The method FB.login can no longer be called from http pages.
          </code>
          <br />
          To use the 1-click Meta Popup SDK on local development, you must expose your local port 3002 over an encrypted HTTPS tunnel (e.g. Cloudflare Tunnel or ngrok) and register that domain in your Meta App.
        </p>
      </div>

      {/* Interactive Step Navigator */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { id: 1, label: "1. Run Free Cloudflare Tunnel" },
          { id: 2, label: "2. Add Domain to Meta App" },
          { id: 3, label: "3. Create Config ID in Meta" },
          { id: 4, label: "4. Method A Alternative (No SSL)" },
        ].map(step => (
          <button
            key={step.id}
            type="button"
            onClick={() => setActiveStep(step.id)}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: activeStep === step.id ? "#0284c7" : "#e2e8f0",
              background: activeStep === step.id ? "#f0f9ff" : "#ffffff",
              color: activeStep === step.id ? "#0369a1" : "#475569",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {step.label}
          </button>
        ))}
      </div>

      {/* Step Content */}
      {activeStep === 1 && (
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 6 }}>
            ⚡ Step 1: Start Instant Free Cloudflare Tunnel (Zero Install)
          </div>
          <p style={{ margin: "0 0 10px", color: "#475569", fontSize: 12 }}>
            Run the preconfigured command below in your terminal. It spins up a free Cloudflare tunnel that forwards traffic from an official <code>https://xxx.trycloudflare.com</code> URL to your local <code>http://localhost:3002</code>.
          </p>

          <div style={{ background: "#090e17", borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <code style={{ color: "#4ade80", fontFamily: "monospace", fontSize: 13 }}>
              npm run tunnel
            </code>
            <button
              type="button"
              onClick={() => copy("npm run tunnel", "cmd1")}
              style={{ background: "#1e293b", color: "#f8fafc", border: 0, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
            >
              {copied === "cmd1" ? "Copied ✓" : "Copy"}
            </button>
          </div>

          <div style={{ fontSize: 11, color: "#64748b" }}>
            Or run directly with npx:
            <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, marginLeft: 6 }}>
              npx cloudflared tunnel --url http://localhost:3002
            </code>
          </div>
        </div>
      )}

      {activeStep === 2 && (
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 6 }}>
            🌐 Step 2: Register HTTPS Domain in Meta App Dashboard
          </div>
          <p style={{ margin: "0 0 10px", color: "#475569", fontSize: 12 }}>
            Open your Meta Developer App (<strong>ID: 1710743377107186</strong>) and whitelist the Cloudflare tunnel domain:
          </p>
          <ol style={{ paddingLeft: 18, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            <li>
              Go to <strong>Settings &gt; Basic</strong> in Meta Developers.
            </li>
            <li>
              Under <strong>App Domains</strong>, add: <code>trycloudflare.com</code> (or your custom domain).
            </li>
            <li>
              Under <strong>Website &gt; Site URL</strong>, enter your active tunnel URL: <code>https://your-tunnel.trycloudflare.com</code>.
            </li>
            <li>
              Under <strong>Facebook Login &gt; Settings</strong>, add to <strong>Valid OAuth Redirect URIs</strong>:
              <br />
              <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, marginTop: 4, display: "inline-block" }}>
                https://your-tunnel.trycloudflare.com/app/rta-connect
              </code>
            </li>
          </ol>
          <a
            href="https://developers.facebook.com/apps/1710743377107186/settings/basic/"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#1877F2", color: "#fff", padding: "8px 14px", borderRadius: 6, fontWeight: 700, fontSize: 12, textDecoration: "none" }}
          >
            Open Meta App Settings (1710743377107186) ↗
          </a>
        </div>
      )}

      {activeStep === 3 && (
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 6 }}>
            ⚙️ Step 3: Create Login Configuration ID in WhatsApp Embedded Signup
          </div>
          <p style={{ margin: "0 0 10px", color: "#475569", fontSize: 12 }}>
            The error <em>&quot;This content isn&apos;t available at the moment&quot;</em> occurs when the Meta <code>config_id</code> is missing or invalid.
          </p>
          <ol style={{ paddingLeft: 18, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            <li>
              Go to <strong>Meta App &gt; WhatsApp &gt; Embedded Signup</strong> (or Quickstart).
            </li>
            <li>
              Click <strong>&quot;Create Configuration&quot;</strong> or choose your existing Login Configuration.
            </li>
            <li>
              Copy the numeric <strong>Configuration ID</strong> (e.g. <code>1234567890123456</code>).
            </li>
            <li>
              Add it to your <code>.env</code> file:
              <br />
              <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, marginTop: 4, display: "inline-block" }}>
                META_EMBEDDED_CONFIG_ID=1234567890123456
              </code>
            </li>
          </ol>
          <a
            href="https://developers.facebook.com/apps/1710743377107186/whatsapp-business/wa-dev-console/"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#075e54", color: "#fff", padding: "8px 14px", borderRadius: 6, fontWeight: 700, fontSize: 12, textDecoration: "none" }}
          >
            Open Meta WhatsApp Embedded Signup Console ↗
          </a>
        </div>
      )}

      {activeStep === 4 && (
        <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 10, padding: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#166534", marginBottom: 6 }}>
            🚀 Method A: Direct Meta Graph API (100% Localhost Friendly)
          </div>
          <p style={{ margin: "0 0 10px", color: "#166534", fontSize: 12 }}>
            <strong>Don&apos;t want to set up Cloudflare tunnels or SSL right now?</strong> You don&apos;t have to!
          </p>
          <p style={{ margin: "0 0 10px", color: "#334155", fontSize: 12, lineHeight: 1.5 }}>
            <strong>Method A (Direct Meta Graph API)</strong> executes entirely server-to-server. It communicates from your Node.js backend directly with Meta&apos;s Cloud API. It registers your real WhatsApp phone number, triggers SMS OTP verification, and assigns the PIN while you remain on <code>http://localhost:3002</code> without requiring client-side HTTPS.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href="#method-a"
              onClick={onClose}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#059669", color: "#fff", padding: "8px 14px", borderRadius: 6, fontWeight: 700, fontSize: 12, textDecoration: "none" }}
            >
              Go to Automated Method A (Direct Graph API) ➔
            </a>
          </div>
        </div>
      )}
    </div>
  )

  if (isModal) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cloudflare Tunnel and HTTPS Setup Guide"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.65)",
          backdropFilter: "blur(4px)",
          zIndex: 120,
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
            maxWidth: 620,
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              🛠️ Meta Embedded Signup HTTPS &amp; Tunnel Guide
            </h2>
            <button onClick={onClose} style={{ border: 0, background: "none", fontSize: 18, color: "#64748b", cursor: "pointer" }}>
              ✕
            </button>
          </div>
          {content}
        </div>
      </div>
    )
  }

  return content
}
