import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { graphVersion } from "@/lib/meta/graph"
import { metaLoginConfig } from "@/lib/meta/config"

export const runtime = "nodejs"

const FIELDS = ["messages", "message_template_status_update", "template_category_update"]
const schema = z.object({ callbackUrl: z.string().trim().url().optional() })

// Registers (or updates) the Meta app's WhatsApp webhook. Meta immediately calls the callback URL to verify it,
// so the URL must be publicly reachable over HTTPS and serve this app with the same META_VERIFY_TOKEN.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user || !["SUPER_ADMIN", "ADMIN"].includes(session.user.adminRole))
    return NextResponse.json({ error: "Only super admins and admins can change the Meta webhook." }, { status: 403 })
  try {
    if (!metaLoginConfig().ready) return NextResponse.json({ error: "Save the Meta App ID and secret first." }, { status: 409 })
    const verifyToken = process.env.META_VERIFY_TOKEN || ""
    if (verifyToken.length < 8 || /your-|replace-with|example/i.test(verifyToken))
      return NextResponse.json({ error: "Set a META_VERIFY_TOKEN first (Meta app credentials form → Generate a secure token)." }, { status: 409 })
    const input = schema.parse(await request.json().catch(() => ({})))
    const publicUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
    const callbackUrl = input.callbackUrl || `${publicUrl}/api/webhooks/whatsapp`
    if (!/^https:\/\//.test(callbackUrl)) return NextResponse.json({ error: "Meta only delivers webhooks to an https:// address." }, { status: 400 })
    if (/^https:\/\/(localhost|127\.0\.0\.1)/.test(callbackUrl)) return NextResponse.json({ error: "Meta can't reach localhost. Use your live domain or a tunnel address." }, { status: 400 })

    const appId = process.env.META_APP_ID!
    const appToken = `${appId}|${process.env.META_APP_SECRET}`
    const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${appId}/subscriptions`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(30000),
      body: new URLSearchParams({ object: "whatsapp_business_account", callback_url: callbackUrl, verify_token: verifyToken,
        fields: FIELDS.join(","), include_values: "true", access_token: appToken }),
    })
    const body = await response.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }
    if (!response.ok || !body.success)
      return NextResponse.json({ error: `Meta didn't accept the webhook: ${body.error?.message || `HTTP ${response.status}`}. Check that ${callbackUrl} is live and uses the same META_VERIFY_TOKEN.` }, { status: 400 })

    // Instagram DMs use the same callback (optional: needs the Instagram product added to the Meta app).
    const instagram = await fetch(`https://graph.facebook.com/${graphVersion()}/${appId}/subscriptions`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(30000),
      body: new URLSearchParams({ object: "instagram", callback_url: callbackUrl, verify_token: verifyToken, fields: "messages", access_token: appToken }),
    }).then(result => result.json()).catch(() => ({})) as { success?: boolean; error?: { message?: string } }
    await prisma.auditLog.create({ data: { userId: session.user.id, actorType: "ADMIN", action: "META_WEBHOOK_REGISTERED", resource: "platform",
      metadata: { callbackUrl, fields: FIELDS } } }).catch(() => null)
    return NextResponse.json({ ok: true, callbackUrl, fields: FIELDS,
      message: `Webhook registered: Meta will deliver ${FIELDS.join(", ")} events to ${callbackUrl}.${instagram.success ? " Instagram messages are subscribed too."
        : ` Instagram messages not subscribed${instagram.error?.message ? ` (${instagram.error.message})` : ""} — add the Instagram product to your Meta app if you use the Instagram inbox.`}` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not register the webhook." }, { status: 400 })
  }
}
