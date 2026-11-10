"use client"
import { WhatsAppGatewaySettings } from "@/components/gateway/WhatsAppGatewaySettings"

export default function GatewayPage() {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>
          WhatsApp Gateway Settings
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
          Live configuration for your Meta WhatsApp Cloud API gateway, phone number credentials, and test transmission.
        </p>
      </div>
      <WhatsAppGatewaySettings />
    </div>
  )
}

