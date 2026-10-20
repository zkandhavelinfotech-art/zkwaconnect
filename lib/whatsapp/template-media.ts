import crypto from "node:crypto"
import { createTrackedLink, type LinkContext } from "@/lib/links"
import fs from "node:fs/promises"
import path from "node:path"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { graphVersion } from "@/lib/meta/graph"

export type MediaKind = "image" | "video" | "document"
export type MediaAsset = { path: string; mime: string; name: string; size: number }
export type MediaAssets = { header?: MediaAsset; cards?: MediaAsset[]; cache?: Record<string, { id: string; at: string }> }

// WhatsApp template media rules (document capped lower than Meta's 100 MB to keep uploads practical).
export const MEDIA_RULES: Record<MediaKind, { mimes: string[]; maxBytes: number; label: string }> = {
  image: { mimes: ["image/jpeg", "image/png"], maxBytes: 5 * 1024 * 1024, label: "JPG or PNG, up to 5 MB" },
  video: { mimes: ["video/mp4", "video/3gpp"], maxBytes: 16 * 1024 * 1024, label: "MP4, up to 16 MB" },
  document: { mimes: ["application/pdf"], maxBytes: 20 * 1024 * 1024, label: "PDF, up to 20 MB" },
}

const STORAGE = path.join(process.cwd(), "storage", "template-media")
const CACHE_DAYS = 25 // WhatsApp media IDs last 30 days

function resolveAsset(asset: MediaAsset) {
  const full = path.resolve(STORAGE, path.basename(asset.path))
  if (!full.startsWith(STORAGE)) throw new Error("Invalid media path")
  return full
}

// Validates and stores an uploaded data: URL; returns the stored asset.
export async function saveTemplateMedia(dataUrl: string, name: string, kind: MediaKind): Promise<MediaAsset> {
  const match = dataUrl.match(/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/)
  if (!match) throw new Error("Upload a file for the template media.")
  const [, mime, base64] = match
  const rule = MEDIA_RULES[kind]
  if (!rule.mimes.includes(mime)) throw new Error(`${kind[0].toUpperCase()}${kind.slice(1)} must be ${rule.label}.`)
  const bytes = Buffer.from(base64, "base64")
  if (bytes.length > rule.maxBytes) throw new Error(`File is too large — ${rule.label}.`)
  const ext = { "image/jpeg": "jpg", "image/png": "png", "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf" }[mime] || "bin"
  await fs.mkdir(STORAGE, { recursive: true })
  const file = `${crypto.randomUUID()}.${ext}`
  await fs.writeFile(path.join(STORAGE, file), bytes)
  return { path: file, mime, name: name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || `media.${ext}`, size: bytes.length }
}

// Meta's resumable upload: returns the header_handle used as the template's review sample.
export async function uploadSampleHandle(asset: MediaAsset, accessToken: string) {
  const appId = process.env.META_APP_ID
  if (!appId) throw new Error("META_APP_ID is not configured.")
  const bytes = await fs.readFile(resolveAsset(asset))
  const start = await fetch(`https://graph.facebook.com/${graphVersion()}/${appId}/uploads?file_name=${encodeURIComponent(asset.name)}&file_length=${bytes.length}&file_type=${encodeURIComponent(asset.mime)}&access_token=${encodeURIComponent(accessToken)}`,
    { method: "POST", signal: AbortSignal.timeout(30000) }).then(response => response.json()) as { id?: string; error?: { message?: string } }
  if (!start.id) throw new Error(`Meta upload failed: ${start.error?.message || "no upload session"}`)
  const done = await fetch(`https://graph.facebook.com/${graphVersion()}/${start.id}`, {
    method: "POST", headers: { Authorization: `OAuth ${accessToken}`, file_offset: "0" }, body: bytes, signal: AbortSignal.timeout(120000),
  }).then(response => response.json()) as { h?: string; error?: { message?: string } }
  if (!done.h) throw new Error(`Meta upload failed: ${done.error?.message || "no file handle"}`)
  return done.h
}

// Uploads the stored file to WhatsApp for sending (cached per phone number for 25 days).
async function mediaIdForSend(templateId: string, key: string, asset: MediaAsset, metaPhoneNumberId: string, accessToken: string) {
  const template = await prisma.template.findUnique({ where: { id: templateId }, select: { mediaAssets: true } })
  const assets = (template?.mediaAssets || {}) as MediaAssets
  const cacheKey = `${metaPhoneNumberId}:${key}:${asset.path}`
  const cached = assets.cache?.[cacheKey]
  if (cached && Date.now() - Date.parse(cached.at) < CACHE_DAYS * 86_400_000) return cached.id
  const form = new FormData()
  form.append("messaging_product", "whatsapp")
  form.append("type", asset.mime)
  form.append("file", new Blob([await fs.readFile(resolveAsset(asset))], { type: asset.mime }), asset.name)
  const result = await fetch(`https://graph.facebook.com/${graphVersion()}/${metaPhoneNumberId}/media`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: form, signal: AbortSignal.timeout(120000),
  }).then(response => response.json()) as { id?: string; error?: { message?: string } }
  if (!result.id) throw new Error(`WhatsApp media upload failed: ${result.error?.message || "unknown error"}`)
  await prisma.template.update({ where: { id: templateId }, data: { mediaAssets: { ...assets,
    cache: { ...(assets.cache || {}), [cacheKey]: { id: result.id, at: new Date().toISOString() } } } as Prisma.InputJsonValue } })
  return result.id
}

type MetaComponent = { type?: string; format?: string; cards?: { components?: MetaComponent[] }[]; buttons?: { type?: string; text?: string }[] }
type TemplateRow = { id: string; name: string; language: string; content: string | null; components: Prisma.JsonValue; mediaAssets: Prisma.JsonValue
  organizationId?: string; trackedButtons?: Prisma.JsonValue }
export type TrackedButton = { index: number; destination: string }
export const trackedButtonsOf = (value: Prisma.JsonValue | undefined) =>
  (Array.isArray(value) ? value : []).filter((item): item is TrackedButton => Boolean(item && typeof item === "object" && "destination" in item)) as unknown as TrackedButton[]

// URL-button parameters for click-tracked buttons: a fresh short link for this message.
export async function trackedButtonComponents(template: TemplateRow, context: LinkContext) {
  const components: Record<string, unknown>[] = []
  for (const button of trackedButtonsOf(template.trackedButtons)) {
    const { code } = await createTrackedLink(button.destination, { templateId: template.id, ...context })
    components.push({ type: "button", sub_type: "url", index: String(button.index), parameters: [{ type: "text", text: code }] })
  }
  return components
}

// Builds the "template" object for a send: body variables, media header and carousel cards.
export async function buildTemplateMessage(template: TemplateRow, bodyParameters: string[], target: { accessToken: string; metaPhoneNumberId: string },
  options: { links?: Partial<LinkContext> | false } = {}) {
  const components = (Array.isArray(template.components) ? template.components : []) as MetaComponent[]
  const assets = (template.mediaAssets || {}) as MediaAssets
  const out: Record<string, unknown>[] = []
  const header = components.find(item => item.type?.toUpperCase() === "HEADER")
  const headerKind = header?.format?.toLowerCase() as MediaKind | undefined
  if (headerKind && ["image", "video", "document"].includes(headerKind)) {
    if (!assets.header) throw new Error(`Template “${template.name}” has a ${headerKind} header but no stored file. Re-create it in ZKWAConnect to send it.`)
    const id = await mediaIdForSend(template.id, "header", assets.header, target.metaPhoneNumberId, target.accessToken)
    out.push({ type: "header", parameters: [{ type: headerKind, [headerKind]: { id, ...(headerKind === "document" ? { filename: assets.header.name } : {}) } }] })
  }
  if (bodyParameters.length) out.push({ type: "body", parameters: bodyParameters.map(text => ({ type: "text", text })) })
  const carousel = components.find(item => item.type?.toUpperCase() === "CAROUSEL")
  if (carousel?.cards?.length) {
    if (!assets.cards || assets.cards.length < carousel.cards.length)
      throw new Error(`Carousel template “${template.name}” has no stored card media. Re-create it in ZKWAConnect to send it.`)
    const cards = await Promise.all(carousel.cards.map(async (card, index) => {
      const cardHeader = card.components?.find(item => item.type?.toUpperCase() === "HEADER")
      const kind = (cardHeader?.format?.toLowerCase() || "image") as MediaKind
      const id = await mediaIdForSend(template.id, `card${index}`, assets.cards![index], target.metaPhoneNumberId, target.accessToken)
      const buttons = card.components?.find(item => item.type?.toUpperCase() === "BUTTONS")?.buttons || []
      return { card_index: index, components: [
        { type: "header", parameters: [{ type: kind, [kind]: { id } }] },
        ...buttons.map((button, buttonIndex) => button.type?.toUpperCase() === "QUICK_REPLY"
          ? { type: "button", sub_type: "quick_reply", index: String(buttonIndex), parameters: [{ type: "payload", payload: (button.text || "reply").slice(0, 128) }] }
          : null).filter(Boolean),
      ] }
    }))
    out.push({ type: "carousel", cards })
  }
  if (options.links !== false && template.organizationId && trackedButtonsOf(template.trackedButtons).length)
    out.push(...await trackedButtonComponents(template, { organizationId: template.organizationId, ...(options.links || {}) }))
  return { name: template.name, language: { code: template.language }, ...(out.length ? { components: out } : {}) }
}
