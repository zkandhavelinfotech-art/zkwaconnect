"use client"
import { useEffect, useState } from "react"

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallPrompt | null = null
const listeners = new Set<() => void>()

// Registers the service worker once and remembers the browser's install prompt.
export function usePwa() {
  const [installable, setInstallable] = useState(false)
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => null)
    const update = () => setInstallable(Boolean(deferred))
    const onPrompt = (event: Event) => { event.preventDefault(); deferred = event as InstallPrompt; listeners.forEach(listener => listener()) }
    const onInstalled = () => { deferred = null; listeners.forEach(listener => listener()) }
    listeners.add(update); update()
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => { listeners.delete(update); window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled) }
  }, [])
  return { installable, install: async () => { if (!deferred) return; await deferred.prompt(); await deferred.userChoice.catch(() => null); deferred = null; listeners.forEach(listener => listener()) } }
}

// Top-bar button shown only when the browser offers installation.
export function InstallButton() {
  const { installable, install } = usePwa()
  if (!installable) return null
  return <button onClick={install} title="Install ZKWAConnect as an app" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.14)", color: "#fff",
    border: "1px solid rgba(255,255,255,.3)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📲 Install app</button>
}

function base64ToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - base64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}

// Profile → turn new-message notifications on/off for this device.
export function NotificationSettings() {
  const { installable, install } = usePwa()
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "on" | "off">("loading")
  const [message, setMessage] = useState("")
  const [standalone, setStandalone] = useState(false)

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches)
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return }
    if (Notification.permission === "denied") { setState("denied"); return }
    navigator.serviceWorker.ready.then(registration => registration.pushManager.getSubscription()).then(subscription => setState(subscription ? "on" : "off")).catch(() => setState("off"))
  }, [])

  async function enable() {
    setMessage("")
    try {
      if (await Notification.requestPermission() !== "granted") { setState("denied"); return }
      const { publicKey } = await fetch("/api/push").then(response => response.json())
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) })
      const response = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setState("on"); setMessage(body.message)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Couldn't turn on notifications.") }
  }
  async function disable() {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) { await fetch(`/api/push?endpoint=${encodeURIComponent(subscription.endpoint)}`, { method: "DELETE" }); await subscription.unsubscribe() }
    setState("off"); setMessage("Notifications turned off on this device.")
  }
  async function test() {
    const body = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: true }) }).then(response => response.json())
    setMessage(body.message || body.error)
  }

  const button: React.CSSProperties = { border: 0, borderRadius: 6, padding: "8px 13px", background: "#075e54", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }
  return <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, marginTop: 18 }}>
    <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, margin: "0 0 4px", color: "#102a2a" }}>📲 Mobile app &amp; notifications</h2>
    <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Install ZKWAConnect on your phone or computer like an app, and get a notification when a customer messages you
      (chats assigned to you, or everyone&apos;s unassigned chats).</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {standalone ? <span style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}>✓ Running as an installed app</span>
        : installable ? <button onClick={install} style={button}>Install app</button>
        : <span style={{ fontSize: 12, color: "#64748b" }}>To install: on Android/Chrome use menu ⋮ → <em>Install app</em>; on iPhone use Share → <em>Add to Home Screen</em> (iOS 16.4+ for notifications).</span>}
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
      {state === "loading" && <span style={{ fontSize: 12, color: "#64748b" }}>Checking…</span>}
      {state === "unsupported" && <span style={{ fontSize: 12, color: "#64748b" }}>This browser doesn&apos;t support notifications{/iPhone|iPad/.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? " — add the app to your Home Screen first" : ""}.</span>}
      {state === "denied" && <span style={{ fontSize: 12, color: "#92400e" }}>Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload.</span>}
      {state === "off" && <button onClick={enable} style={button}>Turn on notifications</button>}
      {state === "on" && <><span style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}>🔔 Notifications are on for this device</span>
        <button onClick={test} style={{ ...button, background: "#fff", color: "#075e54", border: "1px solid #cbd5d3" }}>Send a test</button>
        <button onClick={disable} style={{ ...button, background: "#fff", color: "#b91c1c", border: "1px solid #cbd5d3" }}>Turn off</button></>}
    </div>
    {message && <p role="status" style={{ fontSize: 12, color: "#334155", margin: "10px 0 0" }}>{message}</p>}
  </section>
}
