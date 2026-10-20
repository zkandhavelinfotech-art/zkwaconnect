// Read per call: the admin Meta setup form can change it while the server runs.
export const graphVersion = () => process.env.META_GRAPH_API_VERSION || "v25.0"

// Keeps Meta's error code so callers can tell temporary failures (rate limits, outages) from permanent ones.
export class MetaApiError extends Error {
  constructor(message: string, readonly code: number | null, readonly httpStatus: number, readonly details?: string) {
    super(message)
    this.name = "MetaApiError"
  }
}

export async function metaGraph<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, "")}`)
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${accessToken}`)

  const response = await fetch(url, { ...init, headers, cache: "no-store" })
  const body = await response.json().catch(() => ({})) as {
    error?: { message?: string; error_user_msg?: string; code?: number; error_data?: { details?: string } }
  }

  if (!response.ok || body.error)
    throw new MetaApiError(body.error?.error_user_msg || body.error?.message || "Meta API request failed",
      typeof body.error?.code === "number" ? body.error.code : null, response.status, body.error?.error_data?.details)

  return body as T
}

export function metaRedirectUri(origin: string) {
  const configured = process.env.META_OAUTH_REDIRECT_URI
  // When testing on localhost, come back to this machine: the configured production URI would
  // land on the live site, where this browser's login state doesn't exist.
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  if (configured && !(local && new URL(configured).origin !== origin)) return configured
  return `${origin}/api/meta/oauth/callback`
}