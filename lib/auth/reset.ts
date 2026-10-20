import crypto from "node:crypto"
import { prisma } from "@/lib/db/prisma"
import { hashPassword } from "@/lib/auth/password"
import { emailConfigured, sendEmail } from "@/lib/email"
import { platformWhatsApp, sendWhatsAppCode } from "@/lib/auth/whatsapp-otp"
import { LIMITS, clearThrottle } from "@/lib/auth/throttle"

// Forgot password: a one-time link by email and/or a 6-digit code on WhatsApp (to the mobile number on the profile).
// Valid for 30 minutes, single use, 5 wrong codes and it's void. Resetting signs the user out everywhere.

const VALID_MINUTES = 30
const MAX_CODE_ATTEMPTS = 5
const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex")

export async function resetChannels() {
  return { email: emailConfigured(), whatsapp: Boolean(await platformWhatsApp()) }
}

export const maskPhone = (phone: string) => { const digits = phone.replace(/\D/g, ""); return `+${digits.slice(0, 2)} ••••• ${digits.slice(-3)}` }

// Never reveals whether the email has an account; returns which channels were attempted for a real account.
export async function requestPasswordReset(email: string, origin: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, name: true, email: true, phone: true, status: true } })
  if (!user || user.status !== "ACTIVE") return { sent: [] as string[] }
  const available = await resetChannels()
  const token = crypto.randomBytes(32).toString("base64url")
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")
  const useWhatsApp = available.whatsapp && Boolean(user.phone)
  // Older unused requests stop working.
  await prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } })
  const reset = await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha(token), codeHash: useWhatsApp ? sha(`${user.id}:${code}`) : null,
    channels: [], expiresAt: new Date(Date.now() + VALID_MINUTES * 60_000) } })
  const sent: string[] = []
  if (available.email) {
    const link = `${origin}/reset-password?token=${token}`
    await sendEmail({ to: user.email, subject: "Reset your ZKWAConnect password", heading: `Hi ${user.name.split(" ")[0] || "there"},`,
      paragraphs: ["We received a request to reset the password for your ZKWAConnect account.", `This link works once and expires in ${VALID_MINUTES} minutes.`],
      button: { text: "Choose a new password", url: link },
      footer: "If you didn't ask for this, you can ignore this email — your password stays the same." })
      .then(() => sent.push("email")).catch(error => console.error("[auth] reset email failed", error))
  }
  if (useWhatsApp) await sendWhatsAppCode(user.phone!, code).then(() => sent.push("whatsapp")).catch(error => console.error("[auth] reset WhatsApp code failed", error))
  await prisma.passwordReset.update({ where: { id: reset.id }, data: { channels: sent } })
  return { sent, phone: sent.includes("whatsapp") ? maskPhone(user.phone!) : undefined }
}

export class ResetError extends Error { readonly status = 400 }

export async function completePasswordReset(input: { token?: string; email?: string; code?: string }, password: string) {
  let reset
  if (input.token) {
    reset = await prisma.passwordReset.findUnique({ where: { tokenHash: sha(input.token) } })
  } else if (input.email && input.code) {
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() }, select: { id: true } })
    reset = user ? await prisma.passwordReset.findFirst({ where: { userId: user.id, usedAt: null, codeHash: { not: null } }, orderBy: { createdAt: "desc" } }) : null
    if (reset && reset.expiresAt > new Date() && reset.attempts < MAX_CODE_ATTEMPTS && reset.codeHash !== sha(`${reset.userId}:${input.code.replace(/\D/g, "")}`)) {
      await prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } })
      throw new ResetError(reset.attempts + 1 >= MAX_CODE_ATTEMPTS ? "Too many wrong codes. Request a new one." : "That code is not right. Check WhatsApp and try again.")
    }
  }
  if (!reset || reset.usedAt || reset.expiresAt < new Date() || reset.attempts >= MAX_CODE_ATTEMPTS)
    throw new ResetError("This reset link or code has expired or was already used. Request a new one.")
  const claimed = await prisma.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } })
  if (!claimed.count) throw new ResetError("This reset link or code was already used. Request a new one.")
  const user = await prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() } })
  await prisma.session.deleteMany({ where: { userId: user.id } })
  await clearThrottle(LIMITS.loginAccount(user.email))
  return user
}
