import { NextRequest, NextResponse } from "next/server"
import { deleteSession } from "@/lib/auth/session"

export async function POST() {
  await deleteSession()
  return NextResponse.json({ ok: true })
}

// Clears a missing or expired session and continues to a local page, e.g. /api/auth/logout?next=/login
export async function GET(request: NextRequest) {
  await deleteSession()
  const next = request.nextUrl.searchParams.get("next") || "/login"
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/login"
  return NextResponse.redirect(new URL(safe, request.url))
}
