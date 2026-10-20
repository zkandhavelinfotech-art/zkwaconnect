import { tickCampaigns } from "./worker"
import { deliverWebhooks } from "@/lib/developer/webhooks"
import { resumeDueDelays } from "@/lib/flows/engine"
import { sendDueCartReminders } from "@/lib/integrations/store"
import { sendPlanReminders } from "@/lib/billing/reminders"

// One pass of all background jobs; true when any of them had work.
async function tickAll() {
  const [, campaigns, webhooks, delays, carts] = await Promise.all([
    // Hourly at most; never counts as "busy".
    sendPlanReminders().catch(error => { console.error("[billing] plan reminders failed", error); return 0 }).then(() => false),
    tickCampaigns().catch(error => { console.error("[campaigns] tick failed", error); return false }),
    deliverWebhooks().catch(error => { console.error("[webhooks] delivery failed", error); return 0 }),
    resumeDueDelays().catch(error => { console.error("[flows] delay resume failed", error); return 0 }),
    sendDueCartReminders().catch(error => { console.error("[stores] cart reminders failed", error); return 0 }),
  ])
  return campaigns || webhooks > 0 || delays > 0 || carts > 0
}

type WorkerState = { started: boolean; busy: boolean }
const state = ((globalThis as { __zkCampaignWorker?: WorkerState }).__zkCampaignWorker ??= { started: false, busy: false })

// Runs background jobs (broadcast sender, webhook deliveries, flow delays) inside this server process: about once a second while there is work,
// every 5 seconds when idle. Set CAMPAIGN_WORKER=off to disable (e.g. when /api/cron/campaigns is used instead).
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
    setTimeout(loop, busy ? Math.max(200, 1000 - (Date.now() - begin)) : 5000)
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
