import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { connectedCatalog, createProduct, listProducts } from "@/lib/commerce/catalog"

async function context(organizationId: string, wabaId?: string | null) {
  const token = await getMetaAccessToken(organizationId)
  if (!token) throw Object.assign(new Error("Connect Facebook first."), { status: 409 })
  const waba = await prisma.waba.findFirst({ where: { organizationId, status: "CONNECTED", ...(wabaId ? { id: wabaId } : {}) } })
  if (!waba) throw Object.assign(new Error("Connect a WhatsApp account first."), { status: 409 })
  const catalog = await connectedCatalog(waba.wabaId, token)
  if (!catalog) throw Object.assign(new Error("Connect a product catalog to this WhatsApp account first (Commerce → Catalog)."), { status: 409 })
  return { token, catalog }
}
const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: errorStatus(error) })

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const url = new URL(request.url)
    const { token, catalog } = await context(organizationId, url.searchParams.get("waba"))
    const page = await listProducts(catalog.id, token, url.searchParams.get("q") || "", url.searchParams.get("after") || "")
    return NextResponse.json({ catalog, ...page })
  } catch (error) { return fail(error) }
}

const productSchema = z.object({
  wabaId: z.string().optional(),
  retailerId: z.string().trim().regex(/^[\w-]{1,100}$/, "SKU / content ID: letters, numbers, - and _."),
  name: z.string().trim().min(2).max(150), description: z.string().trim().min(2, "Add a short description.").max(5000),
  price: z.number().positive().max(10_000_000), currency: z.string().length(3).default("INR"),
  imageUrl: z.string().url().startsWith("https://", "Image URL must be https."), url: z.string().url("Add the product page URL on your website."), inStock: z.boolean().default(true),
})

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const input = productSchema.parse(await request.json())
    const { token, catalog } = await context(organizationId, input.wabaId)
    const created = await createProduct(catalog.id, token, input)
    return NextResponse.json({ id: created.id, message: `“${input.name}” added. Meta reviews new products; it can take a few minutes to appear on WhatsApp.` }, { status: 201 })
  } catch (error) { return fail(error) }
}
