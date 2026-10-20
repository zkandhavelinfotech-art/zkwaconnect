"use client"
import { useEffect, useState } from "react"
import { OnboardingShell, Notice, primaryButton } from "@/components/onboarding/OnboardingShell"
import { MetaConnectStep, useSetupStatus } from "@/components/onboarding/steps/MetaConnectStep"
import { WabaStep } from "@/components/onboarding/steps/WabaStep"
import { PhoneStep } from "@/components/onboarding/steps/PhoneStep"

type StepId = "meta" | "waba" | "phone" | "done"

// Register → Connect Meta → WhatsApp account → Phone number → Live, all on one page.
export default function SetupWizardPage() {
  const { status, loading, error, reload } = useSetupStatus()
  const [open, setOpen] = useState<StepId | null>(null)

  const done = {
    meta: Boolean(status?.metaConnected),
    waba: Boolean(status?.metaConnected && status.wabaCreated),
    phone: Boolean(status?.metaConnected && status.wabaCreated && status.phoneVerified),
  }
  const current: StepId = !done.meta ? "meta" : !done.waba ? "waba" : !done.phone ? "phone" : "done"
  const active = open ?? current
  useEffect(() => { setOpen(null) }, [current])

  async function advance() { await reload(); setOpen(null); window.scrollTo({ top: 0, behavior: "smooth" }) }

  const steps: { id: StepId; title: string; summary: string | null; locked: boolean }[] = [
    { id: "meta", title: "Connect Meta Business Manager", locked: false,
      summary: done.meta ? `Connected as ${status?.meta?.name || "your Facebook account"}` : null },
    { id: "waba", title: "Choose WhatsApp Business Account", locked: !done.meta,
      summary: done.waba && status?.waba ? `${status.waba.name} · WABA ${status.waba.wabaId}` : null },
    { id: "phone", title: "Register phone number", locked: !done.waba,
      summary: done.phone && status?.phone ? `${status.phone.phoneNumber} · active` : null },
  ]

  return (
    <OnboardingShell step={{ meta: 0, waba: 1, phone: 2, done: 3 }[current]}
      title={current === "done" ? "Your WhatsApp Business API is live" : "Set up your WhatsApp Business API"}
      description="Every step on one page. Connect your Meta Business Manager, pick the WhatsApp account and register your number — you can change any step later."
      badges={["Official Meta login", "Embedded Signup or existing accounts", "About 5 minutes"]}>
      {error && <Notice>{error}</Notice>}
      {loading || !status ? <p style={{ fontSize: 13, color: "#64748b" }}>Loading your setup…</p> : <div style={{ display: "grid", gap: 12 }}>
        <StepRow number={1} title="Register your business" state="done"
          summary={<>Signed in as <strong>{status.account.name}</strong> ({status.account.email}) · Workspace <strong>{status.account.workspace}</strong>
            {" · "}<a href="/api/auth/logout?next=/login" style={{ color: "#075E54", fontWeight: 700 }}>Not you?</a></>} />

        {steps.map((step, index) => {
          const isDone = done[step.id as keyof typeof done]
          const isOpen = active === step.id && !step.locked
          return <StepRow key={step.id} number={index + 2} title={step.title}
            state={isDone ? "done" : step.locked ? "locked" : "current"}
            summary={step.summary} expanded={isOpen}
            onToggle={step.locked ? undefined : () => setOpen(isOpen ? (isDone ? current : null) : step.id)}>
            {isOpen && step.id === "meta" && <MetaConnectStep status={status} reload={reload} returnTo="/onboarding" showAccount={false}
              onDone={() => advance()} />}
            {isOpen && step.id === "waba" && <WabaStep onDone={() => advance()} />}
            {isOpen && step.id === "phone" && <PhoneStep onDone={() => advance()} />}
          </StepRow>
        })}

        <StepRow number={5} title="Go live" state={current === "done" ? "current" : "locked"} expanded={current === "done"}
          summary={current === "done" ? null : "Unlocks when your number is registered"}>
          {current === "done" && <div>
            <Notice tone="success">Meta, your WhatsApp Business Account and phone number are connected. Customer messages now reach your inbox.</Notice>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 10, marginBottom: 16 }}>
              {[["/app/meta-account", "🔗", "Review your Meta account", "IDs, token status and permissions"],
                ["/app/templates", "📋", "Pick a message template", "Choose from the library and submit to Meta"],
                ["/app/automation", "⚡", "Build a chatbot", "Menus, questions and handoff"],
                ["/app/contacts", "👥", "Import contacts", "Upload a CSV and tag your audience"]].map(([href, icon, title, body]) =>
                <a key={href} href={href} style={{ display: "flex", gap: 10, textDecoration: "none", color: "#0f172a", padding: 12, border: "1px solid #e2e8f0", borderRadius: 10 }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <span><span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{title}</span><span style={{ display: "block", fontSize: 12, color: "#64748b" }}>{body}</span></span>
                </a>)}
            </div>
            <a href="/app/dashboard" style={primaryButton}>Open dashboard →</a>
          </div>}
        </StepRow>
      </div>}
    </OnboardingShell>
  )
}

function StepRow({ number, title, state, summary, expanded = false, onToggle, children }: {
  number: number; title: string; state: "done" | "current" | "locked"; summary?: React.ReactNode
  expanded?: boolean; onToggle?: () => void; children?: React.ReactNode
}) {
  const colors = state === "done" ? { bg: "#25D366", fg: "#fff" } : state === "current" ? { bg: "#075E54", fg: "#fff" } : { bg: "#e2e8f0", fg: "#94a3b8" }
  return <div style={{ border: `1.5px solid ${expanded ? "#075E54" : "#e2e8f0"}`, borderRadius: 12, background: "#fff", opacity: state === "locked" ? .7 : 1 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" }}>
      <span style={{ width: 30, height: 30, borderRadius: "50%", background: colors.bg, color: colors.fg, display: "grid", placeItems: "center",
        fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{state === "done" ? "✓" : state === "locked" ? "🔒" : number}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "Sora,sans-serif", fontSize: 14, fontWeight: 700, color: state === "locked" ? "#94a3b8" : "#0f172a" }}>{title}</div>
        {summary && <div style={{ fontSize: 12, color: state === "done" ? "#15803d" : "#64748b", marginTop: 2, overflowWrap: "anywhere" }}>{summary}</div>}
      </div>
      {onToggle && state === "done" && <button type="button" onClick={onToggle} style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 8,
        padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#075E54" }}>{expanded ? "Close" : "Change"}</button>}
    </div>
    {expanded && children && <div style={{ padding: "4px 18px 20px", borderTop: "1px solid #f1f5f9" }}><div style={{ paddingTop: 14 }}>{children}</div></div>}
  </div>
}
