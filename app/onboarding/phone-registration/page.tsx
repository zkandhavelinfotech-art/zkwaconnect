"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { OnboardingShell, Notice, Card, StepList } from "@/components/onboarding/OnboardingShell"
import { PhoneStep } from "@/components/onboarding/steps/PhoneStep"

export default function PhoneRegistrationPage() {
  const router = useRouter()
  const [wabaName, setWabaName] = useState("")
  return (
    <OnboardingShell step={2} title="Register your WhatsApp phone number"
      description={wabaName ? `Choose a number from ${wabaName}. Verify it with a 6-digit code from Meta (skipped if Meta already verified it), then set a PIN.` : "Choose a number, verify it with Meta, then set a PIN."}
      badges={["SMS or voice code", "India +91 ready", "Messaging limits grow automatically"]}
      aside={<>
        <Notice tone="warning"><strong>Before you begin:</strong> the number must not be registered on the WhatsApp or WhatsApp Business app.
          If it is, delete that account first (WhatsApp → Settings → Account → Delete account).</Notice>
        <Card title="How it works">
          <StepList items={[
            {title:"Pick the number", body:"Numbers are added to your WABA in Meta's WhatsApp Manager. They appear here automatically."},
            {title:"Get a code", body:<>Meta sends a 6-digit code by <strong>SMS</strong> or <strong>voice call</strong>. Use voice for landlines.</>},
            {title:"Enter code and PIN", body:"Choose a 6-digit PIN that protects the number's two-step verification. Keep it safe."},
            {title:"You're live", body:"The number is registered on the WhatsApp Cloud API and ready to send and receive."},
          ]}/>
        </Card>
        <Card title="Messaging limits">
          <div style={{fontSize:12,color:"#64748b",lineHeight:1.7}}>New numbers start with a daily limit on how many unique customers you can message first.
            Limits increase automatically (1K → 10K → 100K → unlimited) as you send good-quality messages to opted-in contacts.</div>
        </Card>
      </>}>
      <PhoneStep onDone={redirect => router.push(redirect)} onBack={() => router.push("/onboarding/waba-setup")} onWabaName={setWabaName} />
    </OnboardingShell>
  )
}
