import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { emitEvent } from "@/lib/developer/webhooks"
import { isPreviewBot } from "@/lib/links"

export const runtime = "nodejs"

// Short tracked link: count the click, then redirect to the real destination.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const link = /^[A-Za-z0-9]{6,16}$/.test(code) ? await prisma.trackedLink.findUnique({ where: { code } }) : null
  if (!link) return new NextResponse("This link has expired or doesn't exist.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } })
  if (!isPreviewBot(request.headers.get("user-agent"))) {
    const now = new Date()
    await prisma.trackedLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 }, lastClickedAt: now, ...(link.firstClickedAt ? {} : { firstClickedAt: now }) } })
    if (link.recipientId) await prisma.campaignRecipient.updateMany({ where: { id: link.recipientId, clickedAt: null }, data: { clickedAt: now } })
    if (!link.firstClickedAt) await emitEvent(link.organizationId, "link.clicked", { link: `/l/${link.code}`, destination: link.destination,
      campaign_id: link.campaignId, contact_id: link.contactId, conversation_id: link.conversationId, clicked_at: now.toISOString() })
  }
  return NextResponse.redirect(link.destination, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
}
