import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { brandForHost } from "@/lib/partners/brand"

// Brand for the sign-in / sign-up pages on a partner's address (null on the main ZKWAConnect address).
export async function GET() {
  const list = await headers()
  const brand = await brandForHost(list.get("x-forwarded-host") || list.get("host"))
  return NextResponse.json({ brand }, { headers: { "Cache-Control": "public, max-age=60" } })
}
