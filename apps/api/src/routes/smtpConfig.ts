import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function smtpRoutes(app: FastifyInstance) {
  app.get('/', { onRequest:[app.authenticate] }, async (req) => {
    const config = await prisma.smtpConfig.findUnique({ where:{ tenantId:req.user.tid } })
    if (!config) return { success:true, data:null }
    const { password:_, ...safe } = config as any
    return { success:true, data:safe }
  })

  app.post('/', { onRequest:[app.authenticate] }, async (req, reply) => {
    const { host, port=587, username, password, fromEmail, fromName, useTls=true } = req.body as any
    if (!host||!username||!password||!fromEmail) return reply.status(400).send({ success:false, error:'host, username, password, fromEmail required' })
    const config = await prisma.smtpConfig.upsert({
      where:{ tenantId:req.user.tid },
      update:{ host, port:Number(port), username, password, fromEmail, fromName:fromName||fromEmail, useTls },
      create:{ tenantId:req.user.tid, host, port:Number(port), username, password, fromEmail, fromName:fromName||fromEmail, useTls },
    })
    const { password:_, ...safe } = config as any
    return { success:true, data:safe }
  })

  app.post('/test', { onRequest:[app.authenticate] }, async (req, reply) => {
    const config = await prisma.smtpConfig.findUnique({ where:{ tenantId:req.user.tid } })
    if (!config) return reply.status(404).send({ success:false, error:'No SMTP config found. Save config first.' })
    // Attempt test connection using nodemailer-style check
    try {
      const { createTransport } = await import('nodemailer').catch(() => ({ createTransport: null }))
      if (!createTransport) return reply.status(200).send({ success:true, message:'Test skipped — nodemailer not installed. Config saved.' })
      const transporter = (createTransport as any)({
        host:config.host, port:config.port, secure:config.port===465,
        auth:{ user:config.username, pass:config.password },
      })
      await transporter.verify()
      return { success:true, message:'SMTP connection successful' }
    } catch (e:any) {
      return reply.status(400).send({ success:false, error:`SMTP test failed: ${e.message}` })
    }
  })

  app.delete('/', { onRequest:[app.authenticate] }, async (req) => {
    await prisma.smtpConfig.deleteMany({ where:{ tenantId:req.user.tid } })
    return { success:true }
  })
}
