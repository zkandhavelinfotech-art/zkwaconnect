import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"
import { verifyPassword } from "@/lib/auth/password"
import { emailConfigured, sendEmail } from "@/lib/email"
import { storageDriver, testStorage } from "@/lib/storage"
import { platformWhatsApp, savePlatformWhatsApp, sendWhatsAppCode } from "@/lib/auth/whatsapp-otp"
import { metaLoginConfig } from "@/lib/meta/config"

async function superAdmin() {
  const session = await getSession()
  if (session?.user.adminRole !== "SUPER_ADMIN") throw Object.assign(new Error("Super admin access required."), { status: 403 })
  return session.user
}
const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: (error as { status?: number }).status || 400 })

type Check = { key: string; group: string; label: string; ok: boolean; warn?: boolean; detail: string }
const PLACEHOLDER = /your-|your |replace-with|example|change-?me|dev-secret|XXXX/i
const real = (value: string | undefined) => Boolean(value && !PLACEHOLDER.test(value))
const strong = (value: string | undefined) => Boolean(value && value.length >= 32 && !PLACEHOLDER.test(value))

// Go-live readiness: configuration, security and the URLs to paste into Meta's App Dashboard.
export async function GET() {
  try {
    await superAdmin()
    const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "")
    const meta = metaLoginConfig()
    const otp = await platformWhatsApp()
    const otpNumber = otp ? await prisma.phoneNumber.findUnique({ where: { id: otp.phoneNumberId }, select: { phoneNumber: true, displayName: true, status: true } }) : null
    const admins = await prisma.user.findMany({ where: { adminRole: "SUPER_ADMIN" }, select: { email: true, passwordHash: true, twoFactorEnabledAt: true } })
    const weakAdmin = [] as string[]
    for (const admin of admins) if (admin.passwordHash && (await verifyPassword("admin2026!", admin.passwordHash))) weakAdmin.push(admin.email)
    const demo = await prisma.user.findUnique({ where: { email: "demo@zkwaconnect.in" }, select: { passwordHash: true, status: true } })
    const demoOpen = Boolean(demo?.passwordHash && demo.status === "ACTIVE" && await verifyPassword("demo1234", demo.passwordHash))
    const driver = storageDriver()

    const checks: Check[] = [
      { key: "app_url", group: "Server", label: "Public HTTPS address (APP_URL)", ok: /^https:\/\//.test(appUrl) && !/localhost|127\.0\.0\.1/.test(appUrl), detail: appUrl || "Not set" },
      { key: "secrets", group: "Server", label: "SESSION_SECRET and ENCRYPTION_KEY are strong (32+ random characters)", ok: strong(process.env.SESSION_SECRET) && strong(process.env.ENCRYPTION_KEY),
        detail: [!strong(process.env.SESSION_SECRET) && "SESSION_SECRET", !strong(process.env.ENCRYPTION_KEY) && "ENCRYPTION_KEY"].filter(Boolean).join(", ") || "OK" },
      { key: "production", group: "Server", label: "Running in production mode", ok: process.env.NODE_ENV === "production", detail: process.env.NODE_ENV || "unknown" },
      { key: "worker", group: "Server", label: "Background worker (broadcasts, chatbot delays, reminders)", ok: process.env.CAMPAIGN_WORKER !== "off" || Boolean(process.env.CRON_SECRET),
        detail: process.env.CAMPAIGN_WORKER === "off" ? (process.env.CRON_SECRET ? "Cron mode: call /api/cron/campaigns every minute" : "Worker is off and CRON_SECRET is not set") : "Runs inside the server (needs an always-on host such as Railway)" },
      { key: "storage", group: "Server", label: "Media storage survives redeploys", ok: driver === "s3" || Boolean(process.env.STORAGE_DIR),
        detail: driver === "s3" ? `Bucket ${process.env.S3_BUCKET}` : process.env.STORAGE_DIR ? `Disk volume at ${process.env.STORAGE_DIR}` : "Server disk ./storage — files are lost on redeploy. Set S3_* (Cloudflare R2/S3) or STORAGE_DIR on a Railway volume." },
      { key: "meta_app", group: "Meta", label: "Meta app keys (META_APP_ID, META_APP_SECRET)", ok: meta.ready, detail: meta.missing.length ? `Missing: ${meta.missing.join(", ")}` : "OK" },
      { key: "meta_verify", group: "Meta", label: "Webhook verify token (META_VERIFY_TOKEN)", ok: Boolean(process.env.META_VERIFY_TOKEN && !PLACEHOLDER.test(process.env.META_VERIFY_TOKEN)), detail: process.env.META_VERIFY_TOKEN ? "Set" : "Not set" },
      { key: "meta_signup", group: "Meta", label: "Embedded Signup configuration (NEXT_PUBLIC_META_CONFIG_ID)", ok: /^\d{6,25}$/.test(process.env.NEXT_PUBLIC_META_CONFIG_ID || ""), detail: /^\d{6,25}$/.test(process.env.NEXT_PUBLIC_META_CONFIG_ID || "") ? process.env.NEXT_PUBLIC_META_CONFIG_ID! : "Not set — customers can't connect numbers themselves" },
      { key: "email", group: "Sign-in", label: "Email sending (SMTP) for password reset", ok: emailConfigured(), warn: !emailConfigured() && Boolean(otp),
        detail: emailConfigured() ? `From ${process.env.SMTP_FROM} via ${process.env.SMTP_HOST}` : "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM" },
      { key: "otp", group: "Sign-in", label: "WhatsApp verification codes from your own number", ok: Boolean(otp && otpNumber?.status === "CONNECTED"), warn: !otp && emailConfigured(),
        detail: otp ? `${otpNumber?.displayName || ""} ${otpNumber?.phoneNumber || "number not found"} · template “${otp.templateName}” (${otp.language})` : "Not set up (optional if email works)" },
      { key: "admin_password", group: "Security", label: "Default super-admin password changed", ok: weakAdmin.length === 0, detail: weakAdmin.length ? `Still using the seed password: ${weakAdmin.join(", ")}` : "OK" },
      { key: "admin_2fa", group: "Security", label: "Two-factor sign-in on for every super admin", ok: admins.every(admin => admin.twoFactorEnabledAt), warn: true,
        detail: admins.filter(admin => !admin.twoFactorEnabledAt).map(admin => admin.email).join(", ") || "OK" },
      { key: "demo", group: "Security", label: "Public demo account closed", ok: !demoOpen, detail: demoOpen ? "demo@zkwaconnect.in / demo1234 still works — suspend it or change its password" : "OK" },
      { key: "legal", group: "Legal", label: "Company details on legal pages (COMPANY_NAME, COMPANY_ADDRESS, SUPPORT_EMAIL)", ok: real(process.env.COMPANY_NAME) && real(process.env.COMPANY_ADDRESS) && real(process.env.SUPPORT_EMAIL),
        detail: [!real(process.env.COMPANY_NAME) && "COMPANY_NAME", !real(process.env.COMPANY_ADDRESS) && "COMPANY_ADDRESS", !real(process.env.SUPPORT_EMAIL) && "SUPPORT_EMAIL"].filter(Boolean).join(", ") || "OK" },
    ]
    const base = appUrl || "https://<your-domain>"
    const urls = [
      { label: "WhatsApp webhook callback URL", value: `${base}/api/webhooks/whatsapp`, where: "Meta App → WhatsApp → Configuration → Webhook (verify token = META_VERIFY_TOKEN; subscribe to messages, message_template_status_update)" },
      { label: "Facebook Login redirect URI", value: process.env.META_OAUTH_REDIRECT_URI || `${base}/api/meta/oauth/callback`, where: "Meta App → Facebook Login for Business → Settings → Valid OAuth Redirect URIs" },
      { label: "Privacy Policy URL", value: `${base}/privacy`, where: "Meta App → Settings → Basic" },
      { label: "Terms of Service URL", value: `${base}/terms`, where: "Meta App → Settings → Basic" },
      { label: "Data deletion request URL (callback)", value: `${base}/api/meta/data-deletion`, where: "Meta App → Settings → Basic → Data deletion → Data deletion callback URL" },
      { label: "Data deletion instructions URL", value: `${base}/data-deletion`, where: "Alternative to the callback; also link it from your website" },
      { label: "Refund policy URL", value: `${base}/refund-policy`, where: "Razorpay / Cashfree website verification" },
      { label: "Health check", value: `${base}/api/health`, where: "Uptime monitor (UptimeRobot, Better Stack…)" },
    ]
    const numbers = await prisma.phoneNumber.findMany({ where: { status: "CONNECTED", waba: { organization: { billingExempt: true } } },
      select: { id: true, phoneNumber: true, displayName: true, waba: { select: { organization: { select: { name: true } } } } } })
    const deletions = await prisma.dataDeletionRequest.findMany({ orderBy: { createdAt: "desc" }, take: 20 })
    return NextResponse.json({ checks, urls, otp, numbers: numbers.map(item => ({ id: item.id, label: `${item.displayName || item.phoneNumber} · ${item.phoneNumber} (${item.waba.organization.name})` })), deletions })
  } catch (error) { return fail(error) }
}

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test-email"), to: z.string().trim().email() }),
  z.object({ action: z.literal("test-storage") }),
  z.object({ action: z.literal("test-whatsapp"), phone: z.string().trim().min(8).max(20) }),
  z.object({ action: z.literal("save-otp"), phoneNumberId: z.string().min(1).nullable(), templateName: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, "Template names are lowercase letters, numbers and _").optional(), language: z.string().trim().min(2).max(10).optional() }),
  z.object({ action: z.literal("deletion-status"), id: z.string().min(1), status: z.enum(["RECEIVED", "IN_PROGRESS", "COMPLETED", "REJECTED"]) }),
])

export async function POST(request: Request) {
  try {
    const admin = await superAdmin()
    const input = action.parse(await request.json())
    if (input.action === "test-email") {
      await sendEmail({ to: input.to, subject: "ZKWAConnect email test", heading: "Email is working", paragraphs: [`Sent by ${admin.email} from the go-live checklist.`] })
      return NextResponse.json({ ok: true, message: `Test email sent to ${input.to}.` })
    }
    if (input.action === "test-storage") return NextResponse.json({ ok: true, message: `Storage works (${await testStorage() === "s3" ? "bucket" : "server disk"}).` })
    if (input.action === "test-whatsapp") {
      await sendWhatsAppCode(input.phone, String(Math.floor(100000 + Math.random() * 900000)))
      return NextResponse.json({ ok: true, message: `Test code sent to ${input.phone}.` })
    }
    if (input.action === "save-otp") {
      if (!input.phoneNumberId) { await savePlatformWhatsApp(null); return NextResponse.json({ ok: true, message: "WhatsApp codes turned off." }) }
      if (!input.templateName) throw new Error("Enter the approved authentication template name.")
      await savePlatformWhatsApp({ phoneNumberId: input.phoneNumberId, templateName: input.templateName, language: input.language || "en" })
      return NextResponse.json({ ok: true, message: "WhatsApp codes saved. Send a test code to check the template." })
    }
    await prisma.dataDeletionRequest.update({ where: { id: input.id }, data: { status: input.status, completedAt: input.status === "COMPLETED" ? new Date() : null } })
    return NextResponse.json({ ok: true, message: "Request updated." })
  } catch (error) { return fail(error) }
}
