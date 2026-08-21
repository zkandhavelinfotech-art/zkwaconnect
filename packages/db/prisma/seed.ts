import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  const tenant = await prisma.tenant.upsert({
    where:  { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company', slug: 'demo-company',
      plan: 'GROWTH', planStatus: 'ACTIVE',
      state: 'Tamil Nadu', gstin: '33AABCD1234A1Z5',
      messagesLimit: 10000, walletBalance: 500,
    },
  })
  console.log('✅ Tenant:', tenant.name)

  const hash = await bcrypt.hash('demo1234', 12)
  await prisma.user.upsert({
    where:  { tenantId_email: { tenantId: tenant.id, email: 'demo@zkwaconnect.in' } },
    update: { passwordHash: hash, isActive: true },
    create: { tenantId: tenant.id, email: 'demo@zkwaconnect.in', name: 'Demo User', passwordHash: hash, role: 'OWNER', phone: '+919876543210' },
  })
  console.log('✅ User: demo@zkwaconnect.in / demo1234')

  await prisma.wABAAccount.upsert({
    where:  { tenantId_phoneId: { tenantId: tenant.id, phoneId: '1772994176759012' } },
    update: {},
    create: { tenantId: tenant.id, phoneId: '1772994176759012', wabaId: '106240309139059', phoneNumber: '+919876543210', displayName: 'Demo Business', nickname: 'Main Number', accessToken: 'demo_token_replace_with_real', apiVersion: 'v20.0', isActive: true },
  })
  console.log('✅ WABA account created')

  for (const c of [
    { phone: '+919876543001', name: 'Priya Sharma',  labels: ['customer','vip'] },
    { phone: '+919876543002', name: 'Rahul Kumar',   labels: ['lead'] },
    { phone: '+919876543003', name: 'Anita Singh',   labels: ['customer'] },
    { phone: '+919876543004', name: 'Vikram Patel',  labels: ['prospect'] },
    { phone: '+919876543005', name: 'Sunita Reddy',  labels: ['customer'] },
  ]) {
    await prisma.contact.upsert({
      where:  { tenantId_phone: { tenantId: tenant.id, phone: c.phone } },
      update: {},
      create: { tenantId: tenant.id, ...c, source: 'whatsapp', optedIn: true },
    })
  }
  console.log('✅ 5 contacts')

  await prisma.template.upsert({
    where:  { tenantId_name_language: { tenantId: tenant.id, name: 'order_confirmation', language: 'en' } },
    update: {},
    create: { tenantId: tenant.id, name: 'order_confirmation', category: 'UTILITY', language: 'en', status: 'APPROVED', bodyText: 'Hi {{1}}, your order #{{2}} confirmed!', components: [{ type:'BODY', text:'Hi {{1}}, your order #{{2}} confirmed!' }], usageCount: 248 },
  })
  console.log('✅ Template')

  for (const l of [
    { phone:'+919876543001', name:'Priya Sharma', category:'SERVICE_REQUEST' as const, stage:'CONTACTED' as const, priority:'high',   message:'AC not working',       smsSent:true,  autoReplySent:true  },
    { phone:'+919876543002', name:'Rahul Kumar',  category:'JOB_ENQUIRY' as const,    stage:'NEW' as const,       priority:'medium', message:'Looking for job',       smsSent:true,  autoReplySent:true  },
    { phone:'+919876543003', name:'Anita Singh',  category:'PRODUCT_ENQUIRY' as const,stage:'QUALIFIED' as const, priority:'high',   message:'Price for painting?',   smsSent:true,  autoReplySent:true  },
    { phone:'+919876543004', name:'Vikram Patel', category:'BILLING' as const,        stage:'NEW' as const,       priority:'low',    message:'Invoice not received',  smsSent:false, autoReplySent:true  },
    { phone:'+919876543005', name:'Sunita Reddy', category:'SUPPORT' as const,        stage:'WON' as const,       priority:'medium', message:'App not loading',       smsSent:true,  autoReplySent:true  },
  ]) {
    await prisma.lead.create({ data: { tenantId: tenant.id, ...l } }).catch(() => {})
  }
  console.log('✅ 5 leads')

  await prisma.invoice.create({
    data: { tenantId: tenant.id, invoiceNumber: 'ZKW/2025-26/0001', type: 'SUBSCRIPTION', plan: 'GROWTH', subtotal: 5999, cgst: 539.91, sgst: 539.91, igst: 0, total: 7078.82, tenantState: 'Tamil Nadu', status: 'PAID', paidAt: new Date(), periodStart: new Date(), periodEnd: new Date(Date.now() + 30*86400000) },
  }).catch(() => {})
  console.log('✅ Invoice')

  console.log('\n🎉 Seed complete! Login: demo@zkwaconnect.in / demo1234')
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
