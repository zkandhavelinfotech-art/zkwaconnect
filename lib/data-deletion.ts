import crypto from "node:crypto"
import { prisma } from "@/lib/db/prisma"

// Data deletion requests: from Meta's "Data deletion request callback" (someone removed our app in Facebook settings)
// or from the public form. Each gets a confirmation code the person can use to check the status.

export const newDeletionCode = () => `DEL-${crypto.randomBytes(5).toString("hex").toUpperCase()}`

// Meta signs the request with the app secret: "<base64url HMAC-SHA256 signature>.<base64url JSON payload>".
export function parseSignedRequest(signed: string, appSecret: string) {
  const [signature, payload] = signed.split(".")
  if (!signature || !payload) throw new Error("Malformed signed_request")
  const expected = crypto.createHmac("sha256", appSecret).update(payload).digest()
  const given = Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw new Error("Invalid signature")
  const data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { algorithm?: string; user_id?: string }
  if (data.algorithm && data.algorithm.toUpperCase() !== "HMAC-SHA256") throw new Error("Unsupported algorithm")
  return data
}

export async function createDeletionRequest(input: { source: "META_CALLBACK" | "FORM"; email?: string; facebookUserId?: string; note?: string }) {
  return prisma.dataDeletionRequest.create({ data: { code: newDeletionCode(), source: input.source, email: input.email?.toLowerCase(),
    facebookUserId: input.facebookUserId, note: input.note?.slice(0, 1000) } })
}

export const DELETION_STATUS: Record<string, string> = {
  RECEIVED: "Received — we will process it within 30 days.",
  IN_PROGRESS: "In progress.",
  COMPLETED: "Completed — the data has been deleted.",
  REJECTED: "Closed — we could not match this request to an account. Contact support with more details.",
}
