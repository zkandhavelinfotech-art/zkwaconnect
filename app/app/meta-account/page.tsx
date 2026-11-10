"use client"
import { useState } from "react"
import { MetaAccountDetails } from "@/components/meta/MetaAccountDetails"
import { InstagramConnect } from "@/components/meta/InstagramConnect"
import { MetaAuditHub } from "@/components/meta/MetaAuditHub"
import { WhatsAppGatewaySettings } from "@/components/gateway/WhatsAppGatewaySettings"
import { BusinessVerificationManager } from "@/components/meta/BusinessVerificationManager"
import { FacebookPageAccessManager } from "@/components/meta/FacebookPageAccessManager"
import { RtaConnectorHub } from "@/components/meta/RtaConnectorHub"
import { ProductionUpgradeManager } from "@/components/meta/ProductionUpgradeManager"
import { BusinessProfilesManager } from "@/components/meta/BusinessProfilesManager"

export default function MetaAccountPage() {
  const [tab, setTab] = useState<"rta" | "upgrade" | "profiles" | "pages" | "verification" | "gateway" | "audit" | "details">("rta")

  return (
    <div>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Meta & WhatsApp Center</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Facebook Page access, Business Verification, WhatsApp Cloud API gateway, and live diagnostics.
          </p>
        </div>

        <div style={{ display: "inline-flex", background: "#e2e8f0", padding: 3, borderRadius: 8, flexWrap: "wrap", gap: 2 }}>
          <button
            type="button"
            onClick={() => setTab("rta")}
            style={{
              padding: "6px 14px",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              background: tab === "rta" ? "#065f46" : "transparent",
              color: tab === "rta" ? "#fff" : "#065f46",
              boxShadow: tab === "rta" ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
            }}
          >
            ⚡ RTA WhatsApp & Page Linker
          </button>
          <button
            type="button"
            onClick={() => setTab("upgrade")}
            style={{
              padding: "6px 14px",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              background: tab === "upgrade" ? "#059669" : "transparent",
              color: tab === "upgrade" ? "#fff" : "#059669",
              boxShadow: tab === "upgrade" ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
            }}
          >
            🌟 Production Upgrade (Multi-Client)
          </button>
          <button
            type="button"
            onClick={() => setTab("profiles")}
            style={{
              padding: "6px 14px",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              background: tab === "profiles" ? "#1877F2" : "transparent",
              color: tab === "profiles" ? "#fff" : "#1877F2",
              boxShadow: tab === "profiles" ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
            }}
          >
            🏢 Portfolio Profiles (Pages &amp; IG)
          </button>
          <button
            type="button"
            onClick={() => setTab("pages")}
            style={{
              padding: "6px 14px",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              background: tab === "pages" ? "#fff" : "transparent",
              color: tab === "pages" ? "#0f172a" : "#64748b",
              boxShadow: tab === "pages" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            📄 Facebook Pages
          </button>
          <button
            type="button"
            onClick={() => setTab("verification")}
            style={{
              padding: "6px 14px",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              background: tab === "verification" ? "#fff" : "transparent",
              color: tab === "verification" ? "#0f172a" : "#64748b",
              boxShadow: tab === "verification" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            🛡️ Business Verification
          </button>
          <button
            type="button"
            onClick={() => setTab("gateway")}
            style={{
              padding: "6px 14px",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              background: tab === "gateway" ? "#fff" : "transparent",
              color: tab === "gateway" ? "#0f172a" : "#64748b",
              boxShadow: tab === "gateway" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            ⚡ WhatsApp Gateway
          </button>
          <button
            type="button"
            onClick={() => setTab("audit")}
            style={{
              padding: "6px 14px",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              background: tab === "audit" ? "#fff" : "transparent",
              color: tab === "audit" ? "#0f172a" : "#64748b",
              boxShadow: tab === "audit" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            🔍 Live Diagnostic & Audit
          </button>
          <button
            type="button"
            onClick={() => setTab("details")}
            style={{
              padding: "6px 14px",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              background: tab === "details" ? "#fff" : "transparent",
              color: tab === "details" ? "#0f172a" : "#64748b",
              boxShadow: tab === "details" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            📋 Connected Account Details
          </button>
        </div>
      </div>

      {tab === "rta" ? (
        <RtaConnectorHub />
      ) : tab === "upgrade" ? (
        <ProductionUpgradeManager />
      ) : tab === "profiles" ? (
        <BusinessProfilesManager />
      ) : tab === "pages" ? (
        <FacebookPageAccessManager />
      ) : tab === "verification" ? (
        <BusinessVerificationManager />
      ) : tab === "gateway" ? (
        <WhatsAppGatewaySettings />
      ) : tab === "audit" ? (
        <MetaAuditHub onConnected={() => setTab("gateway")} />
      ) : (
        <>
          <MetaAccountDetails />
          <InstagramConnect />
        </>
      )}
    </div>
  )
}
