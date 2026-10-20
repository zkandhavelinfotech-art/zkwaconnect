import { NextResponse } from "next/server"
import { createDeletionRequest, parseSignedRequest } from "@/lib/data-deletion"

// Meta App Dashboard → Settings → Basic → "Data deletion request URL": https://<your domain>/api/meta/data-deletion
// Meta POSTs a signed_request when someone removes the app; we record it and return a status link + confirmation code.
export async function POST(request: Request) {
  const secret = process.env.META_APP_SECRET
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 })
  try {
    const form = await request.formData()
    const signed = String(form.get("signed_request") || "")
    const data = parseSignedRequest(signed, secret)
    const record = await createDeletionRequest({ source: "META_CALLBACK", facebookUserId: data.user_id, note: "Removed the app in Facebook settings" })
    const site = (process.env.APP_URL || new URL(request.url).origin).replace(/\/+$/, "")
    return NextResponse.json({ url: `${site}/data-deletion?code=${record.code}`, confirmation_code: record.code })
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}
