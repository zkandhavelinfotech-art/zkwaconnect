import { NextResponse } from "next/server"
import { trackClick } from "@/lib/pages/pages"

// Page button → log the tap (with a ref code) → open WhatsApp with the pre-filled message. The message comes from the
// published page, never from the URL, so links can't be abused to send arbitrary text.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const url = new URL(request.url)
  const section = (url.searchParams.get("s") || "").slice(0, 20)
  const item = Number(url.searchParams.get("i") ?? -1)
  const target = /^[\w-]{4,20}$/.test(section) && Number.isInteger(item) && item >= -1 && item < 100 ? await trackClick(slug, section, item) : null
  if (!target) return NextResponse.redirect(new URL(`/p/${encodeURIComponent(slug)}`, url), 302)
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } })
}
