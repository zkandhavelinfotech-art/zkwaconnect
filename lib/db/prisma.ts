import "dotenv/config"
import { PrismaPg }     from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is not set in .env")

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function makeClient() {
  const adapter = new PrismaPg({ connectionString: connectionString! })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error","warn"] : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? makeClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
