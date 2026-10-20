"use client"
import { useRouter } from "next/navigation"
import { OnboardingShell, Notice, Card, StepList, Checklist } from "@/components/onboarding/OnboardingShell"
import { MetaConnectStep, useSetupStatus } from "@/components/onboarding/steps/MetaConnectStep"

export default function MetaConnectPage() {
  const router = useRouter()
  const { status, error, reload } = useSetupStatus()
  return (
    <OnboardingShell step={0} title="Connect your Facebook Business account"
      description="Link the Meta business portfolio that owns your WhatsApp account — or create a new one with Embedded Signup. It uses Meta's official login."
      badges={["Official Meta login", "Encrypted token storage", "Revocable anytime in Meta"]}
      aside={<>
        <Card title="Before you start">
          <Checklist id="meta-prereq" items={[
            "I have a Meta Business portfolio (business.facebook.com)",
            "I'm an admin of that business portfolio",
            "I have a phone number for WhatsApp Business",
            "I've decided my business display name",
          ]}/>
          <div style={{marginTop:14}}>
            <Notice tone="warning">If your number is active on the WhatsApp or WhatsApp Business <strong>app</strong>, delete that account first
              (WhatsApp → Settings → Account → Delete account). A number can't be on the app and the API at the same time.</Notice>
          </div>
        </Card>
        <Card title="What happens next">
          <StepList items={[
            {title:"Log in with Facebook", body:"A Facebook window opens. ZKWAConnect never sees your Facebook password."},
            {title:"Choose your business", body:"Pick the business portfolio that owns your WhatsApp Business Account."},
            {title:"Approve permissions", body:"Keep all permissions ticked so messaging, templates and leads work."},
            {title:"Come back here", body:"You return automatically to choose your WhatsApp account."},
          ]}/>
        </Card>
      </>}>
      {error && <Notice>{error}</Notice>}
      <MetaConnectStep status={status} reload={reload} onDone={redirect => router.push(redirect)} />
    </OnboardingShell>
  )
}
