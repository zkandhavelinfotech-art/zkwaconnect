"use client"
import { useEffect, useRef, useState } from "react"
import { primaryButton } from "@/components/onboarding/OnboardingShell"

type FacebookSdk = {
  init(options: Record<string, unknown>): void
  login(callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void, options: Record<string, unknown>): void
}
declare global { interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void } }

export type EmbeddedSignupConfig = { appId: string; configId: string; graphVersion: string }
type SessionInfo = { event: string; wabaId: string | null; phoneNumberId: string | null; currentStep?: string; error?: string }
export type EmbeddedSignupResult = { redirect: string; message?: string; warnings?: string[] }

let sdkPromise: Promise<FacebookSdk> | null = null
function loadSdk(config: EmbeddedSignupConfig) {
  if (window.FB) return Promise.resolve(window.FB)
  sdkPromise ??= new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: config.appId, autoLogAppEvents: true, xfbml: false, version: config.graphVersion })
      resolve(window.FB!)
    }
    const script = document.createElement("script")
    script.src = "https://connect.facebook.net/en_US/sdk.js"
    script.async = true
    script.crossOrigin = "anonymous"
    script.onerror = () => { sdkPromise = null; reject(new Error("Couldn't load Facebook's login script. Check your connection or ad blocker.")) }
    document.body.appendChild(script)
  })
  return sdkPromise
}

// Meta's Embedded Signup: the business creates or picks its portfolio, WhatsApp account and number in Meta's own popup.
export function EmbeddedSignupButton({ config, onDone, onError }: {
  config: EmbeddedSignupConfig; onDone: (result: EmbeddedSignupResult) => void; onError: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const session = useRef<SessionInfo | null>(null)

  useEffect(() => {
    loadSdk(config).catch(() => undefined)
    // Meta posts the chosen WABA and phone number from the popup window.
    function onMessage(event: MessageEvent) {
      if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return
        session.current = { event: data.event, wabaId: data.data?.waba_id || null, phoneNumberId: data.data?.phone_number_id || null,
          currentStep: data.data?.current_step, error: data.data?.error_message }
      } catch { /* other Facebook messages are not JSON */ }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [config])

  async function finish(code: string) {
    // The session message can arrive just after the login callback.
    for (let i = 0; i < 15 && !session.current; i++) await new Promise(resolve => setTimeout(resolve, 200))
    const info = session.current
    const response = await fetch("/api/meta/embedded-signup", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, wabaId: info?.wabaId || null, phoneNumberId: info?.phoneNumberId || null }) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "Embedded Signup could not be completed.")
    onDone({ redirect: body.redirect, message: body.message, warnings: body.warnings })
  }

  async function launch() {
    setBusy(true); session.current = null
    try {
      const FB = await loadSdk(config)
      FB.login(response => {
        const code = response.authResponse?.code
        if (!code) {
          const info = session.current
          onError(info?.event === "ERROR" ? `Meta reported an error: ${info.error || "unknown"}`
            : info?.event === "CANCEL" ? `Signup was closed at step “${info.currentStep || "unknown"}”. You can start again anytime.`
            : "Facebook login was cancelled.")
          setBusy(false); return
        }
        finish(code).catch(error => onError(error instanceof Error ? error.message : "Embedded Signup could not be completed.")).finally(() => setBusy(false))
      }, { config_id: config.configId, response_type: "code", override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } })
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't open Facebook login.")
      setBusy(false)
    }
  }

  return <button type="button" onClick={launch} disabled={busy} style={{ ...primaryButton, background: "#25D366", minWidth: 260, opacity: busy ? .7 : 1 }}>
    {busy ? "Waiting for Meta…" : "⚡ Set up with Embedded Signup"}
  </button>
}
