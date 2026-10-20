import crypto from "node:crypto"
import { prisma } from "@/lib/db/prisma"

const PREFIX = "zkwa_live_"

export function hashKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex")
}

// A new secret key: shown to the user once; only its hash and a short prefix are stored.
export function generateKey() {
  const key = `${PREFIX}${crypto.randomBytes(24).toString("base64url")}`
  return { key, prefix: key.slice(0, PREFIX.length + 6), keyHash: hashKey(key) }
}

// Simple per-key rate limit: 600 requests per rolling minute (per server process).
const WINDOW_MS = 60_000
const LIMIT = 600
const hits = new Map<string, number[]>()
function allow(keyId: string) {
  const now = Date.now()
  const recent = (hits.get(keyId) || []).filter(at => now - at < WINDOW_MS)
  if (recent.length >= LIMIT) { hits.set(keyId, recent); return false }
  recent.push(now)
  hits.set(keyId, recent)
  return true
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message) }
}

// Reads "Authorization: Bearer <key>" or "X-API-Key: <key>".
export async function authenticateApiKey(request: Request) {
  const header = request.headers.get("authorization") || ""
  const key = (header.toLowerCase().startsWith("bearer ") ? header.slice(7) : request.headers.get("x-api-key") || "").trim()
  if (!key.startsWith(PREFIX)) throw new ApiError("Missing or malformed API key. Send it as 'Authorization: Bearer zkwa_live_…'.", 401, "unauthorized")
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(key) }, select: { id: true, organizationId: true, revokedAt: true, lastUsedAt: true } })
  if (!record || record.revokedAt) throw new ApiError("This API key is invalid or has been revoked.", 401, "unauthorized")
  if (!allow(record.id)) throw new ApiError("Rate limit exceeded (600 requests per minute). Slow down and retry.", 429, "rate_limited")
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000)
    await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => null)
  return { organizationId: record.organizationId, keyId: record.id }
}
