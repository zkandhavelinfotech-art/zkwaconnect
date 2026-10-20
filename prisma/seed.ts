import { randomBytes } from "node:crypto"
import "dotenv/config"
import { DEFAULT_PLAN_FEATURES, toFeatureJson } from "../lib/billing/features"
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
    { name:"Free",         slug:"free",         monthlyPrice:0,    annualPrice:0,      maxUsers:1,   maxPhoneNumbers:1,  maxMessages:250    },
    { name:"Starter",      slug:"starter",      monthlyPrice:999,  annualPrice:9990,   maxUsers:3,   maxPhoneNumbers:1,  maxMessages:1000   },
    { name:"Business",     slug:"business",     monthlyPrice:2499, annualPrice:24990,  maxUsers:10,  maxPhoneNumbers:3,  maxMessages:10000  },
    { name:"Professional", slug:"professional", monthlyPrice:4999, annualPrice:49990,  maxUsers:25,  maxPhoneNumbers:10, maxMessages:50000  },
    { name:"Enterprise",   slug:"enterprise",   monthlyPrice:9999, annualPrice:99990,  maxUsers:100, maxPhoneNumbers:25, maxMessages:100000 },
  ]
  for (const p of plans) {
    await prisma.plan.upsert({ where:{ slug:p.slug }, update:{},
      create: { ...p, features: toFeatureJson(DEFAULT_PLAN_FEATURES[p.slug] || []), isPopular: p.slug === "business" } })
    console.log(`  ✅ Plan: ${p.name} (₹${p.monthlyPrice}/mo)`)
  }

  // Demo account: local development only (or SEED_DEMO=on). Never on the live site by default.
  const production = process.env.NODE_ENV === "production"
  if (process.env.SEED_DEMO === "on" || (!production && process.env.SEED_DEMO !== "off")) {
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
          trialEndsAt:new Date(Date.now()+7*86_400_000),
          currentPeriodStart:new Date(), currentPeriodEnd:new Date(Date.now()+7*86_400_000) },
      })
      console.log("  ✅ Demo subscription: Starter TRIAL (7 days)")
    }
  }

  // Admin user
  // Live: set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, otherwise a random password is generated and printed once.
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@zkwaconnect.in").toLowerCase()
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (production ? randomBytes(12).toString("base64url") : "admin2026!")
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } })
  const adminUser = await prisma.user.upsert({
    where:  { email:adminEmail },
    update: {},
    create: { email:adminEmail, name:"ZK Admin",
      passwordHash: await bcrypt.hash(adminPassword,12),
      status:"ACTIVE", adminRole:"SUPER_ADMIN" },
  })
  console.log(`  ✅ Admin user: ${adminUser.email}`)

  console.log("\n==============================================")
  console.log("🎉 SEED COMPLETE")
  console.log("==============================================")
  if (!production) console.log("  Customer : demo@zkwaconnect.in  / demo1234")
  console.log(`  Admin    : ${adminEmail} / ${existingAdmin ? "(existing account — password unchanged)" : adminPassword}`)
  console.log("==============================================\n")
}

main()
  .catch(e => { console.error("❌ Seed failed:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
