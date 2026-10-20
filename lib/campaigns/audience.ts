import { Prisma } from "@/generated/prisma/client"
import crypto from "node:crypto"
import { linkBase, newLinkCode } from "@/lib/links"
import { prisma } from "@/lib/db/prisma"
import { readMapping, resolveVariables, templateVariableNumbers } from "./variables"
import { segmentWhere } from "@/lib/contacts/filters"

// Broadcasts only ever go to opted-in contacts, whatever the audience.
export async function audienceWhere(organizationId: string, audienceType: string, labels: string[], segmentId?: string | null): Promise<Prisma.ContactWhereInput> {
  if (audienceType === "SEGMENT") {
    if (!segmentId) throw Object.assign(new Error("Choose a saved segment."), { status: 400 })
    return { AND: [await segmentWhere(organizationId, segmentId), { optedIn: true }, { NOT: { phone: { startsWith: "ig:" } } }] }
  }
  return {
    organizationId, optedIn: true, NOT: { phone: { startsWith: "ig:" } },
    ...(audienceType === "TAGS" ? { OR: labels.map(label => ({ tags: { array_contains: [label] } })) } : {}),
  }
}

export function labelsOf(value: unknown) {
  return Array.isArray(value) ? value.filter((label): label is string => typeof label === "string") : []
}

// Snapshot the audience into the send queue with each contact's own variable values.
// Safe to run twice: (campaignId, phone) is unique.
export async function materializeRecipients(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { template: true } })
  const numbers = templateVariableNumbers(campaign.template?.content)
  const mapping = readMapping(campaign.variableMapping, campaign.templateParameters)
  const where = await audienceWhere(campaign.organizationId, campaign.audienceType, labelsOf(campaign.audienceLabels), campaign.segmentId)
  let cursor: string | undefined
  let total = 0
  for (;;) {
    const contacts = await prisma.contact.findMany({ where, orderBy: { id: "asc" }, take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, phone: true, name: true, email: true, metadata: true } })
    if (!contacts.length) break
    cursor = contacts[contacts.length - 1].id
    const now = new Date()
    const linkNumbers = numbers.filter(number => mapping[number]?.source === "link")
    const links: { code: string; organizationId: string; destination: string; campaignId: string; recipientId: string; contactId: string; templateId: string | null }[] = []
    const rows = contacts.map(contact => {
      // Each recipient gets their own short link, so clicks are counted per person.
      const id = crypto.randomUUID()
      const urls: Record<string, string> = {}
      for (const number of linkNumbers) {
        const code = newLinkCode()
        links.push({ code, organizationId: campaign.organizationId, destination: mapping[number].value!, campaignId, recipientId: id, contactId: contact.id, templateId: campaign.templateId })
        urls[number] = `${linkBase()}/l/${code}`
      }
      const resolved = resolveVariables(numbers, mapping, contact, urls)
      return {
        id, campaignId, organizationId: campaign.organizationId, contactId: contact.id, phone: contact.phone.replace(/^\+/, ""), name: contact.name,
        ...(resolved.ok ? { variables: resolved.values, status: "QUEUED" }
          : { status: "SKIPPED", errorCode: "SKIPPED", failedAt: now,
              errorMessage: `No value for {{${resolved.missing}}} (${resolved.source}) and no fallback.` }),
      }
    })
    total += (await prisma.campaignRecipient.createMany({ data: rows, skipDuplicates: true })).count
    if (links.length) await prisma.trackedLink.createMany({ data: links, skipDuplicates: true })
    if (contacts.length < 1000) break
  }
  return total
}
