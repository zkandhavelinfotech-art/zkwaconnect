import crypto from "node:crypto"
import { prisma } from "@/lib/db/prisma"

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// Public base for short links (your app's domain).
export function linkBase() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")
}

export function newLinkCode(length = 10) {
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, byte => ALPHABET[byte % ALPHABET.length]).join("")
}

export type LinkContext = { organizationId: string; templateId?: string; campaignId?: string; recipientId?: string; contactId?: string; conversationId?: string }

export function isTrackableUrl(url: string) {
  try { const parsed = new URL(url); return parsed.protocol === "https:" || parsed.protocol === "http:" } catch { return false }
}

// One short link per message, so each click can be tied to the person and broadcast.
export async function createTrackedLink(destination: string, context: LinkContext) {
  if (!isTrackableUrl(destination)) throw new Error("Tracked links need a full http(s) URL.")
  const code = newLinkCode()
  await prisma.trackedLink.create({ data: { code, destination, ...context } })
  return { code, url: `${linkBase()}/l/${code}` }
}

// Link-preview fetchers (WhatsApp, Facebook, Slack…) open links too; their visits aren't counted as clicks.
export function isPreviewBot(userAgent: string | null) {
  return /whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|skypeuripreview|googlebot|bingbot|preview/i.test(userAgent || "")
}
