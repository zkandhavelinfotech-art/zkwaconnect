"use client"
import { RtaConnectorHub } from "@/components/meta/RtaConnectorHub"

export default function RtaConnectPage() {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 0 40px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>
          RTA WhatsApp Cloud API & Facebook Page Hub
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          Dedicated management tool for Recruitment Training Academy (Business Portfolio: 1707214344108990).
        </p>
      </div>

      <RtaConnectorHub />
    </div>
  )
}

