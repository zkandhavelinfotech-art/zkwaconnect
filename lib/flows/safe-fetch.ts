import dns from "node:dns/promises"
import net from "node:net"

const MAX_BYTES = 100_000

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224
  }
  const lower = address.toLowerCase()
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7))
  return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80") || lower.startsWith("ff")
}

// Calls a customer-supplied HTTPS URL from a flow. Refuses internal addresses (SSRF), redirects,
// slow responses and large bodies.
export async function safeFetch(rawUrl: string, init: { method: "GET" | "POST"; body?: string; headers?: Record<string, string> }) {
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error("Invalid URL") }
  if (url.protocol !== "https:") throw new Error("Only https:// URLs are allowed")
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))
    throw new Error("Internal hosts are not allowed")
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true })
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error("Private network addresses are not allowed")

  const response = await fetch(url, {
    method: init.method, redirect: "manual", signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "ZKWAConnect-Flow/1.0", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    body: init.method === "POST" ? init.body : undefined,
  })
  const reader = response.body?.getReader()
  let received = 0
  const chunks: Uint8Array[] = []
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.length
    if (received > MAX_BYTES) { await reader.cancel(); throw new Error("Response is larger than 100 KB") }
    chunks.push(value)
  }
  const text = Buffer.concat(chunks).toString("utf8")
  return { ok: response.status >= 200 && response.status < 300, status: response.status, text }
}

// Reads a value like "data.items.0.name" from parsed JSON.
export function readPath(text: string, path: string) {
  if (!path.trim()) return text.slice(0, 500)
  let value: unknown
  try { value = JSON.parse(text) } catch { return "" }
  for (const key of path.split(".").filter(Boolean)) {
    if (value == null || typeof value !== "object") return ""
    value = (value as Record<string, unknown>)[key]
  }
  return value == null ? "" : typeof value === "object" ? JSON.stringify(value).slice(0, 500) : String(value).slice(0, 500)
}
