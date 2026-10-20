import crypto from "node:crypto"
import path from "node:path"
import { graphVersion } from "@/lib/meta/graph"
import { getFile, putFile } from "@/lib/storage"

export type SendKind = "image" | "video" | "audio" | "document"

// What WhatsApp accepts per message type (documents capped at 25 MB to keep uploads practical).
const RULES: { kind: SendKind; mimes: string[]; maxBytes: number }[] = [
  { kind: "image", mimes: ["image/jpeg", "image/png"], maxBytes: 5 * 1024 * 1024 },
  { kind: "video", mimes: ["video/mp4", "video/3gpp"], maxBytes: 16 * 1024 * 1024 },
  { kind: "audio", mimes: ["audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg"], maxBytes: 16 * 1024 * 1024 },
  { kind: "document", mimes: ["application/pdf", "text/plain", "text/csv", "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"], maxBytes: 25 * 1024 * 1024 },
]
export const ATTACHMENT_ACCEPT = RULES.flatMap(rule => rule.mimes).join(",")

export function attachmentRule(mime: string) {
  const rule = RULES.find(item => item.mimes.includes(mime.split(";")[0].trim().toLowerCase()))
  if (!rule) throw new Error("WhatsApp can't send this file type. Use a JPG/PNG image, MP4 video, MP3/AAC/OGG audio, or a PDF/Office/text document.")
  return rule
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/3gpp": "3gp", "audio/aac": "aac",
  "audio/amr": "amr", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv" }

export async function storeMedia(bytes: Buffer | Uint8Array, mime: string) {
  // "local:" is kept as the key prefix for compatibility; the file lives in the configured storage (disk or bucket).
  const file = `${crypto.randomUUID()}.${EXT[mime.split(";")[0]] || "bin"}`
  await putFile("inbox-media", file, bytes, mime.split(";")[0])
  return `local:${file}`
}

export async function readStoredMedia(key: string) {
  return getFile("inbox-media", path.basename(key.replace(/^local:/, "")))
}

export async function uploadToWhatsApp(bytes: Uint8Array, mime: string, name: string, metaPhoneNumberId: string, accessToken: string) {
  const form = new FormData()
  form.append("messaging_product", "whatsapp")
  form.append("type", mime)
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), name)
  const result = await fetch(`https://graph.facebook.com/${graphVersion()}/${metaPhoneNumberId}/media`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: form, signal: AbortSignal.timeout(120000),
  }).then(response => response.json()) as { id?: string; error?: { message?: string } }
  if (!result.id) throw new Error(`WhatsApp media upload failed: ${result.error?.message || "unknown error"}`)
  return result.id
}

// Incoming media: look up the short-lived URL for the media ID, then download it with the token.
export async function downloadWhatsAppMedia(mediaId: string, accessToken: string) {
  const info = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000),
  }).then(response => response.json()) as { url?: string; mime_type?: string; error?: { message?: string } }
  if (!info.url) throw new Error(info.error?.message || "WhatsApp no longer has this file (media is kept for 30 days).")
  const response = await fetch(info.url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`Could not download the file from WhatsApp (${response.status}).`)
  return { bytes: Buffer.from(await response.arrayBuffer()), mime: info.mime_type || response.headers.get("content-type") || "application/octet-stream" }
}
