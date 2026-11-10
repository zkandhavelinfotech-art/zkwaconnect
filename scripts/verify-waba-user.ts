import { prisma } from "../lib/db/prisma"
import bcrypt from "bcryptjs"

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, passwordHash: true } })
  console.log("Found users in DB:", users.map(u => u.email))
  
  let waba = users.find(u => u.email.toLowerCase().includes("waba"))
  if (!waba) {
    console.log("WABA user not found. Creating waba@zkandavelinfotech.com...")
    const hash = await bcrypt.hash("waba1234", 12)
    waba = await prisma.user.create({
      data: {
        email: "waba@zkandavelinfotech.com",
        name: "ZKandavel WABA Admin",
        passwordHash: hash,
        status: "ACTIVE",
        adminRole: "SUPER_ADMIN",
      }
    })
    console.log("Created user:", waba.email)
  } else {
    console.log("Found WABA user:", waba.email)
    const match = await bcrypt.compare("waba1234", waba.passwordHash || "")
    console.log("Does password 'waba1234' match stored hash?", match)
    if (!match) {
      console.log("Updating password hash to 'waba1234'...")
      const hash = await bcrypt.hash("waba1234", 12)
      await prisma.user.update({
        where: { id: waba.id },
        data: { passwordHash: hash, status: "ACTIVE" }
      })
      console.log("Password hash successfully updated!")
    }
  }

  // Ensure organization and membership exist
  let org = await prisma.organization.findFirst({
    where: { OR: [{ slug: "zkandavel-infotech" }, { name: { contains: "ZKandhavel" } }] }
  })
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "ZKandhavel Infotech",
        slug: "zkandavel-infotech",
        email: waba.email,
        billingExempt: true,
        country: "IN",
        timezone: "Asia/Kolkata",
        currency: "INR",
        status: "ACTIVE",
      }
    })
    console.log("Created Org:", org.name)
  }

  const membership = await prisma.membership.findFirst({
    where: { organizationId: org.id, userId: waba.id }
  })
  if (!membership) {
    await prisma.membership.create({
      data: {
        organizationId: org.id,
        userId: waba.id,
        role: "OWNER",
        status: "ACTIVE",
      }
    })
    console.log("Created membership for WABA user in", org.name)
  } else if (membership.status !== "ACTIVE") {
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: "ACTIVE" }
    })
    console.log("Activated membership for WABA user")
  }

  console.log("ALL DONE! waba@zkandavelinfotech.com / waba1234 is ready for login.")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

