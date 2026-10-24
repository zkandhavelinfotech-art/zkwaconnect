"use client"
import { useCallback, useEffect, useRef, useState } from "react"

// Floating WhatsApp call widget (mounted in the app shell when the plan includes Calling):
// rings for incoming calls, answers them with the browser's microphone over WebRTC, and places call-backs
// (other pages fire window "zk:call" with { contactId, name }).

type ActiveCall = { id: string; direction: "INBOUND" | "OUTBOUND"; status: string; offerSdp: string | null; answerSdp: string | null; answeredById: string | null
  startedById: string | null; answeredAt: string | null; createdAt: string; contact: { id: string; name: string | null; phone: string } | null }

const ICE = [{ urls: "stun:stun.l.google.com:19302" }]
const post = (body: unknown) => fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Call failed"); return result })

// Meta expects the full SDP (all ICE candidates), so wait for gathering to finish (max 4 s).
function iceComplete(pc: RTCPeerConnection) {
  return new Promise<void>(resolve => {
    if (pc.iceGatheringState === "complete") return resolve()
    const done = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", done); resolve() } }
    pc.addEventListener("icegatheringstatechange", done)
    setTimeout(resolve, 4000)
  })
}
const who = (call: ActiveCall | null, fallback = "Customer") => call?.contact?.name || (call?.contact ? `+${call.contact.phone}` : fallback)
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

export function CallManager() {
  const [calls, setCalls] = useState<ActiveCall[]>([])
  const [mine, setMine] = useState<{ id: string; name: string; outgoing: boolean } | null>(null)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const pc = useRef<RTCPeerConnection | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const ring = useRef<{ ctx: AudioContext; timer: number } | null>(null)

  const cleanup = useCallback(() => {
    pc.current?.close(); pc.current = null
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null
    setMine(null); setMuted(false)
  }, [])

  const poll = useCallback(async () => {
    const response = await fetch("/api/calls?active=1").catch(() => null)
    if (!response?.ok) return
    const body = await response.json() as { calls: ActiveCall[] }
    setCalls(body.calls)
  }, [])

  useEffect(() => {
    poll()
    const timer = setInterval(() => { if (document.visibilityState === "visible" || pc.current) poll() }, 3000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(timer); clearInterval(tick) }
  }, [poll])

  // My call: apply the customer's SDP answer for call-backs, and tidy up when it ends.
  useEffect(() => {
    if (!mine) return
    const call = calls.find(item => item.id === mine.id)
    if (!call) { cleanup(); return }
    if (mine.outgoing && call.answerSdp && pc.current && !pc.current.remoteDescription)
      pc.current.setRemoteDescription({ type: "answer", sdp: call.answerSdp }).catch(reason => setError(`Audio setup failed: ${reason}`))
  }, [calls, mine, cleanup])

  const ringing = calls.filter(call => call.direction === "INBOUND" && call.status === "RINGING" && !call.answeredById)

  // Ring tone while a call is waiting (browsers may block sound until the page has been clicked once).
  useEffect(() => {
    if (ringing.length && !mine && !ring.current) {
      try {
        const ctx = new AudioContext()
        const beep = () => { const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.frequency.value = 880; gain.gain.value = .08; osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .4) }
        beep(); ring.current = { ctx, timer: window.setInterval(beep, 1500) }
      } catch { /* audio not allowed */ }
    }
    if ((!ringing.length || mine) && ring.current) { clearInterval(ring.current.timer); ring.current.ctx.close().catch(() => null); ring.current = null }
  }, [ringing.length, mine])

  async function media() {
    const connection = new RTCPeerConnection({ iceServers: ICE })
    const local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    local.getTracks().forEach(track => connection.addTrack(track, local))
    connection.ontrack = event => { if (audio.current) { audio.current.srcObject = event.streams[0]; audio.current.play().catch(() => null) } }
    connection.onconnectionstatechange = () => { if (connection.connectionState === "failed") setError("The call's audio connection failed (network or firewall).") }
    pc.current = connection; stream.current = local
    return connection
  }

  async function answer(call: ActiveCall) {
    if (!call.offerSdp) return
    setBusy(true); setError("")
    try {
      const connection = await media()
      await connection.setRemoteDescription({ type: "offer", sdp: call.offerSdp })
      await connection.setLocalDescription(await connection.createAnswer())
      await iceComplete(connection)
      setMine({ id: call.id, name: who(call), outgoing: false })
      await post({ action: "answer", id: call.id, sdp: connection.localDescription!.sdp })
      poll()
    } catch (reason) {
      cleanup()
      setError(reason instanceof DOMException ? "Allow microphone access in your browser to answer calls." : reason instanceof Error ? reason.message : "Could not answer.")
    } finally { setBusy(false) }
  }

  const startCallBack = useCallback(async (contactId: string, name: string) => {
    if (pc.current) { setError("Finish the current call first."); return }
    setBusy(true); setError("")
    try {
      const connection = await media()
      await connection.setLocalDescription(await connection.createOffer())
      await iceComplete(connection)
      const result = await post({ action: "start", contactId, sdp: connection.localDescription!.sdp })
      setMine({ id: result.id, name, outgoing: true }); poll()
    } catch (reason) {
      cleanup()
      setError(reason instanceof DOMException ? "Allow microphone access in your browser to make calls." : reason instanceof Error ? reason.message : "Could not call.")
    } finally { setBusy(false) }
  }, [cleanup, poll])

  useEffect(() => {
    const listener = (event: Event) => { const detail = (event as CustomEvent<{ contactId: string; name: string }>).detail; startCallBack(detail.contactId, detail.name) }
    window.addEventListener("zk:call", listener)
    return () => window.removeEventListener("zk:call", listener)
  }, [startCallBack])

  async function hangUp() {
    if (mine) await post({ action: "end", id: mine.id }).catch(() => null)
    cleanup(); poll()
  }
  function toggleMute() {
    stream.current?.getAudioTracks().forEach(track => { track.enabled = muted })
    setMuted(!muted)
  }

  const live = mine ? calls.find(call => call.id === mine.id) : null
  if (!ringing.length && !mine && !error) return <audio ref={audio} autoPlay />

  const box: React.CSSProperties = { position: "fixed", right: 16, bottom: 16, zIndex: 80, width: "min(320px, calc(100vw - 32px))", background: "#0b3b36", color: "#fff",
    borderRadius: 14, boxShadow: "0 12px 32px rgba(0,0,0,.3)", padding: 14, fontFamily: "DM Sans,system-ui,sans-serif" }
  const button = (bg: string): React.CSSProperties => ({ flex: 1, border: 0, borderRadius: 10, padding: "10px 8px", background: bg, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" })

  return <div role="dialog" aria-live="assertive" aria-label="WhatsApp call" style={box}>
    <audio ref={audio} autoPlay />
    {mine ? <>
      <div style={{ fontSize: 12, opacity: .75 }}>{mine.outgoing ? (live?.status === "ANSWERED" ? "On call" : "Calling…") : "On call"}</div>
      <div style={{ fontSize: 17, fontWeight: 700, margin: "2px 0 6px" }}>📞 {mine.name}</div>
      <div style={{ fontSize: 13, opacity: .85, marginBottom: 10 }}>{live?.answeredAt ? clock(Math.max(0, Math.round((now - Date.parse(live.answeredAt)) / 1000))) : live?.status === "REJECTED" ? "Declined" : "Ringing…"}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={toggleMute} style={button("rgba(255,255,255,.15)")}>{muted ? "🔇 Unmute" : "🎙️ Mute"}</button>
        <button type="button" onClick={hangUp} style={button("#dc2626")}>Hang up</button>
      </div>
    </> : ringing.slice(0, 2).map(call => <div key={call.id} style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, opacity: .75 }}>Incoming WhatsApp call</div>
      <div style={{ fontSize: 17, fontWeight: 700, margin: "2px 0 10px" }}>📞 {who(call)}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" disabled={busy} onClick={() => answer(call)} style={button("#16a34a")}>{busy ? "Connecting…" : "Answer"}</button>
        <button type="button" disabled={busy} onClick={() => post({ action: "reject", id: call.id }).then(poll).catch(() => null)} style={button("#dc2626")}>Decline</button>
      </div>
    </div>)}
    {error && <div role="alert" style={{ marginTop: 8, fontSize: 12, background: "rgba(220,38,38,.25)", borderRadius: 8, padding: 8 }}>{error}
      <button type="button" onClick={() => setError("")} style={{ float: "right", border: 0, background: "none", color: "#fff", cursor: "pointer" }} aria-label="Dismiss">✕</button></div>}
  </div>
}
