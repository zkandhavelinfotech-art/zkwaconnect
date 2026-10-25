import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { prisma } from "@/lib/db/prisma"
import { poweredByFor, publicPage } from "@/lib/pages/pages"
import { PageView } from "@/components/pages/PageView"

export const dynamic = "force-dynamic"
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = await publicPage(slug)
  if (!page) return { title: "Page not found" }
  const image = page.theme.logo?.startsWith("https://") ? page.theme.logo : undefined
  return { title: page.seoTitle || page.title, description: page.seoDescription || undefined,
    openGraph: { title: page.seoTitle || page.title, description: page.seoDescription || undefined, images: image ? [image] : undefined } }
}

// Public WhatsApp page. Views are counted for people (link-preview bots are skipped).
export default async function PublicWhatsAppPage({ params }: Props) {
  const { slug } = await params
  const page = await publicPage(slug)
  if (!page) notFound()
  const agent = (await headers()).get("user-agent") || ""
  if (!/bot|crawler|spider|facebookexternalhit|whatsapp|preview|slurp/i.test(agent))
    await prisma.sitePage.update({ where: { id: page.id }, data: { views: { increment: 1 } } }).catch(() => null)
  const fonts = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(page.theme.font)}:wght@400;600;700;800&display=swap`
  return <>
    {/* eslint-disable-next-line @next/next/no-page-custom-font */}
    <link rel="stylesheet" href={fonts} />
    <PageView sections={page.sections} theme={page.theme} mode={{ kind: "public", slug: page.slug }} whatsappNumber={page.whatsappNumber}
      poweredBy={await poweredByFor(page.organizationId)} pageType={page.type} />
  </>
}
