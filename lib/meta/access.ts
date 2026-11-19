import { MetaApiError } from "@/lib/meta/graph"

export type MetaResolution = {
  code: number | null
  subcode: number | null
  title: string
  message: string
  action: string
  retryable: boolean
}

// Converts opaque Graph errors into an actionable, channel-independent response for the UI/API.
export function resolveMetaError(error: unknown): MetaResolution {
  const graph = error instanceof MetaApiError ? error : null
  const message = error instanceof Error ? error.message : "Meta request failed."
  const lower = message.toLowerCase()
  const permission10 = graph?.code === 10 || graph?.subcode === 2593181 || lower.includes("permissions to send messages")

  if (graph?.code === 100 && (graph.subcode === 1752100 || lower.includes("business-scoped") || lower.includes("parameter business is required"))) return {
    code: 100, subcode: graph.subcode, title: "Business-scoped Meta user required", message,
    action: "Select a business or system user from the WABA owner Business Portfolio. A normal Facebook profile ID cannot be assigned directly.", retryable: false,
  }

  if (permission10) return {
    code: graph?.code ?? 10,
    subcode: graph?.subcode ?? (lower.includes("permissions to send messages") ? 2593181 : null),
    title: "Outbound messaging access is missing",
    message,
    action: "Verify the exact app subscription, whatsapp_business_messaging token scope, and WABA Manage assignment. If all are ready, switch the Meta app to Live with Advanced Access or complete the previous BSP/partner migration in Meta Business Settings.",
    retryable: false,
  }
  if (graph?.code === 190) return {
    code: 190, subcode: graph.subcode, title: "Meta connection expired", message,
    action: "Reconnect Facebook to issue a valid access token, then run the access check again.", retryable: false,
  }
  if (graph?.code === 200 || lower.includes("permission")) return {
    code: graph?.code ?? 200, subcode: graph?.subcode ?? null, title: "Meta permission is missing", message,
    action: "Reconnect with the required permissions and confirm this user has Full control or Manage + Messaging on the WhatsApp account.", retryable: false,
  }
  if (graph?.code === 4 || graph?.code === 17 || graph?.code === 80008 || graph?.httpStatus === 429) return {
    code: graph?.code ?? null, subcode: graph?.subcode ?? null, title: "Meta is rate limiting requests", message,
    action: "Wait a few minutes and retry. Do not repeatedly reconnect the account.", retryable: true,
  }
  return {
    code: graph?.code ?? null, subcode: graph?.subcode ?? null, title: graph?.userTitle || "Meta request failed", message,
    action: "Refresh the access check for the exact failing step. If it remains failed, use the manual instructions shown for that step.",
    retryable: (graph?.httpStatus || 0) >= 500,
  }
}
