import { getFile } from "@/lib/storage"

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }

// Images uploaded in the Page Builder (public, cached; names are random).
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const ext = name.split(".").pop() || ""
  if (!/^[\w-]+\.(png|jpg|webp)$/.test(name)) return new Response("Not found", { status: 404 })
  try {
    const bytes = await getFile("page-assets", name)
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } })
  } catch { return new Response("Not found", { status: 404 }) }
}
