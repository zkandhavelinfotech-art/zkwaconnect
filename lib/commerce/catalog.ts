import { prisma } from "@/lib/db/prisma"
import { metaGraph } from "@/lib/meta/graph"

export type Product = { id: string; retailer_id: string; name: string; description?: string; price?: string; currency?: string; image_url?: string
  availability?: string; url?: string }

// Catalog connected to a WhatsApp Business Account (one per WABA).
export async function connectedCatalog(wabaId: string, token: string) {
  const result = await metaGraph<{ data?: { id: string; name: string }[] }>(`${wabaId}/product_catalogs?fields=id,name`, token)
  return result.data?.[0] || null
}

// Catalogs the customer's business owns (to choose one to connect).
export async function businessCatalogs(businessId: string, token: string) {
  const result = await metaGraph<{ data?: { id: string; name: string; product_count?: number }[] }>(`${businessId}/owned_product_catalogs?fields=id,name,product_count&limit=50`, token)
  return result.data || []
}

export async function connectCatalog(wabaId: string, catalogId: string, token: string) {
  await metaGraph(`${wabaId}/product_catalogs`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalog_id: catalogId }) })
}

export async function commerceSettings(phoneNumberId: string, token: string) {
  const result = await metaGraph<{ data?: { is_cart_enabled?: boolean; is_catalog_visible?: boolean }[] }>(`${phoneNumberId}/whatsapp_commerce_settings`, token)
  return { cartEnabled: Boolean(result.data?.[0]?.is_cart_enabled), catalogVisible: Boolean(result.data?.[0]?.is_catalog_visible) }
}

export async function updateCommerceSettings(phoneNumberId: string, token: string, settings: { cartEnabled: boolean; catalogVisible: boolean }) {
  await metaGraph(`${phoneNumberId}/whatsapp_commerce_settings?is_cart_enabled=${settings.cartEnabled}&is_catalog_visible=${settings.catalogVisible}`, token, { method: "POST" })
}

const FIELDS = "id,retailer_id,name,description,price,currency,image_url,availability,url"
export async function listProducts(catalogId: string, token: string, query = "", after = "") {
  const filter = query.trim() ? `&filter=${encodeURIComponent(JSON.stringify({ name: { i_contains: query.trim() } }))}` : ""
  const result = await metaGraph<{ data?: Product[]; paging?: { cursors?: { after?: string }; next?: string } }>(
    `${catalogId}/products?fields=${FIELDS}&limit=48${filter}${after ? `&after=${encodeURIComponent(after)}` : ""}`, token)
  return { products: result.data || [], next: result.paging?.next ? result.paging.cursors?.after || null : null }
}

export async function createProduct(catalogId: string, token: string, input: { retailerId: string; name: string; description: string; price: number; currency: string
  imageUrl: string; url: string; inStock: boolean }) {
  return metaGraph<{ id: string }>(`${catalogId}/products`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    retailer_id: input.retailerId, name: input.name, description: input.description, price: Math.round(input.price * 100), currency: input.currency,
    image_url: input.imageUrl, url: input.url, availability: input.inStock ? "in stock" : "out of stock", condition: "new", brand: input.name.split(" ")[0] }) })
}

// Look up product names/prices for an incoming cart (best effort).
export async function productsByRetailerId(catalogId: string, token: string, retailerIds: string[]) {
  if (!retailerIds.length) return new Map<string, Product>()
  const filter = encodeURIComponent(JSON.stringify({ retailer_id: { is_any: retailerIds.slice(0, 100) } }))
  const result = await metaGraph<{ data?: Product[] }>(`${catalogId}/products?fields=${FIELDS}&limit=100&filter=${filter}`, token).catch(() => ({ data: [] as Product[] }))
  return new Map((result.data || []).map(product => [product.retailer_id, product]))
}

// WhatsApp interactive payloads for products.
export function productMessage(catalogId: string, retailerIds: string[], options: { header?: string; body?: string; footer?: string }) {
  if (retailerIds.length === 1) return { type: "interactive" as const, interactive: { type: "product", ...(options.body ? { body: { text: options.body } } : {}),
    ...(options.footer ? { footer: { text: options.footer } } : {}), action: { catalog_id: catalogId, product_retailer_id: retailerIds[0] } } }
  return { type: "interactive" as const, interactive: { type: "product_list", header: { type: "text", text: (options.header || "Our products").slice(0, 60) },
    body: { text: (options.body || "Tap to view and add to cart").slice(0, 1024) }, ...(options.footer ? { footer: { text: options.footer.slice(0, 60) } } : {}),
    action: { catalog_id: catalogId, sections: [{ title: (options.header || "Products").slice(0, 24), product_items: retailerIds.slice(0, 30).map(id => ({ product_retailer_id: id })) }] } } }
}

export function catalogMessage(body: string, thumbnailRetailerId?: string) {
  return { type: "interactive" as const, interactive: { type: "catalog_message", body: { text: body.slice(0, 1024) },
    action: { name: "catalog_message", ...(thumbnailRetailerId ? { parameters: { thumbnail_product_retailer_id: thumbnailRetailerId } } : {}) } } }
}

// Organization's first connected WABA with a catalog, for sending product messages.
export async function catalogForPhone(phoneNumberId: string, token: string) {
  const phone = await prisma.phoneNumber.findUnique({ where: { id: phoneNumberId }, include: { waba: true } })
  if (!phone) return null
  return connectedCatalog(phone.waba.wabaId, token)
}

export function orderSummary(items: { name?: string; quantity: number }[], total: number, currency: string) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  return `🛒 Order: ${count} item${count === 1 ? "" : "s"} · ${currency === "INR" ? "₹" : `${currency} `}${total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}
