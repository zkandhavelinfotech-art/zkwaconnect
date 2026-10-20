import "dotenv/config"
import bcrypt           from "bcryptjs"
import { PrismaPg }    from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma/client"

const connectionString = process.env.DATABASE_URL ?? ""
if (!connectionString) throw new Error("DATABASE_URL not set")

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

async function main() {
  console.log("\n==============================================")
  console.log("🌱 ZKWAConnect v4.0.6 — Seeding database")
  console.log("==============================================\n")

  // Plans
  const plans = [
    { name:"Starter",      slug:"starter",      monthlyPrice:999,  annualPrice:9990,   maxUsers:3,   maxPhoneNumbers:1,  maxMessages:1000   },
    { name:"Business",     slug:"business",     monthlyPrice:2499, annualPrice:24990,  maxUsers:10,  maxPhoneNumbers:3,  maxMessages:10000  },
    { name:"Professional", slug:"professional", monthlyPrice:4999, annualPrice:49990,  maxUsers:25,  maxPhoneNumbers:10, maxMessages:50000  },
    { name:"Enterprise",   slug:"enterprise",   monthlyPrice:9999, annualPrice:99990,  maxUsers:100, maxPhoneNumbers:25, maxMessages:100000 },
  ]
  for (const p of plans) {
    await prisma.plan.upsert({ where:{ slug:p.slug }, update:{}, create: p })
    console.log(`  ✅ Plan: ${p.name} (₹${p.monthlyPrice}/mo)`)
  }

  // Demo user + org
  const demoUser = await prisma.user.upsert({
    where:  { email:"demo@zkwaconnect.in" },
    update: {},
    create: { email:"demo@zkwaconnect.in", name:"Demo User",
      passwordHash: await bcrypt.hash("demo1234",12), status:"ACTIVE" },
  })
  console.log(`  ✅ Demo user: ${demoUser.email}`)

  const demoOrg = await prisma.organization.upsert({
    where:  { slug:"demo-org" },
    update: {},
    create: { name:"Demo Business", slug:"demo-org",
      country:"IN", timezone:"Asia/Kolkata", currency:"INR", status:"TRIAL" },
  })
  console.log(`  ✅ Demo org: ${demoOrg.name}`)

  await prisma.membership.upsert({
    where:  { organizationId_userId:{ organizationId:demoOrg.id, userId:demoUser.id } },
    update: {},
    create: { organizationId:demoOrg.id, userId:demoUser.id, role:"OWNER", status:"ACTIVE" },
  })
  await prisma.onboarding.upsert({
    where:  { organizationId:demoOrg.id },
    update: {},
    create: { organizationId:demoOrg.id, currentStep:"NOT_STARTED", status:"NOT_STARTED" },
  })

  const starter = await prisma.plan.findUnique({ where:{ slug:"starter" } })
  if (starter) {
    const subId = `sub_demo_${demoOrg.id.slice(0,8)}`
    await prisma.subscription.upsert({
      where:  { id:subId },
      update: {},
      create: { id:subId, organizationId:demoOrg.id, planId:starter.id,
        status:"TRIAL", startDate:new Date(),
        trialEndsAt:new Date(Date.now()+14*86_400_000),
        currentPeriodStart:new Date(), currentPeriodEnd:new Date(Date.now()+14*86_400_000) },
    })
    console.log("  ✅ Demo subscription: Starter TRIAL (14 days)")
  }

  // Admin user
  const adminUser = await prisma.user.upsert({
    where:  { email:"admin@zkwaconnect.in" },
    update: {},
    create: { email:"admin@zkwaconnect.in", name:"ZK Admin",
      passwordHash: await bcrypt.hash("admin2026!",12),
      status:"ACTIVE", adminRole:"SUPER_ADMIN" },
  })
  console.log(`  ✅ Admin user: ${adminUser.email}`)

  console.log("\n==============================================")
  console.log("🎉 SEED COMPLETE")
  console.log("==============================================")
  console.log("  Customer : demo@zkwaconnect.in  / demo1234")
  console.log("  Admin    : admin@zkwaconnect.in / admin2026!")
  console.log("==============================================\n")
}

main()
  .catch(e => { console.error("❌ Seed failed:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
