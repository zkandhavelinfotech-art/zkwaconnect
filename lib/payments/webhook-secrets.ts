import crypto from "node:crypto"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"

// One webhook URL per gateway serves the platform (plan payments) and every workspace (their customers' payments):
// find the payment from the event, then check the signature with the secret of the account that created the link.
export async function webhookSecretFor(payment: { paymentAccountId: string | null }, provider: "RAZORPAY" | "CASHFREE") {
  if (payment.paymentAccountId) {
    const account = await prisma.paymentAccount.findUnique({ where: { id: payment.paymentAccountId } })
    if (!account?.secretEncrypted) return null
    const secrets = JSON.parse(decryptMetaToken(account.secretEncrypted)) as { webhookSecret?: string; clientSecret?: string }
    // Cashfree signs webhooks with the client secret unless a separate one is set.
    return secrets.webhookSecret || (provider === "CASHFREE" ? secrets.clientSecret : undefined) || null
  }
  return (provider === "RAZORPAY" ? process.env.RAZORPAY_WEBHOOK_SECRET : process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_CLIENT_SECRET) || null
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export const razorpaySignature = (secret: string, raw: string) => crypto.createHmac("sha256", secret).update(raw).digest("hex")
export const cashfreeSignature = (secret: string, timestamp: string, raw: string) => crypto.createHmac("sha256", secret).update(timestamp + raw).digest("base64")
