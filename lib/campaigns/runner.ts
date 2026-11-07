import { tickCampaigns } from "./worker"
import { deliverWebhooks } from "@/lib/developer/webhooks"
import { resumeDueDelays } from "@/lib/flows/engine"
import { sendDueCartReminders } from "@/lib/integrations/store"
import { sendPlanReminders } from "@/lib/billing/reminders"

let consecutiveErrors = 0
let lastErrorLog = 0

function isDbConnectionError(err: any): boolean {
  const msg = String(err?.message || err || "")
  return msg.includes("pool timeout") ||
    msg.includes("45028") ||
    msg.includes("P1001") ||
    msg.includes("P2039") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("connect EACCES") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("Not implemented: queryRaw")
}

// One pass of all background jobs; true when any of them had work.
async function tickAll() {
  let dbErrorCaught = false

  const handleError = (context: string) => (error: any) => {
    if (isDbConnectionError(error)) {
      dbErrorCaught = true
      const now = Date.now()
      if (now - lastErrorLog > 30000) {
        console.warn(`[worker] Database connection currently unavailable during ${context}. Backing off...`)
        lastErrorLog = now
      }
    } else {
      console.error(`[${context}] tick failed`, error)
    }
    return 0
  }

  const [, campaigns, webhooks, delays, carts] = await Promise.all([
    // Hourly at most; never counts as "busy".
    sendPlanReminders().catch(handleError("billing")).then(() => false),
    tickCampaigns().catch(error => { handleError("campaigns")(error); return false }),
    deliverWebhooks().catch(handleError("webhooks")),
    resumeDueDelays().catch(handleError("flows")),
    sendDueCartReminders().catch(handleError("stores")),
  ])

  if (dbErrorCaught) {
    consecutiveErrors++
  } else if (consecutiveErrors > 0) {
    console.log("[worker] Database connection healthy. Worker loop resumed normal interval.")
    consecutiveErrors = 0
  }

  return Boolean(campaigns || (webhooks && webhooks > 0) || (delays && delays > 0) || (carts && carts > 0))
}

type WorkerState = { started: boolean; busy: boolean }
const state = ((globalThis as { __zkCampaignWorker?: WorkerState }).__zkCampaignWorker ??= { started: false, busy: false })

// Runs background jobs (broadcast sender, webhook deliveries, flow delays) inside this server process: about once a second while there is work,
// every 5 seconds when idle (or up to 45s backoff if database is unreachable). Set CAMPAIGN_WORKER=off to disable.
export function startCampaignWorker() {
  if (state.started || process.env.CAMPAIGN_WORKER === "off") return
  state.started = true
  const loop = async () => {
    const begin = Date.now()
    let busy = false
    if (!state.busy) {
      state.busy = true
      try { busy = await tickAll() } catch (error) { console.error("[jobs] worker tick failed", error) } finally { state.busy = false }
    }
    
    // Exponential backoff if DB connection has errors, otherwise normal 5000ms idle or 200-1000ms busy
    let nextDelay = 5000
    if (consecutiveErrors > 0) {
      nextDelay = Math.min(45000, 5000 * Math.pow(2, Math.min(consecutiveErrors, 3)))
    } else if (busy) {
      nextDelay = Math.max(200, 1000 - (Date.now() - begin))
    }

    setTimeout(loop, nextDelay)
  }
  setTimeout(loop, 3000)
  console.log("[campaigns] broadcast worker started")
}

// For cron-driven deployments: run ticks for up to `seconds`.
export async function runCampaignTicks(seconds: number) {
  const until = Date.now() + seconds * 1000
  let ticks = 0
  while (Date.now() < until) {
    const begin = Date.now()
    if (state.busy) break
    state.busy = true
    let busy = false
    try { busy = await tickAll() } finally { state.busy = false }
    ticks++
    if (!busy) break
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1000 - (Date.now() - begin))))
  }
  return ticks
}
