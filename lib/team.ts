import crypto from "node:crypto"

export const INVITE_DAYS = 7
export const hashInviteToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex")
export const newInviteToken = () => crypto.randomBytes(32).toString("base64url")

// Invite links open on the address the inviter is using locally, else the public app URL.
export function inviteBase(requestUrl: string) {
  const origin = new URL(requestUrl).origin
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "")
}
