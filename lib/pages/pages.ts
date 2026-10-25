import crypto from "node:crypto"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { planState } from "@/lib/billing/limits"
import { brandForOrganization } from "@/lib/partners/brand"
import { notifyWorkspace } from "@/lib/payments/notify"
import { buildFromTemplate } from "./templates"
import { RESERVED_SLUGS, SECTION_TYPES, ctaMessage, slugify, type PageType, type Section, type Theme } from "./types"

// WhatsApp Page Builder (server side): plan limits, validation, publishing, click tracking and lead capture.

// Pages per plan (approved: Free 1 page with "Powered by"; paid plans more, no branding line). Internal workspaces: unlimited.
const PAGE_LIMITS: Record<string, number | null> = { free: 1, starter: 3, business: 10, professional: 25, enterprise: null }

export async function pageAllowance(organizationId: string) {
  const state = await planState(organizationId)
  const limit = state.internal ? null : state.onFree ? 1 : PAGE_LIMITS[state.planSlug || "free"] ?? 1
  const used = await prisma.sitePage.count({ where: { organizationId } })
  return { limit, used, canCreate: limit === null || used < limit, poweredBy: !state.internal && (state.onFree || state.planSlug === "free"), planName: state.planName }
}

// Footer line on public pages: free plan → "Powered by ZKWAConnect" (or the partner's brand); paid plans → none.
export async function poweredByFor(organizationId: string) {
  const { poweredBy } = await pageAllowance(organizationId)
  const brand = await brandForOrganization(organizationId)
  if (brand) return poweredBy || !brand.hidePoweredBy ? { name: brand.name, href: "/" } : null
  return poweredBy ? { name: "ZKWAConnect", href: (process.env.APP_URL || "https://app.zkwaconnect.in").replace(/\/+$/, "") + "/marketing" } : null
}

// ── Validation ────────────────────────────────────────────────────────────

const text = (max: number) => z.string().max(max).optional().default("")
const safeUrl = z.string().max(1000).refine(value => value === "" || /^https:\/\//i.test(value) || /^\/api\/public\/page-asset\/[\w.-]+$/.test(value), "Images and links must start with https://")
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const themeSchema = z.object({
  businessName: text(80), logo: safeUrl.optional().default(""), primary: hex.default("#075E54"), background: hex.default("#ffffff"), text: hex.default("#111b21"),
  font: z.enum(["Inter", "Poppins", "Playfair Display", "DM Sans", "Lora"]).default("Inter"), buttonStyle: z.enum(["solid", "outline", "pill"]).default("pill"),
  floatingButton: z.boolean().default(true), floatingMessage: text(300),
})

const URL_KEYS = new Set(["image", "logo", "mapUrl", "instagram", "facebook", "youtube", "website"])
const sectionSchema = z.object({
  id: z.string().regex(/^[\w-]{4,20}$/), type: z.enum(SECTION_TYPES as [string, ...string[]]), hidden: z.boolean().optional(),
  props: z.record(z.string(), z.unknown()),
}).superRefine((section, ctx) => {
  // Values are short strings, booleans, string lists (gallery) or lists of small string objects (items).
  for (const [key, value] of Object.entries(section.props)) {
    if (typeof value === "string") {
      if (value.length > 3000) ctx.addIssue({ code: "custom", message: `${key} is too long` })
      if (URL_KEYS.has(key) && !safeUrl.safeParse(value).success) ctx.addIssue({ code: "custom", message: `${key} must start with https://` })
    } else if (Array.isArray(value)) {
      if (value.length > 60) ctx.addIssue({ code: "custom", message: `Too many ${key}` })
      for (const entry of value) {
        if (typeof entry === "string") { if (!safeUrl.safeParse(entry).success) ctx.addIssue({ code: "custom", message: "Images must start with https://" }) }
        else if (!entry || typeof entry !== "object" || Object.values(entry).some(item => typeof item !== "string" || item.length > 2000))
          ctx.addIssue({ code: "custom", message: `Invalid ${key}` })
        else if (typeof (entry as { image?: string }).image === "string" && !safeUrl.safeParse((entry as { image: string }).image).success) ctx.addIssue({ code: "custom", message: "Images must start with https://" })
        else if ((entry as { kind?: string }).kind === "url" && !/^https:\/\//i.test((entry as { value?: string }).value || "")) ctx.addIssue({ code: "custom", message: "Website links must start with https://" })
      }
    } else if (typeof value !== "boolean" && value !== null) ctx.addIssue({ code: "custom", message: `Invalid ${key}` })
  }
})
export const sectionsSchema = z.array(sectionSchema).max(40)

export const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/, "Use 3–60 lowercase letters, numbers or dashes")
  .refine(slug => !RESERVED_SLUGS.has(slug), "That address is reserved — choose another")

async function freeSlug(base: string) {
  const root = slugify(base) || "page"
  for (let i = 0; i < 50; i++) {
    const candidate = i ? `${root}-${i + 1}` : root.length < 3 ? `${root}-page` : root
    if (!RESERVED_SLUGS.has(candidate) && !(await prisma.sitePage.findUnique({ where: { slug: candidate } }))) return candidate
  }
  return `${root}-${crypto.randomBytes(3).toString("hex")}`
}

export async function defaultNumber(organizationId: string) {
  const phone = await prisma.phoneNumber.findFirst({ where: { status: "CONNECTED", waba: { organizationId } }, orderBy: { createdAt: "asc" }, select: { phoneNumber: true } })
  return phone?.phoneNumber.replace(/\D/g, "") || null
}

export async function createPage(organizationId: string, input: { templateId: string; title?: string; slug?: string }) {
  const allowance = await pageAllowance(organizationId)
  if (!allowance.canCreate) throw Object.assign(new Error(`Your ${allowance.planName || "current"} plan includes ${allowance.limit} page${allowance.limit === 1 ? "" : "s"}. Upgrade to create more.`), { status: 402 })
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } })
  const built = buildFromTemplate(input.templateId, org.name)
  const slug = input.slug ? slugSchema.parse(input.slug) : await freeSlug(input.title && built.type !== "SITE" ? `${org.name}-${input.title}` : org.name)
  if (await prisma.sitePage.findUnique({ where: { slug } })) throw new Error("That address is taken — choose another.")
  return prisma.sitePage.create({ data: { organizationId, type: built.type, slug, title: input.title?.trim() || org.name, whatsappNumber: await defaultNumber(organizationId),
    theme: built.theme as unknown as Prisma.InputJsonValue, sections: built.sections as unknown as Prisma.InputJsonValue, seoTitle: input.title?.trim() || org.name } })
}

export async function publishPage(organizationId: string, id: string) {
  const page = await prisma.sitePage.findFirst({ where: { id, organizationId } })
  if (!page) throw Object.assign(new Error("Page not found."), { status: 404 })
  if (!page.whatsappNumber) throw new Error("Add the WhatsApp number customers should chat with (Page settings), then publish.")
  return prisma.sitePage.update({ where: { id }, data: { status: "PUBLISHED", publishedSections: page.sections as Prisma.InputJsonValue, publishedTheme: page.theme as Prisma.InputJsonValue, publishedAt: new Date() } })
}

// ── Public side ───────────────────────────────────────────────────────────

export async function publicPage(slug: string) {
  const page = await prisma.sitePage.findUnique({ where: { slug } })
  if (!page || page.status !== "PUBLISHED" || !page.publishedSections) return null
  const org = await prisma.organization.findUnique({ where: { id: page.organizationId }, select: { status: true } })
  if (!org || org.status === "SUSPENDED") return null
  return { ...page, sections: page.publishedSections as unknown as Section[], theme: page.publishedTheme as unknown as Theme }
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const newRef = () => Array.from(crypto.randomBytes(6), byte => REF_ALPHABET[byte % REF_ALPHABET.length]).join("")

// A tap on a WhatsApp button: log it and build the wa.me link. The ref travels in the message so the chat can be attributed.
export async function trackClick(slug: string, sectionId: string, item: number) {
  const page = await publicPage(slug)
  if (!page?.whatsappNumber) return null
  let message = page.theme.floatingMessage || "Hi!"
  let label = "Floating WhatsApp button"
  if (sectionId !== "_float") {
    const section = page.sections.find(entry => entry.id === sectionId && !entry.hidden)
    const cta = section ? ctaMessage(section, item) : null
    if (!cta) return null
    message = cta.message || message; label = cta.label
  }
  const ref = newRef()
  await prisma.pageClick.create({ data: { organizationId: page.organizationId, pageId: page.id, sectionId, label: label.slice(0, 120), ref } })
  return `https://wa.me/${page.whatsappNumber}?text=${encodeURIComponent(`${message.trim()}\n\n(ref ${ref})`)}`
}

// Inbound WhatsApp message: "(ref ABC123)" links the chat to the page button that started it, and tags the contact.
export async function attributePageRef(organizationId: string, contactId: string, body: string) {
  const match = body.match(/\(ref ([A-Z2-9]{6})\)/)
  if (!match) return null
  const click = await prisma.pageClick.findFirst({ where: { ref: match[1], organizationId, chattedAt: null } })
  if (!click) return null
  await prisma.pageClick.update({ where: { id: click.id }, data: { contactId, chattedAt: new Date() } })
  const page = await prisma.sitePage.findUnique({ where: { id: click.pageId }, select: { slug: true } })
  if (page) await tagContact(contactId, `page:${page.slug}`)
  return click
}

async function tagContact(contactId: string, tag: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { tags: true } })
  const tags = Array.isArray(contact?.tags) ? (contact!.tags as string[]) : []
  if (!tags.includes(tag)) await prisma.contact.update({ where: { id: contactId }, data: { tags: [...tags, tag] } })
}

// Lead form on a public page → contact (with WhatsApp opt-in only if ticked) + notification for the team.
export async function captureLead(slug: string, input: { sectionId: string; name: string; phone: string; message?: string; optIn: boolean }) {
  const page = await publicPage(slug)
  const section = page?.sections.find(entry => entry.id === input.sectionId && entry.type === "form" && !entry.hidden)
  if (!page || !section) throw Object.assign(new Error("Form not found."), { status: 404 })
  let phone = input.phone.replace(/\D/g, "").replace(/^0+/, "")
  if (phone.length === 10) phone = `91${phone}`
  if (phone.length < 11 || phone.length > 15) throw new Error("Enter your WhatsApp number with country code, e.g. +91 98765 43210.")
  const existing = await prisma.contact.findUnique({ where: { organizationId_phone: { organizationId: page.organizationId, phone } } })
  const contact = existing
    ? await prisma.contact.update({ where: { id: existing.id }, data: { ...(input.optIn ? { optedIn: true, optedOutAt: null } : {}), ...(existing.name ? {} : { name: input.name }) } })
    : await prisma.contact.create({ data: { organizationId: page.organizationId, phone, name: input.name, source: "PAGE_FORM", optedIn: input.optIn } })
  await tagContact(contact.id, `page:${page.slug}`)
  const tag = typeof section.props.tag === "string" ? section.props.tag.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").slice(0, 40) : ""
  if (tag) await tagContact(contact.id, tag)
  await notifyWorkspace(page.organizationId, "PAGE_LEAD", `New lead from ${page.title}`, `${input.name} (+${phone})${input.message ? `: ${input.message.slice(0, 120)}` : ""}${input.optIn ? " · opted in to WhatsApp" : ""}`,
    `/app/contacts?q=${phone}`, { pageId: page.id, contactId: contact.id })
  return { contactId: contact.id }
}

// Views, WhatsApp taps and chats started per page (last 30 days).
export async function pageStats(organizationId: string, pageIds: string[]) {
  const since = new Date(Date.now() - 30 * 86_400_000)
  const rows = await prisma.pageClick.groupBy({ by: ["pageId"], where: { organizationId, pageId: { in: pageIds }, createdAt: { gte: since } }, _count: { _all: true } })
  const chats = await prisma.pageClick.groupBy({ by: ["pageId"], where: { organizationId, pageId: { in: pageIds }, createdAt: { gte: since }, chattedAt: { not: null } }, _count: { _all: true } })
  return Object.fromEntries(pageIds.map(id => [id, { clicks: rows.find(row => row.pageId === id)?._count._all || 0, chats: chats.find(row => row.pageId === id)?._count._all || 0 }]))
}

export type { PageType }
