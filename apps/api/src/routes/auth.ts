import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../db'

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/register
  app.post('/register', async (req, reply) => {
    const { email, password, name, companyName, plan = 'STARTER', state, gstin } = req.body as any
    if (!email || !password || !name || !companyName)
      return reply.status(400).send({ success: false, error: 'email, password, name, companyName required' })

    const existing = await prisma.user.findFirst({ where: { email } })
    if (existing) return reply.status(409).send({ success: false, error: 'Email already registered' })

    const slug         = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
    const passwordHash = await bcrypt.hash(password, 12)
    const trialEndsAt  = new Date(Date.now() + 14 * 86400 * 1000)

    const tenant = await prisma.tenant.create({
      data: { name: companyName, slug: `${slug}-${Date.now()}`, plan, planStatus: 'TRIAL', state, gstin, messagesLimit: plan === 'GROWTH' ? 10000 : 1000, trialEndsAt },
    })
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email, name, passwordHash, role: 'OWNER' },
    })

    const accessToken  = app.jwt.sign({ uid: user.id, tid: tenant.id, role: user.role }, { expiresIn: '15m' })
    const refreshToken = app.jwt.sign({ uid: user.id, tid: tenant.id, type: 'refresh' }, { expiresIn: '30d' })

    await prisma.refreshToken.create({ data: { userId: user.id, token: refreshToken, expiresAt: new Date(Date.now() + 30 * 86400 * 1000) } })

    return reply.status(201).send({ success: true, data: { accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role }, tenant: { id: tenant.id, name: tenant.name, plan: tenant.plan, planStatus: tenant.planStatus } } })
  })

  // POST /auth/login
  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const { email, password } = req.body as any
    if (!email || !password) return reply.status(400).send({ success: false, error: 'email and password required' })

    const user = await prisma.user.findFirst({ where: { email }, include: { tenant: true } })
    if (!user || !user.isActive) return reply.status(401).send({ success: false, error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Invalid credentials' })

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    const accessToken  = app.jwt.sign({ uid: user.id, tid: user.tenantId, role: user.role }, { expiresIn: '15m' })
    const refreshToken = app.jwt.sign({ uid: user.id, tid: user.tenantId, type: 'refresh' }, { expiresIn: '30d' })
    await prisma.refreshToken.create({ data: { userId: user.id, token: refreshToken, expiresAt: new Date(Date.now() + 30 * 86400 * 1000) } })

    return { success: true, data: { accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role }, tenant: { id: user.tenant.id, name: user.tenant.name, plan: user.tenant.plan, planStatus: user.tenant.planStatus, messagesLimit: user.tenant.messagesLimit, messagesSent: user.tenant.messagesSent, walletBalance: user.tenant.walletBalance } } }
  })

  // POST /auth/refresh
  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = req.body as any
    if (!refreshToken) return reply.status(400).send({ success: false, error: 'refreshToken required' })

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { user: true } })
    if (!stored || stored.expiresAt < new Date()) return reply.status(401).send({ success: false, error: 'Invalid or expired refresh token' })

    const accessToken = app.jwt.sign({ uid: stored.userId, tid: stored.user.tenantId, role: stored.user.role }, { expiresIn: '15m' })
    return { success: true, data: { accessToken } }
  })

  // GET /auth/me
  app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
    const { uid, tid } = req.user as any
    const user   = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, name: true, email: true, role: true, phone: true, avatarUrl: true, lastLoginAt: true } })
    const tenant = await prisma.tenant.findUnique({ where: { id: tid }, select: { id: true, name: true, plan: true, planStatus: true, messagesLimit: true, messagesSent: true, walletBalance: true, gstin: true, state: true, trialEndsAt: true } })
    return { success: true, data: { user, tenant } }
  })

  // POST /auth/logout
  app.post('/logout', { onRequest: [app.authenticate] }, async (req) => {
    const { refreshToken } = req.body as any
    if (refreshToken) await prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
    return { success: true }
  })

  // POST /auth/change-password
  app.post('/change-password', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body as any
    const { uid } = req.user as any
    if (!currentPassword || !newPassword) return reply.status(400).send({ success: false, error: 'currentPassword and newPassword required' })

    const user = await prisma.user.findUnique({ where: { id: uid } })
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Current password is incorrect' })

    const hash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: uid }, data: { passwordHash: hash } })
    await prisma.refreshToken.deleteMany({ where: { userId: uid } })

    return { success: true, message: 'Password changed. Please log in again.' }
  })

  // ── 2FA Endpoints ─────────────────────────────────────────

  // POST /auth/2fa/enable — generate TOTP secret, return QR
  app.post('/2fa/enable', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { uid } = req.user as any
    const user    = await prisma.user.findUnique({ where: { id: uid }, select: { email: true, twoFAEnabled: true } })
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })
    if (user.twoFAEnabled) return reply.status(400).send({ success: false, error: '2FA already enabled' })

    // Generate secret using speakeasy-compatible base32
    const { randomBytes } = await import('crypto')
    const secret = randomBytes(20).toString('hex').toUpperCase().substring(0, 32)

    await prisma.user.update({ where: { id: uid }, data: { twoFASecret: secret } })

    const otpAuthUrl = `otpauth://totp/ZKWAConnect:${encodeURIComponent(user.email)}?secret=${secret}&issuer=ZKWAConnect`
    return { success: true, data: { secret, otpAuthUrl, message: 'Scan QR in Google Authenticator, then call /auth/2fa/verify to activate' } }
  })

  // POST /auth/2fa/verify — verify TOTP code and enable 2FA
  app.post('/2fa/verify', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { uid } = req.user as any
    const { code } = req.body as any
    if (!code) return reply.status(400).send({ success: false, error: 'code required' })

    const user = await prisma.user.findUnique({ where: { id: uid }, select: { twoFASecret: true, twoFAEnabled: true } })
    if (!user?.twoFASecret) return reply.status(400).send({ success: false, error: 'Call /auth/2fa/enable first' })

    // TOTP verification (time-based, 30s window)
    const { createHmac } = await import('crypto')
    const epoch   = Math.floor(Date.now() / 1000)
    const windows = [-1, 0, 1]  // allow ±30s drift
    let valid      = false
    for (const w of windows) {
      const counter = Math.floor((epoch + w * 30) / 30)
      const buf     = Buffer.alloc(8)
      buf.writeBigInt64BE(BigInt(counter))
      const hmac = createHmac('sha1', Buffer.from(user.twoFASecret, 'base32' as any)).update(buf).digest()
      const offset = hmac[19] & 0xf
      const otp    = (((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)) % 1000000
      if (String(otp).padStart(6, '0') === String(code).padStart(6, '0')) { valid = true; break }
    }
    if (!valid) return reply.status(401).send({ success: false, error: 'Invalid 2FA code' })

    await prisma.user.update({ where: { id: uid }, data: { twoFAEnabled: true } })
    return { success: true, message: '2FA enabled successfully' }
  })

  // POST /auth/2fa/disable
  app.post('/2fa/disable', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { uid } = req.user as any
    const { password } = req.body as any
    if (!password) return reply.status(400).send({ success: false, error: 'password required' })

    const user = await prisma.user.findUnique({ where: { id: uid } })
    if (!user) return reply.status(404).send({ success: false, error: 'Not found' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Invalid password' })

    await prisma.user.update({ where: { id: uid }, data: { twoFAEnabled: false, twoFASecret: null } })
    return { success: true, message: '2FA disabled' }
  })

}
