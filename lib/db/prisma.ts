import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { mockAdapterFactory } from "@prisma/driver-adapter-utils"
import { PrismaClient } from "@/generated/prisma/client"

const connectionString = (process.env.DATABASE_URL || "").trim()

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

/**
 * Parses any MySQL or MariaDB URL into a structured pool configuration object.
 * Passing an object directly to PrismaMariaDb completely bypasses MariaDB's
 * connection string URL parser, preventing 'error parsing connection string, format must be mariadb://...'
 */
function parseMySqlConfig(rawUrl: string) {
  let urlStr = rawUrl.trim()
  if (urlStr.startsWith("mysql://")) {
    urlStr = "mariadb://" + urlStr.slice("mysql://".length)
  }

  try {
    const u = new URL(urlStr)
    return {
      host: u.hostname || "127.0.0.1",
      port: u.port ? parseInt(u.port, 10) : 3306,
      user: u.username ? decodeURIComponent(u.username) : "root",
      password: u.password ? decodeURIComponent(u.password) : undefined,
      database: u.pathname ? u.pathname.replace(/^\//, "") : undefined,
      connectionLimit: 10,
      prepareCacheLength: 0,
      connectTimeout: 15000,
    }
  } catch {
    // If password contained unencoded '@' or characters that broke URL parsing, extract safely
    const withoutProto = urlStr.replace(/^(mariadb|mysql):\/\//, "")
    const lastAt = withoutProto.lastIndexOf("@")
    if (lastAt !== -1) {
      const auth = withoutProto.slice(0, lastAt)
      const rest = withoutProto.slice(lastAt + 1)
      const firstColon = auth.indexOf(":")
      const user = firstColon !== -1 ? auth.slice(0, firstColon) : auth
      const pass = firstColon !== -1 ? auth.slice(firstColon + 1) : undefined
      const [hostPort, dbQuery] = rest.split("/")
      const [host, port] = (hostPort || "").split(":")
      const [db] = (dbQuery || "").split("?")
      return {
        host: host || "127.0.0.1",
        port: port ? parseInt(port, 10) : 3306,
        user: user || "root",
        password: pass,
        database: db || undefined,
        connectionLimit: 10,
        prepareCacheLength: 0,
        connectTimeout: 15000,
      }
    }
    return { host: "127.0.0.1", port: 3306 }
  }
}

function makeClient(): PrismaClient {
  const url = connectionString
  const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://")
  const isMysql = url.startsWith("mysql://") || url.startsWith("mariadb://")

  if (isPostgres) {
    try {
      const adapter = new PrismaPg({ connectionString: url })
      return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      })
    } catch {
      // Fallback if Postgres adapter cannot connect or schema is MySQL
    }
  }

  if (isMysql) {
    try {
      const poolConfig = parseMySqlConfig(url)
      const adapter = new PrismaMariaDb(poolConfig)
      return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      })
    } catch {
      // Fallback if MySQL adapter cannot connect or schema is Postgres
    }
  }

  // Safe fallback for Next.js build-time page collection or environments without active DB
  try {
    const mockAdapter = mockAdapterFactory(isMysql ? "mysql" : "postgres")
    return new PrismaClient({
      adapter: mockAdapter as any,
      log: ["error"],
    })
  } catch {
    // If mock fails, fallback to default MariaDb adapter stub
    const fallbackAdapter = new PrismaMariaDb({ host: "127.0.0.1", port: 3306, database: "zkwaconnect" })
    return new PrismaClient({
      adapter: fallbackAdapter,
      log: ["error"],
    })
  }
}

export const prisma = globalForPrisma.prisma ?? makeClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

