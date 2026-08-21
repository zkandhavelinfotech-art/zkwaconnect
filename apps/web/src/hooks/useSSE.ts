import { useEffect, useRef } from 'react'

export function useSSE(onEvent: (type: string, data: any) => void) {
  const esRef    = useRef<EventSource | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const token = (() => {
      try {
        const raw = localStorage.getItem('auth-storage')
        if (raw) return JSON.parse(raw).state?.accessToken
      } catch {}
      return null
    })()

    if (!token) return

    function connect() {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'
      // Pass token as query param — EventSource cannot send headers
      const es = new EventSource(`${base}/sse?token=${encodeURIComponent(token)}`)
      esRef.current = es

      // Generic message fallback
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          if (d?.type) onEvent(d.type, d.data)
        } catch {}
      }

      // Named events — must match server broadcastToTenant() event names exactly
      const EVENTS = [
        'NEW_LEAD',       // new lead created from inbound message
        'NEW_MESSAGE',    // new inbound WhatsApp message
        'MESSAGE_SENT',   // outbound message sent from inbox
        'CAMPAIGN_UPDATE',// campaign status changed
        'WABA_STATUS',    // WABA quality rating changed
      ]
      EVENTS.forEach(ev => {
        es.addEventListener(ev, (e: MessageEvent) => {
          try { onEvent(ev, JSON.parse(e.data)) } catch {}
        })
      })

      es.onerror = () => {
        es.close()
        esRef.current = null
        retryRef.current = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      esRef.current?.close()
      clearTimeout(retryRef.current)
    }
  }, [])
}
