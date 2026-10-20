import { prisma } from "@/lib/db/prisma"

type TemplateEvent = {
  event?: string
  message_template_id?: number | string
  message_template_name?: string
  message_template_language?: string
  reason?: string | null
  new_category?: string
}

// Applies Meta's template webhooks (message_template_status_update, template_category_update) to our copy.
export async function applyTemplateEvent(wabaId: string, field: string, value: TemplateEvent) {
  const waba = await prisma.waba.findUnique({ where: { wabaId }, select: { id: true, organizationId: true } })
  if (!waba || !value.message_template_name) return false
  const where = {
    organizationId: waba.organizationId,
    OR: [
      ...(value.message_template_id ? [{ metaTemplateId: String(value.message_template_id) }] : []),
      { name: value.message_template_name, ...(value.message_template_language ? { language: value.message_template_language } : {}) },
    ],
  }
  if (field === "template_category_update" && value.new_category) {
    const result = await prisma.template.updateMany({ where, data: { category: value.new_category } })
    return result.count > 0
  }
  if (field !== "message_template_status_update" || !value.event) return false
  const reason = value.reason && value.reason !== "NONE" ? value.reason : null
  const result = await prisma.template.updateMany({ where, data: { status: value.event, rejectionReason: reason } })
  if (result.count && (value.event === "APPROVED" || value.event === "REJECTED"))
    await prisma.notification.create({ data: { organizationId: waba.organizationId, type: `TEMPLATE_${value.event}`,
      title: value.event === "APPROVED" ? "Template approved" : "Template rejected",
      message: `${value.message_template_name}${reason ? ` — ${reason.replace(/_/g, " ").toLowerCase()}` : ""}`,
      metadata: { templateName: value.message_template_name, wabaId } } }).catch(() => null)
  return result.count > 0
}
