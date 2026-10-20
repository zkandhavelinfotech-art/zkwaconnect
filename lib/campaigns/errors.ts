import { MetaApiError } from "@/lib/meta/graph"

export type FailureKind = "retry" | "permanent" | "pause" | "opted_out"

// WhatsApp Cloud API error codes: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const RETRY = new Set([1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 131056, 133004])
const PAUSE = new Set([
  0, 3, 10, 190, 200, 368, 131005, 131031, 131042, 133010, // access, permissions, account locked/unpaid, number not registered
  132000, 132001, 132005, 132007, 132012, 132015, 132016, 132068, 132069, // template problems — every message would fail
])
const OPTED_OUT = new Set([131050])

export function classifyFailure(error: unknown): { kind: FailureKind; code: string | null; message: string } {
  if (error instanceof MetaApiError) {
    const code = error.code
    const message = [error.message, error.details].filter(Boolean).join(" — ").slice(0, 500)
    if (code !== null && OPTED_OUT.has(code)) return { kind: "opted_out", code: String(code), message }
    if (code !== null && PAUSE.has(code)) return { kind: "pause", code: String(code), message }
    if ((code !== null && RETRY.has(code)) || error.httpStatus >= 500) return { kind: "retry", code: code === null ? null : String(code), message }
    return { kind: "permanent", code: code === null ? null : String(code), message }
  }
  // Network errors, timeouts: try again later.
  return { kind: "retry", code: null, message: error instanceof Error ? error.message.slice(0, 500) : "Network error" }
}

// Failures worth retrying from the report (not: not on WhatsApp, opted out, invalid number).
export const NOT_RETRYABLE_CODES = ["131026", "131050", "131021", "100", "131009", "SKIPPED"]

export const RETRY_DELAYS_MS = [30_000, 120_000, 600_000]
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1
