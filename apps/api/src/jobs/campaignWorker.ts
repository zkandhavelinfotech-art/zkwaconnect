import { Worker, Queue, Job } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import { sendTemplateMessage } from '../services/whatsapp'

const prisma = new PrismaClient()
const REDIS  = { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') }

export const campaignQueue = new Queue('campaign-send', { connection: REDIS })

// WhatsApp tier limits (messages/day)
// Tier 1: 1,000 | Tier 2: 10,000 | Tier 3: 100,000
function getThrottleDelayMs(tierLimit: number): number {
  if (tierLimit <= 1000)   return 90    // ~1,000/day = ~1 per 86.4s, allow 90ms burst
  if (tierLimit <= 10000)  return 10    // ~10,000/day
  return 2                              // ~100,000/day
}

async function processCampaignJob(job: Job) {
  const { campaignId, contactPhone, wabaId, templateName, languageCode, components } = job.data
  const waba = await prisma.wABAAccount.findUnique({ where: { id: wabaId } })
  if (!waba?.isActive) throw new Error('WABA account not found or inactive')

  // Throttle based on tier limit
  const delayMs = getThrottleDelayMs(waba.tierLimit)
  await new Promise(resolve => setTimeout(resolve, delayMs))

  await sendTemplateMessage(
    waba.phoneId, waba.accessToken, contactPhone,
    templateName, languageCode, components, waba.apiVersion
  )

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { sentCount: { increment: 1 }, deliveredCount: { increment: 1 } },
  })
}

const worker = new Worker('campaign-send', processCampaignJob, {
  connection:  REDIS,
  concurrency: 3,
  limiter: { max: 100, duration: 1000 },  // max 100 jobs/sec globally
})

worker.on('completed', (job) => console.log(`[Worker] Job ${job.id} done`))
worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`)
  prisma.campaign.update({ where: { id: job?.data?.campaignId }, data: { failedCount: { increment: 1 } } }).catch(() => {})
})

console.log('🚀 Campaign worker started')
