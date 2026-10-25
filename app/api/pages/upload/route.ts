import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { putFile } from "@/lib/storage"

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }

// Image upload for pages (logo, hero, cards, gallery). PNG / JPG / WebP up to 3 MB; no SVG (it could carry scripts).
export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) throw new Error("Choose an image.")
    const ext = TYPES[file.type]
    if (!ext) throw new Error("Use a PNG, JPG or WebP image.")
    if (file.size > 3 * 1024 * 1024) throw new Error("Images must be under 3 MB.")
    const name = `${organizationId.slice(-8)}-${crypto.randomBytes(8).toString("hex")}.${ext}`
    await putFile("page-assets", name, Buffer.from(await file.arrayBuffer()), file.type)
    return NextResponse.json({ ok: true, url: `/api/public/page-asset/${name}` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: errorStatus(error) })
  }
}
