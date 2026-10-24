import { prisma } from "@/lib/db/prisma"

// White-label: which partner's brand to show.
//  • by web address: <slug>.<PARTNER_BASE_DOMAIN> (e.g. acme.zkwaconnect.in, needs wildcard DNS) or the partner's verified own domain
//  • by workspace: a partner's client workspace shows the partner's brand inside the app
// Only active partners whose plan allows white-label (the partner programme itself) are branded.

export type Brand = { partnerId: string; name: string; logoUrl: string | null; primaryColor: string | null; supportEmail: string | null; supportPhone: string | null; hidePoweredBy: boolean }

type PartnerRow = { id: string; status: string; name: string; brandName: string | null; logoPath: string | null; primaryColor: string | null; supportEmail: string | null; supportPhone: string | null; hidePoweredBy: boolean; updatedAt: Date }
const toBrand = (partner: PartnerRow | null): Brand | null => partner && partner.status === "ACTIVE" ? {
  partnerId: partner.id, name: partner.brandName || partner.name, logoUrl: partner.logoPath ? `/api/public/brand/logo/${partner.id}?v=${partner.updatedAt.getTime()}` : null,
  primaryColor: partner.primaryColor, supportEmail: partner.supportEmail, supportPhone: partner.supportPhone, hidePoweredBy: partner.hidePoweredBy,
} : null

const cache = new Map<string, { at: number; brand: Brand | null }>()
const TTL = 60_000

export function partnerBaseDomain() {
  return (process.env.PARTNER_BASE_DOMAIN || "").toLowerCase().replace(/^\.+|\/.*$/g, "")
}

export async function brandForHost(hostHeader: string | null | undefined): Promise<Brand | null> {
  const host = (hostHeader || "").toLowerCase().split(":")[0]
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
  const hit = cache.get(host)
  if (hit && Date.now() - hit.at < TTL) return hit.brand
  const base = partnerBaseDomain()
  const slug = base && host.endsWith(`.${base}`) ? host.slice(0, -base.length - 1) : null
  const partner = slug && !slug.includes(".")
    ? await prisma.partner.findUnique({ where: { slug } })
    : await prisma.partner.findFirst({ where: { customDomain: host, domainVerifiedAt: { not: null } } })
  const brand = toBrand(partner)
  cache.set(host, { at: Date.now(), brand })
  return brand
}

export async function brandForOrganization(organizationId: string): Promise<Brand | null> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { partnerId: true } })
  if (!org?.partnerId) return null
  return toBrand(await prisma.partner.findUnique({ where: { id: org.partnerId } }))
}

// The partner's own team sees its brand too (in the partner panel and its own workspace).
export async function brandForPartner(partnerId: string) {
  return toBrand(await prisma.partner.findUnique({ where: { id: partnerId } }))
}

export function forgetBrand() { cache.clear() }

export const HEX = /^#[0-9a-fA-F]{6}$/
