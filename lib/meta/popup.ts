import { NextResponse } from "next/server"

export const POPUP_MESSAGE = "zk-meta-oauth"

// Ends a popup Facebook login: tells the ZKWAConnect tab what happened (same origin only) and closes the window.
// Falls back to a link if the opener tab is gone.
export function popupResult(origin: string, result: { ok: boolean; error?: string; reason?: string | null }, fallbackPath: string) {
  const payload = JSON.stringify({ type: POPUP_MESSAGE, ...result }).replace(/</g, "\\u003c")
  const target = JSON.stringify(origin).replace(/</g, "\\u003c")
  const href = fallbackPath.replace(/[^\w/?=&%.+-]/g, "")
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZKWAConnect</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a}
a{color:#075E54;font-weight:700}</style></head><body><div style="text-align:center;padding:24px">
<p>${result.ok ? "Facebook connected. You can close this window." : "Facebook login didn't finish. You can close this window."}</p>
<p><a href="${href}">Continue in ZKWAConnect</a></p></div>
<script>try{if(window.opener&&!window.opener.closed){window.opener.postMessage(${payload},${target});window.close()}}catch(e){}</script></body></html>`
  const response = new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
  return response
}
