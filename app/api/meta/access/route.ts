import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { graphVersion, metaGraph } from "@/lib/meta/graph"
import { resolveMetaError } from "@/lib/meta/access"

export const runtime = "nodejs"

type App = { id?: string; name?: string; whatsapp_business_api_data?: { id?: string; name?: string } }
type AssignedUser = { id: string; name?: string; email?: string; tasks?: string[]; permitted_tasks?: string[]; role?: string }
type LiveWaba = {
  id: string; name?: string; status?: string; health_status?: unknown; ownership_type?: string
  is_shared_with_partners?: boolean; owner_business_info?: { id?: string; name?: string }
}
type LivePhone = {
  id: string; display_phone_number?: string; verified_name?: string; status?: string
  code_verification_status?: string; quality_rating?: string; name_status?: string
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Meta request failed."
}

async function context(request: NextRequest) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) }
  const requested = request.nextUrl.searchParams.get("organizationId")
  const isAdmin = session.user.adminRole !== "NONE"
  const membership = session.user.memberships.find(item => item.organizationId === requested)
    || session.user.memberships.find(item => item.status === "ACTIVE")
  const organizationId = requested && isAdmin ? requested : membership?.organizationId
  if (!organizationId) return { error: NextResponse.json({ error: "No workspace found." }, { status: 404 }) }
  const role = session.user.memberships.find(item => item.organizationId === organizationId)?.role || ""
  return { organizationId, canManage: isAdmin, userId: session.user.id }
}

async function loadWorkspace(organizationId: string) {
  const [organization, connection, waba, latestOutbound] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } }),
    prisma.metaConnection.findFirst({ where: { organizationId, status: "CONNECTED" }, orderBy: { updatedAt: "desc" } }),
    prisma.waba.findFirst({ where: { organizationId, status: "CONNECTED" }, include: { phoneNumbers: true }, orderBy: { updatedAt: "desc" } }),
    prisma.message.findFirst({ where:{direction:"OUTBOUND",conversation:{organizationId}},orderBy:{createdAt:"desc"},select:{status:true,metadata:true,createdAt:true} }),
  ])
  if (!organization) throw new Error("Workspace not found.")
  const token = connection?.accessTokenEncrypted ? decryptMetaToken(connection.accessTokenEncrypted) : null
  return { organization, connection, waba, token, latestOutbound }
}

async function inspect(organizationId: string) {
  const { organization, connection, waba, token, latestOutbound } = await loadWorkspace(organizationId)
  const appId = process.env.META_APP_ID || ""
  const agencyBusinessId = process.env.META_AGENCY_BUSINESS_ID || ""
  const base = {
    organization: { id: organization.id, name: organization.name },
    ids: {
      appId: appId || null,
      businessId: waba?.metaBusinessId || connection?.businessManagerId || null,
      wabaId: waba?.wabaId || null,
      agencyBusinessId: agencyBusinessId || null,
    },
  }
  if (!connection || !token) return {
    ...base, overall: "blocked", lastCheckedAt: new Date().toISOString(),
    summary: "Connect Meta before checking WhatsApp access.",
    checks: [{ id: "connection", label: "Meta connection", status: "failed", detail: "No active encrypted access token is stored.", automated: false, action: "Reconnect Meta" }],
    subscribedApps: [], phones: [], links: { reconnect: "/onboarding" },
  }
  if (!waba) return {
    ...base, overall: "blocked", lastCheckedAt: new Date().toISOString(),
    summary: "Choose a WhatsApp Business Account before checking permissions.",
    checks: [{ id: "waba", label: "WhatsApp Business Account", status: "failed", detail: "No active WABA is linked to this workspace.", automated: false, action: "Choose a WABA" }],
    subscribedApps: [], phones: [], links: { reconnect: "/onboarding/waba-setup" },
  }

  let profile: { id: string; name?: string; email?: string } | null = null
  let liveWaba: LiveWaba | null = null
  let apps: App[] = []
  let assigned: AssignedUser[] = []
  let phones: LivePhone[] = []
  let scopes: string[] | null = null
  let agencies: { id?: string; name?: string; tasks?: string[] }[] | null = null
  const errors: Record<string, string> = {}
  const storedBusinessId = waba.metaBusinessId || connection.businessManagerId || ""

  await Promise.all([
    metaGraph<{ id: string; name?: string; email?: string }>("me?fields=id,name,email", token).then(value => { profile = value }).catch(error => { errors.connection = errorText(error) }),
    metaGraph<LiveWaba>(`${waba.wabaId}?fields=id,name,status,health_status,ownership_type,is_shared_with_partners,owner_business_info`, token)
      .then(value => { liveWaba = value }).catch(error => { errors.waba = errorText(error) }),
    metaGraph<{ data?: App[] }>(`${waba.wabaId}/subscribed_apps`, token).then(value => { apps = value.data || [] }).catch(error => { errors.subscription = errorText(error) }),
    storedBusinessId
      ? metaGraph<{ data?: AssignedUser[] }>(`${waba.wabaId}/assigned_users?business=${encodeURIComponent(storedBusinessId)}&fields=id,name,email,tasks,permitted_tasks`, token)
          .then(value => { assigned = value.data || [] }).catch(error => { errors.userTasks = errorText(error) })
      : Promise.resolve().then(() => { errors.userTasks = "The WABA owner Business Portfolio ID is missing. Re-select this WABA during managed onboarding." }),
    metaGraph<{ data?: LivePhone[] }>(`${waba.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status,code_verification_status,quality_rating,name_status`, token)
      .then(value => { phones = value.data || [] }).catch(error => { errors.phones = errorText(error) }),
    (async () => {
      if (!appId || !process.env.META_APP_SECRET) return
      const appToken = `${appId}|${process.env.META_APP_SECRET}`
      const url = new URL(`https://graph.facebook.com/${graphVersion()}/debug_token`)
      url.searchParams.set("input_token", token); url.searchParams.set("access_token", appToken)
      const body = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) }).then(response => response.json())
      scopes = body?.data?.scopes || []
    })().catch(error => { errors.scopes = errorText(error) }),
    agencyBusinessId
      ? metaGraph<{ data?: { id?: string; name?: string; tasks?: string[] }[] }>(`${waba.wabaId}/agencies?fields=id,name,tasks`, token)
          .then(value => { agencies = value.data || [] }).catch(error => { errors.partner = errorText(error) })
      : Promise.resolve(),
  ])

  // Promise callbacks populate these values; explicit aliases keep control-flow typing accurate.
  const resolvedProfile = profile as { id: string; name?: string; email?: string } | null
  const resolvedWaba = liveWaba as LiveWaba | null
  const resolvedAgencies = agencies as { id?: string; name?: string; tasks?: string[] }[] | null
  const normalizedApps = apps.map(item => item.whatsapp_business_api_data || item).map(item => ({ id: item.id || "", name: item.name || "Unknown app" }))
  const appSubscribed = Boolean(appId && normalizedApps.some(item => item.id === appId))
  const assignedManager = assigned.find(item => (item.tasks || []).includes("MANAGE"))
  const requiredScopes = ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"]
  const missingScopes = scopes ? requiredScopes.filter(scope => !scopes!.includes(scope)) : []
  const registeredPhones = phones.filter(phone => phone.status === "CONNECTED" || phone.code_verification_status === "VERIFIED")
  const agency = agencyBusinessId && resolvedAgencies ? resolvedAgencies.find(item => item.id === agencyBusinessId) : null
  const latestMetadata = latestOutbound?.metadata && typeof latestOutbound.metadata === "object" && !Array.isArray(latestOutbound.metadata) ? latestOutbound.metadata as Record<string,unknown> : null
  const latestSendError = typeof latestMetadata?.metaError === "string" ? latestMetadata.metaError : ""
  const outboundBlocked = latestOutbound?.status === "FAILED" && /permissions to send messages|2593181|code 10/i.test(latestSendError)

  const checks = [
    { id: "connection", label: "Meta access token", status: resolvedProfile ? "ready" : "failed", detail: resolvedProfile ? `Connected as ${resolvedProfile.name || resolvedProfile.id}.` : errors.connection || "Token could not be validated.", automated: false, action: resolvedProfile ? null : "Reconnect Meta" },
    { id: "scopes", label: "OAuth permissions", status: scopes === null ? "unknown" : missingScopes.length ? "failed" : "ready", detail: scopes === null ? errors.scopes || "Could not inspect token scopes." : missingScopes.length ? `Missing: ${missingScopes.join(", ")}` : "Management, messaging and business permissions are granted.", automated: false, action: missingScopes.length ? "Reconnect and approve permissions" : null },
    { id: "waba", label: "WhatsApp account access", status: resolvedWaba ? "ready" : "failed", detail: resolvedWaba ? `${resolvedWaba.name || waba.name} is readable (${resolvedWaba.status || "status unavailable"}).` : errors.waba || "The connected user cannot read this WABA.", automated: false, action: resolvedWaba ? null : "Grant WABA access" },
    { id: "subscription", label: "App subscribed to webhooks", status: errors.subscription ? "failed" : appSubscribed ? "ready" : "action", detail: errors.subscription || (appSubscribed ? "This app is subscribed to the selected WABA." : "This app is not subscribed. Incoming messages and status events may not arrive."), automated: true, action: appSubscribed ? null : "Subscribe app" },
    { id: "userTasks", label: "Business user asset control", status: errors.userTasks ? "failed" : assignedManager ? "ready" : "action", detail: errors.userTasks || (assignedManager ? `${assignedManager.name || assignedManager.id} has the WABA Manage task. Messaging authorization is verified separately from the token scope.` : assigned.length ? `Assigned users found, but none has Manage: ${assigned.map(item => `${item.name || item.id} (${(item.tasks || []).join(", ") || "no tasks"})`).join("; ")}.` : "No business or system user is assigned to this WABA."), automated: true, action: assignedManager ? null : "Assign WABA Manage" },
    { id: "phones", label: "Outbound phone number", status: errors.phones ? "failed" : registeredPhones.length ? "ready" : "action", detail: errors.phones || (registeredPhones.length ? `${registeredPhones.length} registered/verified number(s) found.` : "No registered or verified phone number was found."), automated: true, action: registeredPhones.length ? null : "Sync or register number" },
    { id: "outboundAuthorization", label: "Live outbound authorization", status: outboundBlocked ? "manual" : latestOutbound?.status === "SENT" || latestOutbound?.status === "DELIVERED" || latestOutbound?.status === "READ" ? "ready" : "unknown", detail: outboundBlocked ? `The latest send is still blocked by Meta: ${latestSendError}. The token, WABA and app subscription can be valid while the app still needs Live/Advanced Access or the previous BSP migration completed.` : latestOutbound ? `Latest outbound status: ${latestOutbound.status} (${latestOutbound.createdAt.toISOString()}).` : "No outbound send has been attempted yet.", automated: false, action: outboundBlocked ? "Complete Meta production access" : null },
    { id: "partner", label: "Agency partner access", status: !agencyBusinessId ? "optional" : resolvedAgencies === null ? "unknown" : agency ? "ready" : "manual", detail: !agencyBusinessId ? "Not configured for this installation. Direct customer ownership and messaging are unaffected; set META_AGENCY_BUSINESS_ID only when ZKWAConnect must be assigned as a Meta agency partner." : resolvedAgencies === null ? errors.partner || "Meta did not allow partner access to be inspected with this token." : agency ? `${agency.name || agency.id} is assigned${agency.tasks?.length ? `: ${agency.tasks.join(", ")}` : ""}.` : "The configured agency is not shown on this WABA. An asset owner must assign it in Meta Business Settings.", automated: false, action: agencyBusinessId && !agency ? "Assign in Meta" : null },
  ]
  const failing = checks.filter(item => ["failed", "action", "manual"].includes(item.status))
  const overall = failing.some(item => item.status === "failed") ? "blocked" : failing.length ? "action_required" : "ready"
  const businessId = resolvedWaba?.owner_business_info?.id || waba.metaBusinessId || connection.businessManagerId || ""
  return {
    ...base, overall, lastCheckedAt: new Date().toISOString(),
    summary: overall === "ready" ? "Inbound events and outbound messaging access are configured." : `${failing.length} access step${failing.length === 1 ? "" : "s"} need attention.`,
    checks, subscribedApps: normalizedApps, phones: phones.map(phone => ({ id: phone.id, display: phone.display_phone_number || "", name: phone.verified_name || null, status: phone.status || phone.code_verification_status || "UNKNOWN", quality: phone.quality_rating || null })),
    meta: { wabaName: resolvedWaba?.name || waba.name, ownershipType: resolvedWaba?.ownership_type || null, sharedWithPartners: resolvedWaba?.is_shared_with_partners ?? null },
    links: {
      reconnect: "/onboarding",
      wabaSettings: businessId ? `https://business.facebook.com/latest/settings/whatsapp_account?business_id=${businessId}&selected_asset_id=${waba.wabaId}` : "https://business.facebook.com/latest/settings/whatsapp_account",
      partners: businessId ? `https://business.facebook.com/latest/settings/partners?business_id=${businessId}` : "https://business.facebook.com/latest/settings/partners",
      appReview: appId ? `https://developers.facebook.com/apps/${appId}/app-review/permissions/` : "https://developers.facebook.com/apps/",
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await context(request)
    if ("error" in auth) return auth.error
    return NextResponse.json({ ...(await inspect(auth.organizationId!)), canManage: auth.canManage })
  } catch (error) {
    return NextResponse.json({ error: errorText(error), resolution: resolveMetaError(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const steps: { id: string; status: "success" | "failed" | "skipped"; message: string; resolution?: ReturnType<typeof resolveMetaError> }[] = []
  try {
    const auth = await context(request)
    if ("error" in auth) return auth.error
    if (!auth.canManage) return NextResponse.json({ error: "Owner or admin access is required to change Meta permissions." }, { status: 403 })
    const body = await request.json().catch(() => ({})) as { action?: string }
    const action = body.action || "repair_all"
    const { connection, waba, token } = await loadWorkspace(auth.organizationId!)
    if (!connection || !waba || !token) return NextResponse.json({ error: "Connect Meta and choose a WABA first." }, { status: 409 })
    const profile = await metaGraph<{ id: string; name?: string; email?: string }>("me?fields=id,name,email", token)

    if (["repair_all", "subscribe_app"].includes(action)) {
      try {
        await metaGraph(`${waba.wabaId}/subscribed_apps`, token, { method: "POST" })
        steps.push({ id: "subscription", status: "success", message: "App subscribed to WABA webhooks." })
      } catch (error) { steps.push({ id: "subscription", status: "failed", message: errorText(error), resolution: resolveMetaError(error) }) }
    }
    if (["repair_all", "assign_user"].includes(action)) {
      try {
        let businessId = waba.metaBusinessId || connection.businessManagerId || ""
        if (!businessId) {
          const live = await metaGraph<LiveWaba>(`${waba.wabaId}?fields=owner_business_info`, token)
          businessId = live.owner_business_info?.id || ""
        }
        if (!businessId) throw new Error("The WABA owner Business Portfolio ID is missing. Re-select the WABA during managed onboarding.")
        const [people, systems] = await Promise.all([
          metaGraph<{data?:AssignedUser[]}>(`${businessId}/business_users?fields=id,name,email,role&limit=100`, token).then(result => result.data || []).catch(() => []),
          metaGraph<{data?:AssignedUser[]}>(`${businessId}/system_users?fields=id,name,role&limit=100`, token).then(result => result.data || []).catch(() => []),
        ])
        const candidates = [...people, ...systems]
        const configuredSystemUserId = process.env.META_SYSTEM_USER_ID || ""
        const byConfiguredId = configuredSystemUserId ? candidates.find(item => item.id === configuredSystemUserId) : null
        const byEmail = profile.email ? candidates.find(item => item.email?.toLowerCase() === profile.email?.toLowerCase()) : null
        const sameName = profile.name ? candidates.filter(item => item.name?.toLowerCase() === profile.name?.toLowerCase()) : []
        const target = byConfiguredId || byEmail || (sameName.length === 1 ? sameName[0] : null) || (candidates.length === 1 ? candidates[0] : null)
        if (!target) {
          steps.push({ id: "userTasks", status: "skipped", message: candidates.length
            ? `Meta returned ${candidates.length} business/system users, so automatic assignment is ambiguous. Set META_SYSTEM_USER_ID or assign WABA Manage manually in Business Settings.`
            : "Meta did not return a business-scoped or system user. Add one in Business Settings, then assign it to the WABA." })
        } else {
          const form = new URLSearchParams({ business: businessId, user: target.id, tasks: JSON.stringify(["MANAGE"]) })
          await metaGraph(`${waba.wabaId}/assigned_users`, token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form })
          steps.push({ id: "userTasks", status: "success", message: `WABA Manage task assigned to ${target.name || target.id}. Messaging permission is checked on the access token.` })
        }
      } catch (error) { steps.push({ id: "userTasks", status: "failed", message: errorText(error), resolution: resolveMetaError(error) }) }
    }
    if (["repair_all", "sync_assets"].includes(action)) {
      try {
        const live = await metaGraph<{ data?: LivePhone[] }>(`${waba.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status,code_verification_status,quality_rating`, token)
        let synced = 0
        for (const phone of live.data || []) {
          const existing = await prisma.phoneNumber.findUnique({ where: { phoneNumberId: phone.id } })
          if (existing && existing.wabaId !== waba.id) continue
          const verified = phone.code_verification_status === "VERIFIED" || phone.status === "CONNECTED"
          await prisma.phoneNumber.upsert({
            where: { phoneNumberId: phone.id },
            create: { wabaId: waba.id, phoneNumberId: phone.id, phoneNumber: phone.display_phone_number || phone.id, displayName: phone.verified_name, status: verified ? "CONNECTED" : "PENDING", verificationStatus: verified ? "VERIFIED" : phone.code_verification_status, qualityRating: phone.quality_rating },
            update: { phoneNumber: phone.display_phone_number || phone.id, displayName: phone.verified_name, status: verified ? "CONNECTED" : "PENDING", verificationStatus: verified ? "VERIFIED" : phone.code_verification_status, qualityRating: phone.quality_rating },
          })
          synced++
        }
        await prisma.metaConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } })
        steps.push({ id: "phones", status: "success", message: `${synced} phone number${synced === 1 ? "" : "s"} synchronized.` })
      } catch (error) { steps.push({ id: "phones", status: "failed", message: errorText(error), resolution: resolveMetaError(error) }) }
    }
    const report = await inspect(auth.organizationId!)
    return NextResponse.json({ ok: steps.every(step => step.status !== "failed"), steps, report }, { status: steps.some(step => step.status === "failed") ? 207 : 200 })
  } catch (error) {
    return NextResponse.json({ error: errorText(error), resolution: resolveMetaError(error), steps }, { status: 400 })
  }
}
