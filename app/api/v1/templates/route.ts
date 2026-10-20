import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { apiHandler } from "@/lib/developer/api"

// GET /api/v1/templates — approved templates you can send, with how many variables each needs.
export const GET = apiHandler(async (_request, { organizationId }) => {
  const templates = await prisma.template.findMany({ where: { organizationId, status: "APPROVED" }, orderBy: [{ name: "asc" }, { language: "asc" }],
    select: { name: true, language: true, category: true, content: true, components: true } })
  return NextResponse.json({ data: templates.map(template => {
    const components = Array.isArray(template.components) ? template.components as { type?: string; format?: string }[] : []
    return { name: template.name, language: template.language, category: template.category, body: template.content,
      variables: new Set([...(template.content || "").matchAll(/\{\{(\d+)\}\}/g)].map(match => match[1])).size,
      header: components.find(item => item.type?.toUpperCase() === "HEADER")?.format?.toLowerCase() || null,
      carousel: components.some(item => item.type?.toUpperCase() === "CAROUSEL") }
  }) })
})
