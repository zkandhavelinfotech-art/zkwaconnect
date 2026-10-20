const PLACEHOLDER = /your-|replace-with|example|changeme/i

// Whether this server can run "Continue with Facebook". The admin Meta setup page has the detailed checks.
export function metaLoginConfig() {
  const appId = process.env.META_APP_ID || ""
  const appSecret = process.env.META_APP_SECRET || ""
  const encryptionKey = process.env.ENCRYPTION_KEY || ""
  const missing: string[] = []
  if (!/^\d{10,20}$/.test(appId)) missing.push("META_APP_ID")
  if (!appSecret || PLACEHOLDER.test(appSecret)) missing.push("META_APP_SECRET")
  if (encryptionKey.length < 32 || PLACEHOLDER.test(encryptionKey)) missing.push("ENCRYPTION_KEY")
  return { ready: missing.length === 0, missing }
}
