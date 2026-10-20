"use client"
import { useRouter } from "next/navigation"
import { OnboardingShell, Card } from "@/components/onboarding/OnboardingShell"
import { WabaStep } from "@/components/onboarding/steps/WabaStep"

export default function WabaSetupPage() {
  const router = useRouter()
  return (
    <OnboardingShell step={1} title="Choose your WhatsApp Business Account"
      description="These are all the WhatsApp Business Accounts your Facebook login can manage. Pick the one this workspace should use for the WhatsApp Business API."
      badges={["Live list from Meta", "Multiple businesses supported", "Switch anytime"]}
      aside={<>
        <Card title="How this works">
          <div style={{ display: "grid", gap: 10, fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
            <div><strong style={{ color: "#0f172a" }}>One active account per workspace.</strong> Campaigns, chatbots, templates and the inbox use the account you pick here.</div>
            <div><strong style={{ color: "#0f172a" }}>Switching is safe.</strong> Past conversations and contacts stay. If the new account&apos;s number was registered before, it&apos;s restored automatically.</div>
            <div><strong style={{ color: "#0f172a" }}>Messages arrive automatically.</strong> We subscribe the chosen account to ZKWAConnect so customer replies reach your inbox.</div>
          </div>
        </Card>
        <Card title="Don't see your account?">
          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, margin: "0 0 10px" }}>
            You need admin access to the business portfolio that owns it. Create a WhatsApp Business Account in WhatsApp Manager,
            or ask your business admin to add you, then reconnect Facebook so ZKWAConnect can see it.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: "#075E54" }}>Open WhatsApp Manager ↗</a>
            <a href="/api/meta/oauth/start" style={{ fontSize: 13, fontWeight: 700, color: "#1877F2" }}>Reconnect Facebook</a>
          </div>
        </Card>
      </>}>
      <WabaStep onDone={redirect => router.push(redirect)} onBack={() => router.push("/onboarding/meta-connect")} />
    </OnboardingShell>
  )
}
