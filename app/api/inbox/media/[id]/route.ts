import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { downloadWhatsAppMedia, readStoredMedia, storeMedia } from "@/lib/whatsapp/media"

export const runtime = "nodejs"

function mediaPart(metadata: unknown) {
  const message = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {}
  const part = message[String(message.type || "")] as { id?: string; mime_type?: string; filename?: string } | undefined
  return part?.id ? part : null
}

// Serves a message's photo / video / audio / document to workspace members.
// Incoming files are fetched from WhatsApp once, then kept locally.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  const membership = session?.user.memberships.find(item => item.status === "ACTIVE")
  if (!membership) return new Response("Unauthorized", { status: 401 })
  const { id } = await params
  const message = await prisma.message.findFirst({ where: { id, conversation: { organizationId: membership.organizationId } },
    select: { id: true, mediaUrl: true, metadata: true } })
  if (!message) return new Response("Not found", { status: 404 })
  const meta = (message.metadata && typeof message.metadata === "object" ? message.metadata : {}) as Record<string, unknown>
  try {
    let mime = typeof meta.mime === "string" ? meta.mime : mediaPart(message.metadata)?.mime_type || "application/octet-stream"
    let bytes: Buffer
    if (message.mediaUrl?.startsWith("local:")) bytes = await readStoredMedia(message.mediaUrl)
    else {
      const part = mediaPart(message.metadata)
      if (!part?.id) return new Response("No media on this message", { status: 404 })
      const token = await getMetaAccessToken(membership.organizationId)
      if (!token) return new Response("Meta is not connected", { status: 409 })
      const downloaded = await downloadWhatsAppMedia(part.id, token)
      bytes = downloaded.bytes
      mime = downloaded.mime
      await prisma.message.update({ where: { id: message.id }, data: { mediaUrl: await storeMedia(bytes, mime),
        metadata: { ...meta, mime } } })
    }
    const filename = (typeof meta.filename === "string" ? meta.filename : mediaPart(message.metadata)?.filename) || ""
    const inline = /^(image|video|audio)\//.test(mime) || mime === "application/pdf"
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; media-src 'self'; img-src 'self'",
      "Content-Disposition": `${inline ? "inline" : "attachment"}${filename ? `; filename="${filename.replace(/[^\w.\- ]/g, "_")}"` : ""}` } })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not load the file.", { status: 502 })
  }
}
