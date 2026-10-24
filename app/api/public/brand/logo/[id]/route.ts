import { prisma } from "@/lib/db/prisma"
import { getFile } from "@/lib/storage"

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }

// A partner's logo (stored in media storage; PNG / JPG / WebP only — no SVG, so it can't carry scripts).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const partner = await prisma.partner.findUnique({ where: { id }, select: { logoPath: true, status: true } })
  if (!partner?.logoPath || partner.status !== "ACTIVE") return new Response("Not found", { status: 404 })
  try {
    const bytes = await getFile("brand-assets", partner.logoPath)
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": TYPES[partner.logoPath.split(".").pop() || ""] || "application/octet-stream",
      "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } })
  } catch { return new Response("Not found", { status: 404 }) }
}
