import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { connectInstagram, pagesWithInstagram } from "@/lib/instagram/accounts"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: errorStatus(error) })

// Connected Instagram accounts + Pages with Instagram that can be connected.
export async function GET() {
  try {
    const { organizationId } = await requireMember()
    const accounts = await prisma.instagramAccount.findMany({ where: { organizationId }, select: { id: true, pageId: true, pageName: true, username: true, pictureUrl: true, status: true, createdAt: true } })
    const token = await getMetaAccessToken(organizationId)
    let available: { pageId: string; pageName: string; username: string | null; pictureUrl: string | null }[] = []
    let error: string | null = token ? null : "Connect Facebook first."
    if (token) {
      try {
        available = (await pagesWithInstagram(token)).map(page => ({ pageId: page.id, pageName: page.name, username: page.instagram_business_account?.username || null,
          pictureUrl: page.instagram_business_account?.profile_picture_url || null }))
      } catch (reason) {
        error = `${(reason as Error).message} — reconnect Facebook and allow Instagram access (instagram_basic, instagram_manage_messages, pages_manage_metadata).`
      }
    }
    return NextResponse.json({ accounts, available: available.filter(page => !accounts.some(account => account.pageId === page.pageId)), error })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const { pageId } = z.object({ pageId: z.string().regex(/^\d+$/) }).parse(await request.json())
    const token = await getMetaAccessToken(organizationId)
    if (!token) return NextResponse.json({ error: "Connect Facebook first." }, { status: 409 })
    const account = await connectInstagram(organizationId, token, pageId)
    return NextResponse.json({ ok: true, message: `@${account.username} connected. New Instagram DMs will appear in your inbox.` })
  } catch (error) { return fail(error) }
}

export async function DELETE(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    await prisma.instagramAccount.updateMany({ where: { id: new URL(request.url).searchParams.get("id") || "", organizationId }, data: { status: "DISCONNECTED" } })
    return NextResponse.json({ ok: true, message: "Instagram disconnected. Existing chats stay in the inbox." })
  } catch (error) { return fail(error) }
}
