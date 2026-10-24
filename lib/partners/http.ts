import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"

// Shared by the /api/partner routes (route files may only export HTTP handlers).
export const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Request failed" },
  { status: (error as { status?: number }).status || 400 })

export async function sessionUser() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error("Sign in to continue."), { status: 401 })
  return session.user
}
