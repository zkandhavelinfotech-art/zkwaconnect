import crypto from "node:crypto"
import dns from "node:dns/promises"
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { putFile } from "@/lib/storage"
import { HEX, forgetBrand } from "@/lib/partners/brand"
import { requirePartner } from "@/lib/partners/partners"
import { fail, sessionUser } from "@/lib/partners/http"

const schema = z.object({
  brandName: z.string().trim().min(2).max(60),
  primaryColor: z.string().trim().regex(HEX, "Use a colour like #075E54").or(z.literal("")),
  supportEmail: z.string().trim().email().or(z.literal("")),
  supportPhone: z.string().trim().regex(/^\+?[\d\s-]{8,18}$/, "Enter a valid phone number").or(z.literal("")),
  hidePoweredBy: z.boolean(),
  logo: z.string().max(700_000).optional(),
})

// Branding: name, logo, colour, support contact, "Powered by" line.
export async function PUT(request: Request) {
  try {
    const user = await sessionUser()
    const partner = await requirePartner(user.id, { active: true, owner: true })
    const input = schema.parse(await request.json())
    let logoPath: string | undefined
    if (input.logo) {
      const match = input.logo.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/)
      if (!match) throw new Error("Logo must be a PNG, JPG or WebP image.")
      const bytes = Buffer.from(match[2], "base64")
      if (bytes.length > 500_000) throw new Error("Logo must be under 500 KB.")
      logoPath = `${partner.id}-${crypto.randomBytes(4).toString("hex")}.${match[1] === "jpeg" ? "jpg" : match[1]}`
      await putFile("brand-assets", logoPath, bytes, `image/${match[1]}`)
    }
    await prisma.partner.update({ where: { id: partner.id }, data: { brandName: input.brandName, primaryColor: input.primaryColor || null, supportEmail: input.supportEmail || null,
      supportPhone: input.supportPhone || null, hidePoweredBy: input.hidePoweredBy, ...(logoPath ? { logoPath } : {}) } })
    forgetBrand()
    return NextResponse.json({ ok: true, message: "Branding saved." })
  } catch (error) { return fail(error) }
}

// Own domain: save it, then verify that its DNS points at the platform.
export async function POST(request: Request) {
  try {
    const user = await sessionUser()
    const partner = await requirePartner(user.id, { active: true, owner: true })
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("save"), domain: z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a domain like app.youragency.com").or(z.literal("")) }),
      z.object({ action: z.literal("verify") }),
    ]).parse(await request.json())
    if (input.action === "save") {
      if (input.domain && await prisma.partner.findFirst({ where: { customDomain: input.domain, id: { not: partner.id } } })) throw new Error("That domain is used by another partner.")
      await prisma.partner.update({ where: { id: partner.id }, data: { customDomain: input.domain || null, domainVerifiedAt: null } })
      forgetBrand()
      return NextResponse.json({ ok: true, message: input.domain ? "Domain saved. Add the DNS record, then click Verify." : "Domain removed." })
    }
    if (!partner.customDomain) throw new Error("Save a domain first.")
    const target = (process.env.PARTNER_CNAME_TARGET || new URL(process.env.APP_URL || "https://app.zkwaconnect.in").host).toLowerCase()
    const cnames = await dns.resolveCname(partner.customDomain).catch(() => [] as string[])
    let ok = cnames.some(name => name.toLowerCase().replace(/\.$/, "") === target)
    if (!ok) {
      // Apex domains can't use CNAME: accept A records that match the platform's.
      const [mine, theirs] = await Promise.all([dns.resolve4(target).catch(() => [] as string[]), dns.resolve4(partner.customDomain).catch(() => [] as string[])])
      ok = theirs.length > 0 && theirs.every(ip => mine.includes(ip))
    }
    if (!ok) throw new Error(`${partner.customDomain} doesn't point to ${target} yet. Add a CNAME record (it can take up to an hour to update).`)
    await prisma.partner.update({ where: { id: partner.id }, data: { domainVerifiedAt: new Date() } })
    forgetBrand()
    return NextResponse.json({ ok: true, message: "Domain verified. We'll switch on HTTPS for it shortly — your clients can then sign in there." })
  } catch (error) { return fail(error) }
}
