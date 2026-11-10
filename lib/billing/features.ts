// Plan features: what each plan includes. Shared by the server (enforcement), the app (plan cards,
// upgrade prompts, locked pages) and the marketing page. Keep free of server-only imports.

export const FEATURES = {
  whatsappApi:             { label: "Official WhatsApp Business API", group: "Essentials", description: "Your own number on the official API — no bans for bulk messaging." },
  inbox:                   { label: "Shared team inbox", group: "Essentials", description: "Every WhatsApp chat in one inbox for your whole team." },
  templates:               { label: "Template library & builder", group: "Essentials", description: "40+ ready templates plus text, media and carousel templates." },
  contacts:                { label: "Contacts, tags & custom fields", group: "Essentials", description: "Organise customers with up to tags, attributes and custom fields." },
  unlimitedContacts:       { label: "Unlimited contacts upload", group: "Essentials", description: "Upload and manage unlimited contacts with CSV sync." },
  freeServiceConversations:{ label: "1,000 Free Service messages / mo", group: "Essentials", description: "Meta grants 1,000 free service conversation threads every month." },
  quickReplies:            { label: "Quick replies & internal notes", group: "Essentials", description: "Saved answers and private team notes in every chat." },
  linkWidget:              { label: "WhatsApp link, QR & website button", group: "Essentials", description: "Let customers start a chat from your site, ads or print." },
  greenTick:               { label: "Green / Blue tick application help", group: "Essentials", description: "Check eligibility and apply for Meta's official verified badge." },
  pages:                   { label: "WhatsApp page builder", group: "Essentials", description: "Mini-website, link-in-bio and landing pages where every button opens a WhatsApp chat (Free: 1 page)." },
  broadcasts:              { label: "Broadcasts, scheduling & retargeting", group: "Marketing", description: "Send personalised templates to thousands, now or later, with delivery reports." },
  segments:                { label: "Saved segments & custom lists", group: "Marketing", description: "Reusable audiences built from tags, fields and activity." },
  smartAudience:           { label: "Smart audience segregation", group: "Marketing", description: "Segment contacts into targeted lists and audience cohorts." },
  clickTracking:           { label: "Click tracking & retargeting", group: "Marketing", description: "See who clicked your links and re-target readers, repliers and clickers." },
  campaignBudget:          { label: "Campaign budget & ROI analytics", group: "Marketing", description: "Track delivery costs, click performance and campaign ROI." },
  ads:                     { label: "Click-to-WhatsApp ads manager", group: "Marketing", description: "Create Facebook & Instagram ads that open a WhatsApp chat, and track leads." },
  adCredits:               { label: "₹1,000 Meta Ad Credits guide", group: "Marketing", description: "Guidance to claim ₹1,000 free Meta ad credits for Click-to-WhatsApp ads." },
  flows:                   { label: "Chatbot flow builder (unlimited flows)", group: "Automation", description: "Drag-and-drop chatbots with buttons, lists, questions, API calls, delays and ice breakers." },
  forms:                   { label: "WhatsApp forms", group: "Automation", description: "Collect leads and details with native WhatsApp Flows and hosted forms." },
  inboxAutomation:         { label: "Auto-assign, business hours & away message", group: "Automation", description: "Route chats to agents automatically and reply outside working hours." },
  smartRouting:            { label: "Smart agent routing & auto-assignment", group: "Automation", description: "Route chats to specific agents based on topic, team or workload." },
  analytics:               { label: "Analytics dashboard", group: "Automation", description: "Delivery, read and reply rates, team response times and broadcast results." },
  speed40:                 { label: "Messaging speed: 40 msgs/second", group: "Performance", description: "Reliable bulk delivery at up to 40 messages per second." },
  speed250:                { label: "High messaging speed: 250 msgs/second", group: "Performance", description: "Accelerated campaign dispatch for large subscriber lists." },
  speed1000:               { label: "Enterprise messaging speed: 1,000 msgs/second", group: "Performance", description: "Ultra-fast high-volume delivery with dedicated infrastructure." },
  commerce:                { label: "Catalog, cart orders & payment links", group: "Commerce", description: "Share products, receive carts as orders and collect payments by UPI or link." },
  integrations:            { label: "Shopify, WooCommerce, Zapier & Google Sheets", group: "Integrations", description: "Order updates, COD confirmation, abandoned carts and no-code automations." },
  api:                     { label: "Developer API & webhooks", group: "Integrations", description: "Send messages from your own systems and receive real-time events." },
  instagram:               { label: "Instagram inbox", group: "Integrations", description: "Answer Instagram DMs from the same inbox." },
  calling:                 { label: "WhatsApp Calling", group: "Integrations", description: "Answer customers' WhatsApp calls in the browser and call them back with permission." },
  numberMasking:           { label: "Number masking & agent privacy", group: "Security", description: "Protect customer privacy and prevent agents from seeing personal phone numbers." },
  auditLogs:               { label: "SSO & enterprise audit logs", group: "Security", description: "Single sign-on integration and complete activity audit trail for compliance." },
  prioritySupport:         { label: "Priority support", group: "Support", description: "Faster answers from our India-based team." },
  onboardingSetup:         { label: "Dedicated 1:1 onboarding & setup", group: "Support", description: "Hands-on account setup, template migration and team training." },
  whiteLabel:              { label: "White-label partner programme", group: "Support", description: "Run client workspaces under your own brand, logo and web address (partner panel)." },
  dedicatedManager:        { label: "Dedicated manager & SLA guarantee", group: "Support", description: "A named account manager and an uptime commitment." },
} as const
export type FeatureKey = keyof typeof FEATURES
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[]

const ESSENTIALS: FeatureKey[] = ["whatsappApi", "inbox", "templates", "contacts", "unlimitedContacts", "quickReplies", "linkWidget", "greenTick", "pages", "freeServiceConversations", "adCredits"]
const STARTER: FeatureKey[] = [...ESSENTIALS, "broadcasts", "segments", "smartAudience", "speed40"]
const BUSINESS: FeatureKey[] = [...STARTER, "flows", "forms", "inboxAutomation", "smartRouting", "clickTracking", "campaignBudget", "analytics", "commerce", "ads", "api", "instagram"]
const PROFESSIONAL: FeatureKey[] = [...BUSINESS, "integrations", "calling", "numberMasking", "speed250", "prioritySupport"]
const ENTERPRISE: FeatureKey[] = [...PROFESSIONAL, "whiteLabel", "dedicatedManager", "speed1000", "auditLogs", "onboardingSetup"]

// Starting split (approved 2026-10-20). Super admins can change it per plan afterwards.
export const DEFAULT_PLAN_FEATURES: Record<string, FeatureKey[]> = {
  free: ESSENTIALS, starter: STARTER, business: BUSINESS, professional: PROFESSIONAL, enterprise: ENTERPRISE,
}

// Plan.features is stored as { key: true }. Older plans used inbox/analytics/campaigns/automation/api/whiteLabel flags.
export function featuresOf(plan: { slug: string; features: unknown } | null | undefined): FeatureKey[] {
  if (!plan) return []
  const value = plan.features && typeof plan.features === "object" && !Array.isArray(plan.features) ? plan.features as Record<string, unknown> : {}
  const known = FEATURE_KEYS.filter(key => value[key] === true)
  // Features added after a plan was saved (key missing, not false) follow that plan's default.
  if (known.length > 6 || "whatsappApi" in value) return [...known, ...(DEFAULT_PLAN_FEATURES[plan.slug] || []).filter(key => !(key in value) && !known.includes(key))]
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
  { prefix: "/api/calls", feature: "calling", scope: "all" },
  { prefix: "/api/pages", feature: "pages", scope: "write" },
]
export const FEATURE_PAGES: { prefix: string; feature: FeatureKey }[] = [
  { prefix: "/app/campaigns", feature: "broadcasts" }, { prefix: "/app/contacts/segments", feature: "segments" },
  { prefix: "/app/automation", feature: "flows" }, { prefix: "/app/forms", feature: "forms" }, { prefix: "/app/analytics", feature: "analytics" },
  { prefix: "/app/commerce", feature: "commerce" }, { prefix: "/app/payments", feature: "commerce" }, { prefix: "/app/ads", feature: "ads" },
  { prefix: "/app/developers", feature: "api" }, { prefix: "/app/integrations", feature: "integrations" }, { prefix: "/app/calls", feature: "calling" }, { prefix: "/app/pages", feature: "pages" },
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
