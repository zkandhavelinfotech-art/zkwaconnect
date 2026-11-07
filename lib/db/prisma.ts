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

  let host = "127.0.0.1"
  let port = 3306
  let user = "root"
  let password: string | undefined
  let database: string | undefined
  let socketPath: string | undefined

  try {
    const u = new URL(urlStr)
    const rawHost = u.hostname || "127.0.0.1"
    host = rawHost === "localhost" ? "127.0.0.1" : rawHost
    port = u.port ? parseInt(u.port, 10) : 3306
    user = u.username ? decodeURIComponent(u.username) : "root"
    password = u.password ? decodeURIComponent(u.password) : undefined
    database = u.pathname ? u.pathname.replace(/^\//, "") : undefined

    if (u.searchParams.has("socket")) socketPath = u.searchParams.get("socket")!
    if (u.searchParams.has("socketPath")) socketPath = u.searchParams.get("socketPath")!
  } catch {
    // If password contained unencoded '@' or characters that broke URL parsing, extract safely
    const withoutProto = urlStr.replace(/^(mariadb|mysql):\/\//, "")
    const lastAt = withoutProto.lastIndexOf("@")
    if (lastAt !== -1) {
      const auth = withoutProto.slice(0, lastAt)
      const rest = withoutProto.slice(lastAt + 1)
      const firstColon = auth.indexOf(":")
      user = firstColon !== -1 ? auth.slice(0, firstColon) : auth
      password = firstColon !== -1 ? auth.slice(firstColon + 1) : undefined
      const [hostPort, dbQuery] = rest.split("/")
      const [rawHost, rawPort] = (hostPort || "").split(":")
      host = (rawHost === "localhost" ? "127.0.0.1" : rawHost) || "127.0.0.1"
      port = rawPort ? parseInt(rawPort, 10) : 3306
      const [db, query] = (dbQuery || "").split("?")
      database = db || undefined

      if (query) {
        const sp = new URLSearchParams(query)
        if (sp.has("socket")) socketPath = sp.get("socket")!
        if (sp.has("socketPath")) socketPath = sp.get("socketPath")!
      }
    }
  }

  const config: any = {
    user,
    password,
    database,
    connectionLimit: 15,
    prepareCacheLength: 0,
    connectTimeout: 10000,
    acquireTimeout: 15000,
  }

  if (socketPath) {
    config.socketPath = socketPath
  } else {
    config.host = host
    config.port = port
  }

  return config
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

