import bcrypt from "bcryptjs"
import { prisma } from "../lib/db/prisma"

async function main() {
  console.log("==================================================")
  console.log("🚀 Setting up Customer & Admin Logins")
  console.log("==================================================\n")

  const starterPlan = await prisma.plan.findFirst({ where: { slug: "business" } }) || await prisma.plan.findFirst({ where: { slug: "starter" } })

  // 1. RECRUITMENT TRAINING ACADEMY
  console.log("1. Setting up Recruitment Training Academy (Client Portal)...")
  let rtaOrg = await prisma.organization.findFirst({
    where: { slug: "recruitment-training-academy" },
  })
  if (!rtaOrg) {
    rtaOrg = await prisma.organization.create({
      data: {
        name: "Recruitment Training Academy",
        slug: "recruitment-training-academy",
        country: "IN",
        currency: "INR",
        status: "ACTIVE",
      },
    })
  }

  // Ensure Onboarding
  await prisma.onboarding.upsert({
    where: { organizationId: rtaOrg.id },
    update: { currentStep: "COMPLETED", status: "COMPLETED" },
    create: { organizationId: rtaOrg.id, currentStep: "COMPLETED", status: "COMPLETED" },
  })

  // Ensure Active Subscription
  if (starterPlan) {
    const subId = `sub_rta_${rtaOrg.id.slice(0, 8)}`
    await prisma.subscription.upsert({
      where: { id: subId },
      update: { status: "ACTIVE", planId: starterPlan.id },
      create: {
        id: subId,
        organizationId: rtaOrg.id,
        planId: starterPlan.id,
        status: "ACTIVE",
        startDate: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    })
  }

  const rtaPasswordHash = await bcrypt.hash("rta1234", 12)
  const rtaEmails = ["rta@recruitmentacademy.com", "rta@gmail.com"]
  for (const email of rtaEmails) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash: rtaPasswordHash,
        status: "ACTIVE",
        name: "RTA Administrator",
      },
      create: {
        email,
        name: "RTA Administrator",
        passwordHash: rtaPasswordHash,
        status: "ACTIVE",
        adminRole: "NONE",
      },
    })

    await prisma.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: rtaOrg.id,
          userId: user.id,
        },
      },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        organizationId: rtaOrg.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    })
    console.log(`  ✅ RTA Client User: ${email} / rta1234 -> Workspace: ${rtaOrg.name}`)
  }

  // 2. SMERAM INDUSTRIES
  console.log("\n2. Setting up Smeram Industries (Client Portal)...")
  let smeramOrg = await prisma.organization.findFirst({
    where: { slug: "smeram-industries" },
  })
  if (!smeramOrg) {
    smeramOrg = await prisma.organization.create({
      data: {
        name: "Smeram Industries",
        slug: "smeram-industries",
        country: "IN",
        currency: "INR",
        status: "ACTIVE",
      },
    })
  }

  // Ensure Onboarding
  await prisma.onboarding.upsert({
    where: { organizationId: smeramOrg.id },
    update: { currentStep: "COMPLETED", status: "COMPLETED" },
    create: { organizationId: smeramOrg.id, currentStep: "COMPLETED", status: "COMPLETED" },
  })

  // Ensure Active Subscription
  if (starterPlan) {
    const subId = `sub_smeram_${smeramOrg.id.slice(0, 8)}`
    await prisma.subscription.upsert({
      where: { id: subId },
      update: { status: "ACTIVE", planId: starterPlan.id },
      create: {
        id: subId,
        organizationId: smeramOrg.id,
        planId: starterPlan.id,
        status: "ACTIVE",
        startDate: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    })
  }

  const smeramPasswordHash = await bcrypt.hash("smeram1234", 12)
  const smeramEmails = ["smeram@smeramindustries.com", "smeram@gmail.com"]
  for (const email of smeramEmails) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash: smeramPasswordHash,
        status: "ACTIVE",
        name: "Smeram Admin",
      },
      create: {
        email,
        name: "Smeram Admin",
        passwordHash: smeramPasswordHash,
        status: "ACTIVE",
        adminRole: "NONE",
      },
    })

    await prisma.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: smeramOrg.id,
          userId: user.id,
        },
      },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        organizationId: smeramOrg.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    })
    console.log(`  ✅ Smeram Client User: ${email} / smeram1234 -> Workspace: ${smeramOrg.name}`)
  }

  // 3. SAAS PRODUCT ADMIN LOGIN
  console.log("\n3. Setting up SaaS Product Admin...")
  const adminPasswordHash = await bcrypt.hash("admin2026!", 12)
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@zkwaconnect.in" },
    update: {
      passwordHash: adminPasswordHash,
      status: "ACTIVE",
      name: "ZK Admin",
      adminRole: "SUPER_ADMIN",
    },
    create: {
      email: "admin@zkwaconnect.in",
      name: "ZK Admin",
      passwordHash: adminPasswordHash,
      status: "ACTIVE",
      adminRole: "SUPER_ADMIN",
    },
  })

  // Ensure Admin has membership in an organization so they can test both /admin and /app
  const rootOrg = await prisma.organization.findFirst({
    where: { slug: "zkandavel-infotech" },
  }) || rtaOrg

  if (rootOrg) {
    await prisma.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: rootOrg.id,
          userId: adminUser.id,
        },
      },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        organizationId: rootOrg.id,
        userId: adminUser.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    })
  }
  console.log(`  ✅ SaaS Product Admin: admin@zkwaconnect.in / admin2026! (SUPER_ADMIN)`)

  // 4. WABA ACCOUNT
  const wabaPasswordHash = await bcrypt.hash("waba1234", 12)
  await prisma.user.upsert({
    where: { email: "waba@zkandavelinfotech.com" },
    update: {
      passwordHash: wabaPasswordHash,
      status: "ACTIVE",
      adminRole: "SUPER_ADMIN",
    },
    create: {
      email: "waba@zkandavelinfotech.com",
      name: "ZKandavel WABA Admin",
      passwordHash: wabaPasswordHash,
      status: "ACTIVE",
      adminRole: "SUPER_ADMIN",
    },
  })
  console.log(`  ✅ WABA Root Admin: waba@zkandavelinfotech.com / waba1234`)

  console.log("\n==================================================")
  console.log("🎉 All Logins Configured Successfully!")
  console.log("==================================================")
}

main()
  .catch((e) => {
    console.error("Setup error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

