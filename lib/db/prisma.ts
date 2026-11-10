import "dotenv/config"
import fs from "node:fs"
import { PrismaPg } from "@prisma/adapter-pg"
import { mockAdapterFactory } from "@prisma/driver-adapter-utils"
import { PrismaClient } from "@/generated/prisma/client"

let PrismaMariaDb: any = null
try {
  const pkg = "@prisma/adapter-mariadb"
  // eslint-disable-next-line no-eval
  PrismaMariaDb = eval("require")(pkg).PrismaMariaDb
} catch {
  // Optional adapter for MySQL deployments
}

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
      user = firstColon !== -1 ? decodeURIComponent(auth.slice(0, firstColon)) : auth
      password = firstColon !== -1 ? decodeURIComponent(auth.slice(firstColon + 1)) : undefined
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

  // On Linux (cPanel / GoDaddy / cloud VPS), check if Unix socket exists when connecting to localhost
  if (!socketPath && process.platform === "linux" && (host === "127.0.0.1" || host === "localhost")) {
    const candidates = ["/var/lib/mysql/mysql.sock", "/var/run/mysqld/mysqld.sock", "/tmp/mysql.sock"]
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          socketPath = c
          break
        }
      } catch { /* ignore */ }
    }
  }

  const config: any = {
    user,
    password,
    database,
    connectionLimit: 15,
    prepareCacheLength: 0,
    connectTimeout: 8000,
    acquireTimeout: 10000,
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
    } catch (err: any) {
      if (err?.message?.includes("not compatible with the provider")) {
        console.error("❌ [Prisma Configuration Error] DATABASE_URL is PostgreSQL, but the generated client expects MySQL!")
        console.error("👉 Run 'npm run db:switch postgres && npm run db:generate' to synchronize.")
      } else {
        console.error("⚠️ [Prisma] Failed to initialize PostgreSQL adapter:", err?.message || err)
      }
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
    } catch (err: any) {
      if (err?.message?.includes("not compatible with the provider")) {
        console.error("❌ [Prisma Configuration Error] DATABASE_URL is MySQL, but the generated client expects PostgreSQL!")
        console.error("👉 Run 'npm run db:switch mysql && npm run db:generate' to synchronize.")
      } else {
        console.error("⚠️ [Prisma] Failed to initialize MySQL adapter:", err?.message || err)
      }
    }
  }

  // Safe mock fallback for Next.js build-time static page collection or when DB is not configured
  // We try mock adapters matching the client's expected provider without opening hanging TCP sockets
  try {
    const mockPg = mockAdapterFactory("postgres")
    return new PrismaClient({
      adapter: mockPg as any,
      log: ["error"],
    })
  } catch {
    try {
      const mockMysql = mockAdapterFactory("mysql")
      return new PrismaClient({
        adapter: mockMysql as any,
        log: ["error"],
      })
    } catch (e: any) {
      console.error("⚠️ [Prisma] Fallback mock client initialization failed:", e?.message || e)
      return new PrismaClient({
        log: ["error"],
      } as any)
    }
  }
}

export const prisma = globalForPrisma.prisma ?? makeClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

