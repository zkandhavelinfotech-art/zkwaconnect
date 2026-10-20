import { z } from "zod"

// Where each template body variable ({{1}}, {{2}}…) takes its value from, per contact.
export const variableSourceSchema = z.object({
  source: z.enum(["name", "phone", "email", "attribute", "text", "link"]),
  value: z.string().trim().max(1024).optional(),
  fallback: z.string().trim().max(1024).optional(),
})
export type VariableSource = z.infer<typeof variableSourceSchema>
export type VariableMapping = Record<string, VariableSource>

export type ContactForVariables = { name: string | null; phone: string; email: string | null; metadata: unknown }

export function templateVariableNumbers(content: string | null | undefined) {
  return [...new Set([...(content || "").matchAll(/\{\{(\d+)\}\}/g)].map(match => match[1]))].sort((a, b) => Number(a) - Number(b))
}

// Reads a mapping saved by this version, or turns old fixed "templateParameters" into fixed-text sources.
export function readMapping(variableMapping: unknown, legacyParameters: unknown): VariableMapping {
  const parsed = z.record(z.string(), variableSourceSchema).safeParse(variableMapping)
  if (parsed.success) return parsed.data
  if (legacyParameters && typeof legacyParameters === "object" && !Array.isArray(legacyParameters))
    return Object.fromEntries(Object.entries(legacyParameters as Record<string, unknown>).map(([key, value]) => [key, { source: "text" as const, value: String(value ?? "") }]))
  return {}
}

export function mappingProblems(numbers: string[], mapping: VariableMapping) {
  return numbers.flatMap(number => {
    const item = mapping[number]
    if (!item) return [`Choose a value for {{${number}}}.`]
    if (item.source === "text" && !item.value) return [`Enter the text for {{${number}}}.`]
    if (item.source === "attribute" && !item.value) return [`Choose the custom field for {{${number}}}.`]
    if (item.source === "link" && !/^https?:\/\/[^\s]+\.[^\s]+/.test(item.value || "")) return [`Enter the full web address (https://…) to track for {{${number}}}.`]
    return []
  })
}

const objectOf = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

// Custom fields live in contact.metadata.attributes (set by chatbots, forms, imports and the Contacts page).
export function attributeOf(metadata: unknown, key: string) {
  const value = objectOf(objectOf(metadata).attributes)[key]
  return value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)
}

// WhatsApp rejects empty, multi-line or tab-heavy parameters, so values are flattened and trimmed.
function clean(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/ {5,}/g, "    ").trim().slice(0, 1024)
}

// links: per-recipient short links for "link" variables (created when the broadcast starts).
export function resolveVariables(numbers: string[], mapping: VariableMapping, contact: ContactForVariables, links: Record<string, string> = {}) {
  const values: string[] = []
  for (const number of numbers) {
    const item = mapping[number]
    const raw = !item ? "" : item.source === "link" ? links[number] || item.value || "" : item.source === "text" ? item.value || ""
      : item.source === "name" ? contact.name || ""
      : item.source === "phone" ? `+${contact.phone.replace(/^\+/, "")}`
      : item.source === "email" ? contact.email || ""
      : attributeOf(contact.metadata, item.value || "")
    const value = clean(raw) || clean(item?.fallback || "")
    if (!value) return { ok: false as const, missing: number, source: item?.source === "attribute" ? `custom field “${item.value}”` : item?.source || "value" }
    values.push(value)
  }
  return { ok: true as const, values }
}
