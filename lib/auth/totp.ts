import crypto from "node:crypto"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta/token"

// Authenticator-app codes (RFC 6238: 6 digits, 30-second steps, SHA-1), compatible with Google Authenticator, Microsoft Authenticator, Authy etc.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32Encode(bytes: Buffer) {
  let bits = 0, value = 0, out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "")
  let bits = 0, value = 0
  const out: number[] = []
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char); bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

export function totpCode(secret: string, step = Math.floor(Date.now() / 30_000)) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 15
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0")
}

// Accepts the current code and one step either side (clock drift).
export function verifyTotp(secret: string, code: string, now = Date.now()) {
  const clean = code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(clean)) return false
  const step = Math.floor(now / 30_000)
  return [-1, 0, 1].some(drift => crypto.timingSafeEqual(Buffer.from(totpCode(secret, step + drift)), Buffer.from(clean)))
}

export const newTotpSecret = () => base32Encode(crypto.randomBytes(20))

export function otpauthUrl(email: string, secret: string) {
  const issuer = "ZKWAConnect"
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

const hashRecovery = (code: string) => crypto.createHash("sha256").update(code.toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex")

export function newRecoveryCodes() {
  const codes = Array.from({ length: 8 }, () => { const raw = crypto.randomBytes(5).toString("hex"); return `${raw.slice(0, 5)}-${raw.slice(5)}` })
  return { codes, hashes: codes.map(hashRecovery) }
}

export const sealSecret = (secret: string) => encryptMetaToken(secret)
export const openSecret = (sealed: string) => decryptMetaToken(sealed)

// Sign-in check: an authenticator code, or a one-time recovery code (used up when accepted).
export async function verifySecondFactor(user: { id: string; twoFactorSecret: string | null; twoFactorRecovery: unknown }, code: string) {
  if (!user.twoFactorSecret) return false
  if (verifyTotp(openSecret(user.twoFactorSecret), code)) return true
  const hashes = Array.isArray(user.twoFactorRecovery) ? user.twoFactorRecovery as string[] : []
  const hash = hashRecovery(code)
  if (!/[a-z0-9]{10}/i.test(code.replace(/[^a-z0-9]/gi, "")) || !hashes.includes(hash)) return false
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorRecovery: hashes.filter(item => item !== hash) } })
  return true
}
