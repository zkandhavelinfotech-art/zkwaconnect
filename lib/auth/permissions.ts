// Workspace roles and what each can do. Enforced on the server for every /api request (see getSession),
// and used by the UI to hide what a role can't use.
export const ROLES = ["OWNER", "ADMIN", "MANAGER", "AGENT", "VIEWER"] as const
export type Role = typeof ROLES[number]
const RANK: Record<Role, number> = { VIEWER: 0, AGENT: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 }

export const ROLE_INFO: Record<Role, { label: string; summary: string }> = {
  OWNER: { label: "Owner", summary: "Everything, including billing, team and ownership." },
  ADMIN: { label: "Admin", summary: "Everything except managing owners: billing, team, Meta connection, integrations, API keys." },
  MANAGER: { label: "Manager", summary: "Broadcasts, templates, flows, forms, segments, analytics, inbox settings — plus everything agents do." },
  AGENT: { label: "Agent", summary: "Inbox (reply, notes, assign), contacts, orders and payment links." },
  VIEWER: { label: "Viewer", summary: "Read-only access to the inbox, contacts and orders." },
}

export const atLeast = (role: string | null | undefined, minimum: Role) => RANK[(role as Role)] >= RANK[minimum]

type Rule = { prefix: string; read?: Role; write?: Role; skip?: boolean }
// Longest matching prefix wins. Defaults: anyone can read, agents and above can change things.
const RULES = [
  ...["/api/admin", "/api/auth", "/api/profile", "/api/workspaces", "/api/me", "/api/push", "/api/invitations", "/api/webhooks", "/api/v1", "/api/hooks", "/api/public", "/api/cron"]
    .map(prefix => ({ prefix, skip: true }) as Rule),
  { prefix: "/api/team", read: "MANAGER", write: "ADMIN" } as Rule,
  { prefix: "/api/billing", read: "ADMIN", write: "ADMIN" } as Rule,
  { prefix: "/api/payments", write: "ADMIN" } as Rule,
  { prefix: "/api/developer", read: "ADMIN", write: "ADMIN" } as Rule,
  { prefix: "/api/integrations", read: "ADMIN", write: "ADMIN" } as Rule,
  { prefix: "/api/settings", write: "ADMIN" } as Rule,
  { prefix: "/api/onboarding", write: "ADMIN" } as Rule,
  { prefix: "/api/instagram", write: "ADMIN" } as Rule,
  { prefix: "/api/meta", read: "MANAGER", write: "ADMIN" } as Rule,
  { prefix: "/api/meta/ads", read: "MANAGER", write: "MANAGER" } as Rule,
  { prefix: "/api/meta/oauth", read: "ADMIN", write: "ADMIN" } as Rule,
  { prefix: "/api/green-tick", read: "MANAGER", write: "ADMIN" } as Rule,
  { prefix: "/api/analytics", read: "MANAGER" } as Rule,
  { prefix: "/api/campaigns", read: "MANAGER", write: "MANAGER" } as Rule,
  { prefix: "/api/templates", write: "MANAGER" } as Rule,
  { prefix: "/api/workflows", write: "MANAGER" } as Rule,
  { prefix: "/api/flows", write: "MANAGER" } as Rule,
  { prefix: "/api/forms", write: "MANAGER" } as Rule,
  { prefix: "/api/segments", write: "MANAGER" } as Rule,
  { prefix: "/api/inbox/settings", write: "MANAGER" } as Rule,
  { prefix: "/api/inbox/quick-replies", write: "MANAGER" } as Rule,
  { prefix: "/api/commerce", write: "MANAGER" } as Rule,
  { prefix: "/api/commerce/send", write: "AGENT" } as Rule,
  { prefix: "/api/commerce/orders", write: "AGENT" } as Rule,
] satisfies Rule[]
const SORTED: Rule[] = [...RULES].sort((a, b) => b.prefix.length - a.prefix.length)

export class PermissionError extends Error {
  readonly status = 403
  constructor(message: string) { super(message); this.name = "PermissionError" }
}

// null when allowed, otherwise the reason.
export function apiPermission(role: string, method: string, path: string): string | null {
  const rule = SORTED.find(item => path === item.prefix || path.startsWith(`${item.prefix}/`))
  if (rule?.skip) return null
  const write = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())
  const needed: Role = write ? rule?.write || "AGENT" : rule?.read || "VIEWER"
  if (atLeast(role, needed)) return null
  const label = ROLE_INFO[(role as Role)]?.label || role
  return `Your role (${label}) can't ${write ? "change" : "view"} this. Ask a workspace ${needed === "OWNER" ? "owner" : needed === "ADMIN" ? "owner or admin" : "manager or admin"}.`
}

// Which app pages a role can open (used to hide navigation).
export const PAGE_MIN_ROLE: Record<string, Role> = {
  "/app/analytics": "MANAGER", "/app/campaigns": "MANAGER", "/app/ads": "MANAGER", "/app/templates": "MANAGER", "/app/automation": "MANAGER",
  "/app/forms": "MANAGER", "/app/contacts/segments": "MANAGER", "/app/leads": "AGENT", "/app/integrations": "ADMIN", "/app/billing": "ADMIN",
  "/app/developers": "ADMIN", "/app/settings": "ADMIN", "/app/meta-account": "MANAGER", "/app/green-tick": "MANAGER", "/app/team": "MANAGER",
  "/app/inbox/settings": "MANAGER", "/app/payments": "AGENT",
}
