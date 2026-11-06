import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is not set in .env")

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function makeClient() {
  const url = connectionString as string
  const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://")

  if (isPostgres) {
    try {
      const adapter = new PrismaPg({ connectionString: url })
      return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      })
    } catch {
      return new (PrismaClient as any)({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      })
    }
  }

  // MySQL connection fallback
  return new (PrismaClient as any)({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? makeClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
