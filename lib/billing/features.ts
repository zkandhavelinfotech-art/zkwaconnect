// Plan features: what each plan includes. Shared by the server (enforcement), the app (plan cards,
// upgrade prompts, locked pages) and the marketing page. Keep free of server-only imports.

export const FEATURES = {
  whatsappApi:     { label: "Official WhatsApp Business API", group: "Essentials", description: "Your own number on the official API — no bans for bulk messaging." },
  inbox:           { label: "Shared team inbox", group: "Essentials", description: "Every WhatsApp chat in one inbox for your whole team." },
  templates:       { label: "Template library & builder", group: "Essentials", description: "40+ ready templates plus text, media and carousel templates." },
  contacts:        { label: "Contacts, tags & CSV import", group: "Essentials", description: "Organise customers with tags and custom fields." },
  quickReplies:    { label: "Quick replies & internal notes", group: "Essentials", description: "Saved answers and private team notes in every chat." },
  linkWidget:      { label: "WhatsApp link, QR & website button", group: "Essentials", description: "Let customers start a chat from your site, ads or print." },
  greenTick:       { label: "Green tick application help", group: "Essentials", description: "Check eligibility and apply for the verified badge." },
  broadcasts:      { label: "Broadcasts & scheduling", group: "Marketing", description: "Send personalised templates to thousands, now or later, with delivery reports." },
  segments:        { label: "Saved segments", group: "Marketing", description: "Reusable audiences built from tags, fields and activity." },
  clickTracking:   { label: "Click tracking & retargeting", group: "Marketing", description: "See who clicked your links and re-target readers, repliers and clickers." },
  ads:             { label: "Click-to-WhatsApp ads", group: "Marketing", description: "Create Facebook & Instagram ads that open a WhatsApp chat, and track their leads." },
  flows:           { label: "Chatbot flow builder (unlimited flows)", group: "Automation", description: "Drag-and-drop chatbots with buttons, lists, questions, API calls, delays and ice breakers." },
  forms:           { label: "WhatsApp forms", group: "Automation", description: "Collect leads and details with native WhatsApp Flows and hosted forms." },
  inboxAutomation: { label: "Auto-assign, business hours & away message", group: "Automation", description: "Route chats to agents automatically and reply outside working hours." },
  analytics:       { label: "Analytics dashboard", group: "Automation", description: "Delivery, read and reply rates, team response times and broadcast results." },
  commerce:        { label: "Catalog, cart orders & payment links", group: "Commerce", description: "Share products, receive carts as orders and collect payments by UPI or link." },
  integrations:    { label: "Shopify, WooCommerce, Zapier & Google Sheets", group: "Integrations", description: "Order updates, COD confirmation, abandoned carts and no-code automations." },
  api:             { label: "Developer API & webhooks", group: "Integrations", description: "Send messages from your own systems and receive real-time events." },
  instagram:       { label: "Instagram inbox", group: "Integrations", description: "Answer Instagram DMs from the same inbox." },
  prioritySupport: { label: "Priority support", group: "Support", description: "Faster answers from our India-based team." },
  whiteLabel:      { label: "White-label option", group: "Support", description: "Your brand on the platform for your own clients." },
  dedicatedManager:{ label: "Dedicated manager & SLA", group: "Support", description: "A named account manager and an uptime commitment." },
} as const
export type FeatureKey = keyof typeof FEATURES
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[]

const ESSENTIALS: FeatureKey[] = ["whatsappApi", "inbox", "templates", "contacts", "quickReplies", "linkWidget", "greenTick"]
const STARTER: FeatureKey[] = [...ESSENTIALS, "broadcasts", "segments"]
const BUSINESS: FeatureKey[] = [...STARTER, "flows", "forms", "inboxAutomation", "clickTracking", "analytics", "commerce", "ads"]
const PROFESSIONAL: FeatureKey[] = [...BUSINESS, "api", "integrations", "instagram"]
const ENTERPRISE: FeatureKey[] = [...PROFESSIONAL, "prioritySupport", "whiteLabel", "dedicatedManager"]

// Starting split (approved 2026-10-20). Super admins can change it per plan afterwards.
export const DEFAULT_PLAN_FEATURES: Record<string, FeatureKey[]> = {
  free: ESSENTIALS, starter: STARTER, business: BUSINESS, professional: PROFESSIONAL, enterprise: ENTERPRISE,
}

// Plan.features is stored as { key: true }. Older plans used inbox/analytics/campaigns/automation/api/whiteLabel flags.
export function featuresOf(plan: { slug: string; features: unknown } | null | undefined): FeatureKey[] {
  if (!plan) return []
  const value = plan.features && typeof plan.features === "object" && !Array.isArray(plan.features) ? plan.features as Record<string, unknown> : {}
  const known = FEATURE_KEYS.filter(key => value[key] === true)
  if (known.length > 6 || "whatsappApi" in value) return known
  return DEFAULT_PLAN_FEATURES[plan.slug] || known
}

export const toFeatureJson = (keys: FeatureKey[]) => Object.fromEntries(FEATURE_KEYS.map(key => [key, keys.includes(key)]))

// Which feature each API area and app page needs. Pages show an upgrade screen; the server refuses the action.
export const FEATURE_API: { prefix: string; feature: FeatureKey; scope: "write" | "all" }[] = [
  { prefix: "/api/campaigns", feature: "broadcasts", scope: "write" },
  { prefix: "/api/segments", feature: "segments", scope: "write" },
  { prefix: "/api/workflows", feature: "flows", scope: "write" },
  { prefix: "/api/flows", feature: "flows", scope: "write" },
  { prefix: "/api/forms", feature: "forms", scope: "write" },
  { prefix: "/api/analytics", feature: "analytics", scope: "all" },
  { prefix: "/api/commerce", feature: "commerce", scope: "all" },
  { prefix: "/api/whatsapp/payments", feature: "commerce", scope: "write" },
  { prefix: "/api/meta/ads", feature: "ads", scope: "all" },
  { prefix: "/api/developer", feature: "api", scope: "all" },
  { prefix: "/api/integrations", feature: "integrations", scope: "all" },
  { prefix: "/api/instagram", feature: "instagram", scope: "all" },
]
export const FEATURE_PAGES: { prefix: string; feature: FeatureKey }[] = [
  { prefix: "/app/campaigns", feature: "broadcasts" }, { prefix: "/app/contacts/segments", feature: "segments" },
  { prefix: "/app/automation", feature: "flows" }, { prefix: "/app/forms", feature: "forms" }, { prefix: "/app/analytics", feature: "analytics" },
  { prefix: "/app/commerce", feature: "commerce" }, { prefix: "/app/payments", feature: "commerce" }, { prefix: "/app/ads", feature: "ads" },
  { prefix: "/app/developers", feature: "api" }, { prefix: "/app/integrations", feature: "integrations" },
]

const matchPrefix = <T extends { prefix: string }>(rules: T[], path: string) =>
  rules.filter(rule => path === rule.prefix || path.startsWith(`${rule.prefix}/`)).sort((a, b) => b.prefix.length - a.prefix.length)[0]

export function featureForApi(method: string, path: string) {
  const rule = matchPrefix(FEATURE_API, path)
  if (!rule) return null
  const write = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())
  return rule.scope === "all" || write ? rule.feature : null
}
export const featureForPage = (path: string) => matchPrefix(FEATURE_PAGES, path)?.feature || null

export type PlanSummary = { slug: string; name: string; monthlyPrice: number; features: FeatureKey[] }
// Cheapest plan that includes a feature (for "Available on Business and above").
export function cheapestWith(plans: PlanSummary[], feature: FeatureKey) {
  return [...plans].filter(plan => plan.features.includes(feature)).sort((a, b) => a.monthlyPrice - b.monthlyPrice)[0] || null
}
export function lockedMessage(feature: FeatureKey, plans: PlanSummary[]) {
  const plan = cheapestWith(plans, feature)
  return `${FEATURES[feature].label} ${plan ? `is available on the ${plan.name} plan and above` : "isn't included in your plan"}. Upgrade under Billing to use it.`
}
