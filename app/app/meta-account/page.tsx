"use client"
import { useState } from "react"
import { RtaConnectorHub } from "@/components/meta/RtaConnectorHub"
import { FacebookPageAccessManager } from "@/components/meta/FacebookPageAccessManager"
import { BusinessProfilesManager } from "@/components/meta/BusinessProfilesManager"
import { WhatsAppGatewaySettings } from "@/components/gateway/WhatsAppGatewaySettings"
import { BusinessVerificationManager } from "@/components/meta/BusinessVerificationManager"
import { MetaAuditHub } from "@/components/meta/MetaAuditHub"
import { MetaAccountDetails } from "@/components/meta/MetaAccountDetails"
import { InstagramConnect } from "@/components/meta/InstagramConnect"
import { ProductionUpgradeManager } from "@/components/meta/ProductionUpgradeManager"

export default function MetaAccountPage() {
  const [activeTab, setActiveTab] = useState<"channels" | "pages" | "diagnostics">("channels")
  const [showMultiClientUpgrade, setShowMultiClientUpgrade] = useState(false)

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", paddingBottom: 40 }}>
      {/* Header & Streamlined Tab Navigation */}
      <div
        style={{
          marginBottom: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          padding: "18px 24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Meta & WhatsApp Center
            </h1>
            <span
              style={{
                background: "#ecfdf5",
                color: "#065f46",
                fontSize: 11,
                fontWeight: 800,
                padding: "2px 8px",
                borderRadius: 12,
                border: "1px solid #a7f3d0",
              }}
            >
              CLOUD API GATEWAY
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Automated WABA provisioning, AiSensy number migration, Facebook Page integration, and Cloud API gateway.
          </p>
        </div>

        {/* 3 Core Tabs (AiSensy / Interakt Simplified Model) */}
        <div style={{ display: "inline-flex", background: "#f1f5f9", padding: 4, borderRadius: 10, gap: 4 }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab("channels")
              setShowMultiClientUpgrade(false)
            }}
            style={{
              padding: "8px 16px",
              border: 0,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: activeTab === "channels" ? "#065f46" : "transparent",
              color: activeTab === "channels" ? "#fff" : "#475569",
              boxShadow: activeTab === "channels" ? "0 2px 6px rgba(6, 95, 70, 0.2)" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📱</span> WhatsApp Channels &amp; Numbers
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pages")}
            style={{
              padding: "8px 16px",
              border: 0,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: activeTab === "pages" ? "#1877F2" : "transparent",
              color: activeTab === "pages" ? "#fff" : "#475569",
              boxShadow: activeTab === "pages" ? "0 2px 6px rgba(24, 119, 242, 0.2)" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🏢</span> Facebook Pages &amp; Agency
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("diagnostics")}
            style={{
              padding: "8px 16px",
              border: 0,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: activeTab === "diagnostics" ? "#0f172a" : "transparent",
              color: activeTab === "diagnostics" ? "#fff" : "#475569",
              boxShadow: activeTab === "diagnostics" ? "0 2px 6px rgba(15, 23, 42, 0.2)" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🛡️</span> Diagnostics &amp; Security
          </button>
        </div>
      </div>

      {/* TAB 1: WhatsApp Channels & Numbers */}
      {activeTab === "channels" && (
        <div style={{ display: "grid", gap: 20 }}>
          {/* Sub-header banner to switch to Multi-Client mode if needed */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Managing multiple agency client portfolios?
            </span>
            <button
              type="button"
              onClick={() => setShowMultiClientUpgrade(!showMultiClientUpgrade)}
              style={{
                background: showMultiClientUpgrade ? "#059669" : "#fff",
                color: showMultiClientUpgrade ? "#fff" : "#059669",
                border: "1.5px solid #059669",
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>🌟</span> {showMultiClientUpgrade ? "Hide Multi-Client Manager" : "Open Multi-Client Upgrade Manager"}
            </button>
          </div>

          {showMultiClientUpgrade && (
            <div style={{ background: "#fff", border: "1.5px solid #10b981", borderRadius: 12, padding: 20, boxShadow: "0 4px 12px rgba(16, 185, 129, 0.1)" }}>
              <ProductionUpgradeManager />
            </div>
          )}

          <RtaConnectorHub />
        </div>
      )}

      {/* TAB 2: Facebook Pages & Agency Partner */}
      {activeTab === "pages" && (
        <div style={{ display: "grid", gap: 24 }}>
          <FacebookPageAccessManager />
          <BusinessProfilesManager />
        </div>
      )}

      {/* TAB 3: Diagnostics, Security & Gateway Settings */}
      {activeTab === "diagnostics" && (
        <div style={{ display: "grid", gap: 24 }}>
          <WhatsAppGatewaySettings />
          <BusinessVerificationManager />
          <MetaAuditHub onConnected={() => setActiveTab("channels")} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 20 }}>
            <MetaAccountDetails />
            <InstagramConnect />
          </div>
        </div>
      )}
    </div>
  )
}
