import crypto from "node:crypto"
import { prisma } from "@/lib/db/prisma"

export const API_PREFIXES = ["zk_live_", "zkwa_live_"] as const
const DEFAULT_PREFIX = "zk_live_"
const SECRET_PREFIX = "zk_secret_"

// Derive a steady 32-byte key for AES-256-GCM from environment
function getMasterKey(): Buffer {
  const secret = process.env.APP_SECRET || process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "zkwaconnect-api-hmac-master-key-32b"
  return crypto.createHash("sha256").update(secret).digest()
}

export function encryptSecret(plainSecret: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", getMasterKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decryptSecret(encryptedPayload: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = encryptedPayload.split(":")
    if (!ivHex || !tagHex || !dataHex) return null
    const decipher = crypto.createDecipheriv("aes-256-gcm", getMasterKey(), Buffer.from(ivHex, "hex"))
    decipher.setAuthTag(Buffer.from(tagHex, "hex"))
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex")
}

export const ALL_SCOPES = [
  { id: "messages:send", name: "Send Messages", description: "Send WhatsApp text, template, and media messages" },
  { id: "messages:read", name: "Read Messages", description: "Query message delivery and read status" },
  { id: "templates:read", name: "Read Templates", description: "Fetch approved WhatsApp message templates" },
  { id: "contacts:read", name: "Read Contacts", description: "Query customer contacts by phone or tag" },
  { id: "contacts:write", name: "Manage Contacts", description: "Create, update, and tag contacts" },
  { id: "webhooks:manage", name: "Webhooks", description: "Register and manage webhook event subscriptions" },
  { id: "account:read", name: "Account Details", description: "Read organization, phone numbers, and usage" },
] as const

export type ApiScope = typeof ALL_SCOPES[number]["id"]

// Generate a full pair: API Key + Secret Key (with HMAC signing capability)
export function generateKey(options?: {
  scopes?: string[]
  rateLimit?: number
  expiresInDays?: number | null
}) {
  const apiKey = `${DEFAULT_PREFIX}${crypto.randomBytes(24).toString("base64url")}`
  const secretKey = `${SECRET_PREFIX}${crypto.randomBytes(32).toString("base64url")}`
  const prefix = `${apiKey.slice(0, 15)}…`
  const keyHash = hashKey(apiKey)
  const secretEncrypted = encryptSecret(secretKey)

  const scopes = options?.scopes && options.scopes.length > 0
    ? options.scopes
    : ALL_SCOPES.map(s => s.id)

  const rateLimit = options?.rateLimit && options.rateLimit > 0 ? options.rateLimit : 60

  const expiresAt = options?.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
    : null

  return {
    apiKey,
    secretKey,
    prefix,
    keyHash,
    secretEncrypted,
    scopes,
    rateLimit,
    expiresAt,
  }
}

// In-memory sliding window rate limiter
const WINDOW_MS = 60_000
const hits = new Map<string, number[]>()

function checkRateLimit(keyId: string, limit: number): boolean {
  const now = Date.now()
  const recent = (hits.get(keyId) || []).filter(at => now - at < WINDOW_MS)
  if (recent.length >= limit) {
    hits.set(keyId, recent)
    return false
  }
  recent.push(now)
  hits.set(keyId, recent)
  return true
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
  }
}

export type ApiAuthContext = {
  organizationId: string
  keyId: string
  applicationName: string
  scopes: string[]
  rateLimit: number
}

// Validates whether key possesses the required scope
export function hasScope(grantedScopes: unknown, requiredScope?: string): boolean {
  if (!requiredScope) return true
  if (!grantedScopes || !Array.isArray(grantedScopes)) return true // default allow if unspecified
  if (grantedScopes.includes("*") || grantedScopes.includes("all")) return true
  return grantedScopes.includes(requiredScope)
}

// Authenticates incoming requests via Bearer Token, X-ZKWA-Key, or HMAC-SHA256 signature
export async function authenticateApiKey(
  request: Request,
  requiredScope?: string,
  rawBody?: string
): Promise<ApiAuthContext> {
  const authHeader = request.headers.get("authorization") || ""
  const xKey = request.headers.get("x-zkwa-key") || request.headers.get("x-api-key") || ""
  
  let key = ""
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    key = authHeader.slice(7).trim()
  } else if (xKey) {
    key = xKey.trim()
  }

  const isPrefixValid = API_PREFIXES.some(p => key.startsWith(p))
  if (!key || !isPrefixValid) {
    throw new ApiError(
      "Missing or malformed API key. Send it as 'Authorization: Bearer zk_live_…' or header 'X-ZKWA-Key'.",
      401,
      "unauthorized"
    )
  }

  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashKey(key) },
    select: {
      id: true,
      name: true,
      organizationId: true,
      secretEncrypted: true,
      scopes: true,
      rateLimit: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
  })

  if (!record || record.revokedAt) {
    throw new ApiError("This API key is invalid or has been revoked.", 401, "unauthorized")
  }

  if (record.expiresAt && Date.now() > record.expiresAt.getTime()) {
    throw new ApiError("This API key has expired. Please generate a new key in your dashboard.", 401, "key_expired")
  }

  // Rate Limiting
  const limit = record.rateLimit || 60
  if (!checkRateLimit(record.id, limit)) {
    throw new ApiError(
      `Rate limit exceeded (${limit} requests per minute). Slow down and retry.`,
      429,
      "rate_limited"
    )
  }

  // Scope Verification
  const grantedScopes = Array.isArray(record.scopes) ? (record.scopes as string[]) : ALL_SCOPES.map(s => s.id)
  if (requiredScope && !hasScope(grantedScopes, requiredScope)) {
    throw new ApiError(
      `Permission denied: this API key lacks the required scope '${requiredScope}'.`,
      403,
      "insufficient_scope"
    )
  }

  // HMAC-SHA256 Signature Verification (if X-ZKWA-Signature is passed)
  const signature = request.headers.get("x-zkwa-signature")
  const timestamp = request.headers.get("x-zkwa-timestamp")

  if (signature && record.secretEncrypted) {
    if (!timestamp) {
      throw new ApiError("Missing 'X-ZKWA-Timestamp' header for signed request.", 401, "invalid_signature")
    }

    // Check timestamp freshness (±300 seconds / 5 mins replay attack prevention)
    const tsNumber = Number(timestamp)
    if (isNaN(tsNumber) || Math.abs(Date.now() / 1000 - tsNumber) > 300) {
      throw new ApiError("Request timestamp is too old or in the future (>5 minutes).", 401, "signature_expired")
    }

    const plainSecret = decryptSecret(record.secretEncrypted)
    if (!plainSecret) {
      throw new ApiError("Could not verify key secret.", 500, "crypto_error")
    }

    // Verify HMAC
    const url = new URL(request.url)
    const candidates = [
      `${timestamp}.${request.method.toUpperCase()}.${url.pathname}${rawBody ? "." + rawBody : ""}`,
      `${timestamp}.${rawBody || ""}`,
      `${timestamp}.${request.method.toUpperCase()}.${url.pathname}`,
    ]

    let verified = false
    const cleanSig = signature.replace(/^sha256=/, "").trim().toLowerCase()

    for (const stringToSign of candidates) {
      const expected = crypto.createHmac("sha256", plainSecret).update(stringToSign).digest("hex")
      if (
        expected.length === cleanSig.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleanSig))
      ) {
        verified = true
        break
      }
    }

    if (!verified) {
      throw new ApiError("Invalid HMAC-SHA256 signature.", 401, "invalid_signature")
    }
  }

  // Update lastUsedAt debounced to at most once a minute
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => null)
  }

  return {
    organizationId: record.organizationId,
    keyId: record.id,
    applicationName: record.name,
    scopes: grantedScopes,
    rateLimit: limit,
  }
}
