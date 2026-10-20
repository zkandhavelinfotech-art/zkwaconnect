import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { metaRedirectUri } from "@/lib/meta/graph"
import { isWabaSubscribed } from "@/lib/meta/waba"
import { META_SCOPES } from "@/lib/meta/scopes"
import { canWriteEnvFile, updateEnvFile } from "@/lib/admin/env-file"

export const runtime = "nodejs"

type Status = "pass" | "warn" | "fail" | "info"
type Check = { id:string; step:number; title:string; status:Status; detail:string }

const PLACEHOLDER = /your-|replace-with|example|changeme/i
const version = () => process.env.META_GRAPH_API_VERSION || "v25.0"

async function graph<T>(path:string, accessToken?:string): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${version()}/${path}`, {
    headers: accessToken ? { Authorization:`Bearer ${accessToken}` } : {}, cache:"no-store", signal:AbortSignal.timeout(15000),
  })
  const body = await response.json().catch(() => ({})) as T & { error?:{ message?:string } }
  if (!response.ok || body.error) throw new Error(body.error?.message || `Meta returned HTTP ${response.status}`)
  return body
}

function mask(value:string|undefined) {
  return value ? `${"•".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}` : "not set"
}

export async function GET(request:NextRequest) {
  const session = await getSession()
  if (!session?.user || session.user.adminRole === "NONE")
    return NextResponse.json({ error:"Admin access required" }, { status:403 })

  const checks:Check[] = []
  const add = (check:Check) => checks.push(check)
  const env = process.env
  const appId = env.META_APP_ID || ""
  const appSecret = env.META_APP_SECRET || ""
  const verifyToken = env.META_VERIFY_TOKEN || ""
  const publicUrl = (env.APP_URL || env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "")
  const callbackUrl = `${publicUrl}/api/webhooks/whatsapp`
  const redirectUri = env.META_OAUTH_REDIRECT_URI || metaRedirectUri(publicUrl)

  // Step 1–2: credentials
  const appIdOk = /^\d{10,20}$/.test(appId)
  add({ id:"app_id", step:1, title:"META_APP_ID", status:appIdOk ? "pass" : "fail",
    detail:appIdOk ? `App ID ${appId}` : appId && !PLACEHOLDER.test(appId) ? "App ID should be the numeric ID from the app dashboard." : "Set META_APP_ID in .env." })

  let appToken = ""
  if (!appIdOk || !appSecret || PLACEHOLDER.test(appSecret)) {
    add({ id:"app_secret", step:1, title:"META_APP_SECRET", status:"fail", detail:"Set META_APP_SECRET (App settings → Basic → App secret) in .env." })
  } else {
    try {
      const token = await graph<{ access_token:string }>(`oauth/access_token?client_id=${appId}&client_secret=${encodeURIComponent(appSecret)}&grant_type=client_credentials`)
      appToken = token.access_token
      const app = await graph<{ name?:string; category?:string; link?:string }>(`${appId}?fields=name,category,link`, appToken)
      add({ id:"app_secret", step:1, title:"App ID and secret work", status:"pass",
        detail:`Meta accepted the credentials for “${app.name || appId}”${app.category ? ` (${app.category})` : ""}. Secret ${mask(appSecret)}.` })
    } catch (error) {
      add({ id:"app_secret", step:1, title:"App ID and secret work", status:"fail",
        detail:`Meta rejected the App ID/secret pair: ${error instanceof Error ? error.message : "unknown error"}` })
    }
  }

  const publicId = env.NEXT_PUBLIC_META_APP_ID || ""
  add({ id:"public_app_id", step:2, title:"NEXT_PUBLIC_META_APP_ID", status:publicId === appId && appIdOk ? "pass" : "warn",
    detail:!appIdOk ? "Set it to the same value as META_APP_ID once that is configured."
      : publicId === appId ? "Matches META_APP_ID." : "Should equal META_APP_ID so browser-side Meta features use the same app." })
  const verifyTokenOk = verifyToken.length >= 8 && !PLACEHOLDER.test(verifyToken)
  const encryptionKey = env.ENCRYPTION_KEY || ""
  add({ id:"encryption_key", step:2, title:"ENCRYPTION_KEY", status:encryptionKey.length >= 32 && !PLACEHOLDER.test(encryptionKey) ? "pass" : "fail",
    detail:encryptionKey.length >= 32 && !PLACEHOLDER.test(encryptionKey) ? "Strong key set — customer Meta tokens are encrypted at rest."
      : "Set a random ENCRYPTION_KEY of at least 32 characters. Customers cannot connect Meta without it." })
  const sessionSecret = env.SESSION_SECRET || ""
  add({ id:"session_secret", step:2, title:"SESSION_SECRET", status:sessionSecret.length >= 32 && !PLACEHOLDER.test(sessionSecret) ? "pass" : "warn",
    detail:sessionSecret.length >= 32 && !PLACEHOLDER.test(sessionSecret) ? "Set." : "Set a random SESSION_SECRET of 32+ characters before going live (a development default is used otherwise)." })
  add({ id:"graph_version", step:2, title:"META_GRAPH_API_VERSION", status:/^v\d+\.\d+$/.test(version()) ? "pass" : "fail",
    detail:`Using ${version()}.` })
  const configId = env.NEXT_PUBLIC_META_CONFIG_ID || ""
  add({ id:"config_id", step:2, title:"NEXT_PUBLIC_META_CONFIG_ID (Embedded Signup)", status:/^\d{5,25}$/.test(configId) ? "pass" : "info",
    detail:/^\d{5,25}$/.test(configId) ? `Embedded Signup is enabled with configuration ${configId}.`
      : "Optional. Add the Facebook Login for Business configuration ID to offer Meta's Embedded Signup popup to new businesses." })

  // Step 3: login redirect
  add({ id:"redirect_uri", step:3, title:"OAuth redirect URI", status:redirectUri.startsWith("https://") ? "info" : "warn",
    detail:/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.nextUrl.origin)
      ? `Testing on this computer: Facebook returns to ${request.nextUrl.origin}/api/meta/oauth/callback (Meta allows localhost while the app is in Development mode). Add ${redirectUri} for the live site.`
      : redirectUri.startsWith("https://") ? "Meta can't report this — add it under Facebook Login for Business → Settings → Valid OAuth Redirect URIs."
      : "Meta only accepts https:// redirect URIs for live apps. Set APP_URL or META_OAUTH_REDIRECT_URI to your public https address." })

  // Step 4: webhooks
  add({ id:"verify_token", step:4, title:"META_VERIFY_TOKEN", status:verifyTokenOk ? "pass" : "fail",
    detail:verifyTokenOk ? "Set." : "Set a random META_VERIFY_TOKEN (8+ characters) and paste the same value into Meta." })
  try {
    const challenge = `zk${Date.now()}`
    const response = await fetch(`${request.nextUrl.origin}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${challenge}`,
      { cache:"no-store", signal:AbortSignal.timeout(10000) })
    const text = await response.text()
    add({ id:"webhook_handshake", step:4, title:"Webhook verification handshake", status:text !== challenge ? "fail" : verifyTokenOk ? "pass" : "warn",
      detail:text !== challenge ? `The webhook did not echo the challenge (HTTP ${response.status}). Check META_VERIFY_TOKEN.`
        : verifyTokenOk ? "This server answers Meta's verification request correctly." : "The route works, but it is still using the placeholder token — set a real META_VERIFY_TOKEN." })
  } catch (error) {
    add({ id:"webhook_handshake", step:4, title:"Webhook verification handshake", status:"fail", detail:`Could not reach the webhook route: ${error instanceof Error ? error.message : "error"}` })
  }
  add({ id:"public_https", step:4, title:"Public HTTPS address", status:publicUrl.startsWith("https://") ? "pass" : "warn",
    detail:publicUrl.startsWith("https://") ? `Meta will call ${callbackUrl}` : `APP_URL is ${publicUrl}. Meta can only deliver webhooks to a public https:// URL — use your domain or a tunnel (e.g. ngrok) for local testing.` })
  add({ id:"app_secret_signature", step:4, title:"Webhook signature check", status:appSecret && !PLACEHOLDER.test(appSecret) ? "pass" : "fail",
    detail:appSecret && !PLACEHOLDER.test(appSecret) ? "Incoming webhooks are verified with META_APP_SECRET." : "Without META_APP_SECRET every webhook is rejected as unsigned." })
  if (appToken) {
    try {
      const subscriptions = await graph<{ data:{ object:string; callback_url:string; active:boolean; fields:{ name:string }[] }[] }>(`${appId}/subscriptions`, appToken)
      const whatsapp = subscriptions.data.find(item => item.object === "whatsapp_business_account")
      const fields = whatsapp?.fields.map(field => field.name) || []
      const status:Status = !whatsapp ? "fail" : whatsapp.callback_url !== callbackUrl || !fields.includes("messages") || !fields.includes("message_template_status_update") || !whatsapp.active ? "warn" : "pass"
      add({ id:"app_webhook", step:4, title:"WhatsApp webhook configured in Meta", status,
        detail:!whatsapp ? "No WhatsApp webhook is configured on the app yet." :
          [`Callback: ${whatsapp.callback_url}${whatsapp.callback_url !== callbackUrl ? ` (expected ${callbackUrl})` : ""}`,
            `Fields: ${fields.join(", ") || "none"}${fields.includes("messages") ? "" : " — subscribe to “messages”"}${fields.includes("message_template_status_update") ? "" : " — subscribe to “message_template_status_update” so template approvals update instantly"}`,
            whatsapp.active ? "" : "Subscription is inactive."].filter(Boolean).join(" · ") })
    } catch (error) {
      add({ id:"app_webhook", step:4, title:"WhatsApp webhook configured in Meta", status:"warn", detail:`Could not read app subscriptions: ${error instanceof Error ? error.message : "error"}` })
    }
  }

  // Step 5–6: permissions and customer accounts
  const connection = await prisma.metaConnection.findFirst({ where:{ status:"CONNECTED", accessTokenEncrypted:{ not:null } },
    orderBy:{ updatedAt:"desc" }, include:{ organization:{ select:{ name:true } } } })
  if (!connection) {
    add({ id:"scopes", step:5, title:"Permissions granted by customers", status:"info", detail:"No customer has connected Meta yet. Connect a test workspace to verify permissions." })
  } else if (appToken) {
    try {
      const debug = await graph<{ data:{ is_valid:boolean; scopes?:string[]; expires_at?:number } }>(
        `debug_token?input_token=${encodeURIComponent(decryptMetaToken(connection.accessTokenEncrypted!))}`, appToken)
      const granted = debug.data.scopes || []
      const missing = META_SCOPES.map(item => item.scope).filter(scope => !granted.includes(scope))
      add({ id:"scopes", step:5, title:"Permissions granted by customers", status:!debug.data.is_valid ? "fail" : missing.length ? "warn" : "pass",
        detail:!debug.data.is_valid ? `The latest connection (${connection.organization.name}) has an invalid token — the customer must reconnect.` :
          missing.length ? `Latest connection (${connection.organization.name}) is missing: ${missing.join(", ")}. Request advanced access for these in App Review.`
            : `Latest connection (${connection.organization.name}) granted all ${granted.length} required permissions.` })
    } catch (error) {
      add({ id:"scopes", step:5, title:"Permissions granted by customers", status:"warn", detail:`Could not inspect the token: ${error instanceof Error ? error.message : "error"}` })
    }
  }

  const wabas = await prisma.waba.findMany({ where:{ status:"CONNECTED" }, take:20, orderBy:{ updatedAt:"desc" },
    select:{ wabaId:true, name:true, organizationId:true, organization:{ select:{ name:true } } } })
  if (!wabas.length) {
    add({ id:"waba_subscriptions", step:6, title:"Customer WABAs subscribed to webhooks", status:"info", detail:"No WhatsApp Business Accounts connected yet." })
  } else {
    const results = await Promise.all(wabas.map(async waba => {
      const tokenRow = await prisma.metaConnection.findFirst({ where:{ organizationId:waba.organizationId, status:"CONNECTED", accessTokenEncrypted:{ not:null } },
        orderBy:{ updatedAt:"desc" }, select:{ accessTokenEncrypted:true } })
      if (!tokenRow?.accessTokenEncrypted) return { waba, subscribed:null as boolean|null }
      return isWabaSubscribed(waba.wabaId, decryptMetaToken(tokenRow.accessTokenEncrypted))
        .then(result => ({ waba, subscribed:result.subscribed as boolean|null })).catch(() => ({ waba, subscribed:null as boolean|null }))
    }))
    const unsubscribed = results.filter(item => item.subscribed === false)
    const unknown = results.filter(item => item.subscribed === null)
    add({ id:"waba_subscriptions", step:6, title:"Customer WABAs subscribed to webhooks", status:unsubscribed.length ? "fail" : unknown.length ? "warn" : "pass",
      detail:[`${results.length - unsubscribed.length - unknown.length} of ${results.length} subscribed.`,
        unsubscribed.length ? `Not subscribed: ${unsubscribed.map(item => `${item.waba.name} (${item.waba.organization.name})`).join(", ")} — they can fix it in Settings → WhatsApp.` : "",
        unknown.length ? `Could not check ${unknown.length} (token missing or expired).` : ""].filter(Boolean).join(" ") })
  }

  return NextResponse.json({
    checks,
    values:{ appId:appIdOk ? appId : "", callbackUrl, redirectUri, verifyToken:verifyToken && !PLACEHOLDER.test(verifyToken) ? verifyToken : "",
      scopes:META_SCOPES, publicUrl, configId:/^\d{5,25}$/.test(env.NEXT_PUBLIC_META_CONFIG_ID || "") ? env.NEXT_PUBLIC_META_CONFIG_ID : "",
      graphVersion:version(), appSecretSet:Boolean(appSecret && !PLACEHOLDER.test(appSecret)),
      encryptionKeySet:encryptionKey.length >= 32 && !PLACEHOLDER.test(encryptionKey), canWriteEnv:canWriteEnvFile() },
    summary:{ pass:checks.filter(check => check.status === "pass").length, attention:checks.filter(check => check.status === "fail" || check.status === "warn").length },
    checkedAt:new Date().toISOString(),
  })
}

const saveSchema = z.object({
  appId: z.string().trim().regex(/^\d{10,20}$/, "App ID is the numeric ID from App settings → Basic."),
  appSecret: z.string().trim().regex(/^[a-f0-9]{32}$/i, "App secret is 32 letters and numbers from App settings → Basic.").optional().or(z.literal("")),
  verifyToken: z.string().trim().regex(/^[\w.~-]{8,100}$/, "Verify token: 8–100 letters, numbers, dot, dash or underscore.").optional().or(z.literal("")),
  generateVerifyToken: z.boolean().default(false),
  configId: z.string().trim().regex(/^\d{5,25}$/, "Configuration ID is numeric.").optional().or(z.literal("")),
  graphVersion: z.string().trim().regex(/^v\d+\.\d+$/, "Graph API version looks like v25.0.").default("v25.0"),
})

// Saves the platform's Meta app credentials into .env after Meta confirms they work.
export async function POST(request:NextRequest) {
  const session = await getSession()
  if (!session?.user || !["SUPER_ADMIN","ADMIN"].includes(session.user.adminRole))
    return NextResponse.json({ error:"Only super admins and admins can change Meta app credentials." }, { status:403 })
  try {
    const input = saveSchema.parse(await request.json())
    const env = process.env
    const currentSecret = env.META_APP_SECRET && !PLACEHOLDER.test(env.META_APP_SECRET) ? env.META_APP_SECRET : ""
    const appSecret = input.appSecret || currentSecret
    if (!appSecret) return NextResponse.json({ error:"Enter the App secret (App settings → Basic → Show)." }, { status:400 })

    // Confirm with Meta before writing anything.
    let appName = input.appId
    try {
      const token = await fetch(`https://graph.facebook.com/${input.graphVersion}/oauth/access_token?client_id=${input.appId}&client_secret=${encodeURIComponent(appSecret)}&grant_type=client_credentials`,
        { cache:"no-store", signal:AbortSignal.timeout(15000) }).then(response => response.json()) as { access_token?:string; error?:{ message?:string } }
      if (!token.access_token) throw new Error(token.error?.message || "Meta rejected the credentials")
      const app = await graph<{ name?:string }>(`${input.appId}?fields=name`, token.access_token).catch(() => ({ name:undefined }))
      appName = app.name || input.appId
    } catch (error) {
      return NextResponse.json({ error:`Meta did not accept this App ID and secret: ${error instanceof Error ? error.message : "unknown error"}. Nothing was saved.` }, { status:400 })
    }

    const currentVerify = env.META_VERIFY_TOKEN && !PLACEHOLDER.test(env.META_VERIFY_TOKEN) ? env.META_VERIFY_TOKEN : ""
    const verifyToken = input.verifyToken || (input.generateVerifyToken || !currentVerify ? crypto.randomBytes(18).toString("hex") : currentVerify)
    const values:Record<string,string> = {
      META_APP_ID:input.appId, NEXT_PUBLIC_META_APP_ID:input.appId, META_APP_SECRET:appSecret,
      META_VERIFY_TOKEN:verifyToken, META_GRAPH_API_VERSION:input.graphVersion,
    }
    if (input.configId !== undefined) values.NEXT_PUBLIC_META_CONFIG_ID = input.configId
    // Never replace a strong ENCRYPTION_KEY: stored customer tokens could no longer be decrypted.
    const encryptionKey = env.ENCRYPTION_KEY || ""
    const generatedKey = encryptionKey.length < 32 || PLACEHOLDER.test(encryptionKey)
    if (generatedKey) values.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex")

    const changed = Object.keys(values)
    await prisma.auditLog.create({ data:{ userId:session.user.id, actorType:"ADMIN", action:"META_APP_CREDENTIALS_UPDATED",
      resource:"platform", metadata:{ keys:changed, appId:input.appId, writtenToEnv:canWriteEnvFile() } } }).catch(() => null)

    if (!canWriteEnvFile()) {
      const lines = Object.entries(values).map(([key, value]) => `${key}=${key === "META_APP_SECRET" || key === "ENCRYPTION_KEY" ? "<the value you entered>" : value}`)
      return NextResponse.json({ ok:false, appName, manual:true, lines,
        error:"This production server doesn't allow writing .env. Meta accepted the credentials — add these lines to your hosting environment variables and restart." }, { status:409 })
    }
    const written = await updateEnvFile(values)
    return NextResponse.json({ ok:true, appName, keys:changed, backup:written.backup, generatedVerifyToken:!input.verifyToken && verifyToken !== currentVerify,
      generatedEncryptionKey:generatedKey,
      message:`Saved credentials for “${appName}” to .env. The dev server reloads them automatically; restart a production server to apply.` })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Could not save credentials."
    return NextResponse.json({ error:message }, { status:400 })
  }
}
