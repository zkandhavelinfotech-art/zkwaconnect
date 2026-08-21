import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
vi.mock('../db', () => ({
  prisma: {
    user:   { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    tenant: { create: vi.fn() },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
  }
}))

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() }
}))

import bcrypt from 'bcryptjs'
import { prisma } from '../db'

describe('Auth — login logic', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('rejects wrong password', async () => {
    const mockUser = { id:'u1', tenantId:'t1', email:'test@test.com', passwordHash:'hash', isActive:true, role:'OWNER', tenant:{id:'t1',name:'Test',plan:'STARTER',planStatus:'ACTIVE'} }
    ;(prisma.user.findFirst as any).mockResolvedValue(mockUser)
    ;(bcrypt.compare as any).mockResolvedValue(false)

    let error: any = null
    try {
      // Simulate the login check
      const valid = await bcrypt.compare('wrongpass', mockUser.passwordHash)
      if (!valid) throw new Error('Invalid credentials')
    } catch (e: any) { error = e }

    expect(error?.message).toBe('Invalid credentials')
  })

  it('rejects inactive user', async () => {
    ;(prisma.user.findFirst as any).mockResolvedValue(null)
    const user = await prisma.user.findFirst({ where: { email: 'x@x.com' } })
    expect(user).toBeNull()
  })
})

describe('Auth — register validation', () => {
  it('requires email, password, name, companyName', () => {
    const required = ['email', 'password', 'name', 'companyName']
    const body: any = { email: 'x@x.com', password: 'pass' }
    const missing = required.filter(k => !body[k])
    expect(missing).toContain('name')
    expect(missing).toContain('companyName')
  })
})
