#!/usr/bin/env node
import "dotenv/config"
import mariadb from "mariadb"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")

console.log("============================================================")
console.log("  ZKWAConnect v6 Database Connection Diagnostic Tool")
console.log("============================================================")

const rawUrl = (process.env.DATABASE_URL || "").trim()
if (!rawUrl) {
  console.error("❌ ERROR: DATABASE_URL is not defined in .env!")
  process.exit(1)
}

const isPostgres = rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://")
const isMysql = rawUrl.startsWith("mysql://") || rawUrl.startsWith("mariadb://")

console.log(`📡 Detected Provider: ${isMysql ? "MySQL / MariaDB" : isPostgres ? "PostgreSQL" : "Unknown"}`)

if (!isMysql) {
  console.log(`Raw URL: ${rawUrl.replace(/:([^:@]+)@/, ":****@")}`)
  console.log("This diagnostic tool is currently optimized for MySQL testing.")
  process.exit(0)
}

// Parse MySQL config
function parseConfig(urlStr) {
  let clean = urlStr
  if (clean.startsWith("mysql://")) clean = "mariadb://" + clean.slice(8)

  try {
    const u = new URL(clean)
    const rawHost = u.hostname || "127.0.0.1"
    const host = rawHost === "localhost" ? "127.0.0.1" : rawHost
    return {
      host,
      port: u.port ? parseInt(u.port, 10) : 3306,
      user: u.username ? decodeURIComponent(u.username) : "root",
      password: u.password ? decodeURIComponent(u.password) : "",
      database: u.pathname ? u.pathname.replace(/^\//, "") : "",
      connectTimeout: 5000,
    }
  } catch {
    const withoutProto = clean.replace(/^(mariadb|mysql):\/\//, "")
    const lastAt = withoutProto.lastIndexOf("@")
    if (lastAt !== -1) {
      const auth = withoutProto.slice(0, lastAt)
      const rest = withoutProto.slice(lastAt + 1)
      const firstColon = auth.indexOf(":")
      const user = firstColon !== -1 ? auth.slice(0, firstColon) : auth
      const pass = firstColon !== -1 ? auth.slice(firstColon + 1) : ""
      const [hostPort, dbQuery] = rest.split("/")
      const [rawHost, port] = (hostPort || "").split(":")
      const [db] = (dbQuery || "").split("?")
      const host = (rawHost === "localhost" ? "127.0.0.1" : rawHost) || "127.0.0.1"
      return {
        host,
        port: port ? parseInt(port, 10) : 3306,
        user: user || "root",
        password: pass,
        database: db || "",
        connectTimeout: 5000,
      }
    }
    return { host: "127.0.0.1", port: 3306, user: "root", password: "", database: "", connectTimeout: 5000 }
  }
}

const config = parseConfig(rawUrl)

console.log("\nParsed Connection Parameters:")
console.log(`  • Host:     ${config.host}`)
console.log(`  • Port:     ${config.port}`)
console.log(`  • User:     ${config.user}`)
console.log(`  • Password: ${config.password ? "*".repeat(Math.min(config.password.length, 12)) : "(empty)"}`)
console.log(`  • Database: ${config.database || "(none)"}`)

if (config.password === "YourStrongPassword" || config.user === "zkwaconnect_user") {
  console.log("\n⚠️  WARNING: You are using the default example template credentials from .env.example!")
  console.log("   Please edit .env and update with your real cPanel MySQL user, password, and database name.")
}

console.log("\nTesting direct connection to MySQL...")

async function testConnection(targetConfig, label) {
  process.stdout.write(`  ⏳ Connecting to ${label} (${targetConfig.host || targetConfig.socketPath})... `)
  try {
    const conn = await mariadb.createConnection(targetConfig)
    console.log("✅ SUCCESS!")
    
    // Test query
    const rows = await conn.query("SELECT 1 + 1 AS test, VERSION() AS version, DATABASE() as current_db")
    console.log(`     Server Version: ${rows[0].version}`)
    console.log(`     Active Database: ${rows[0].current_db}`)
    await conn.end()
    return true
  } catch (err) {
    console.log("❌ FAILED")
    console.log(`     Error Code: ${err.code || err.errno || "UNKNOWN"}`)
    console.log(`     Message:    ${err.message}`)

    if (err.code === "ER_ACCESS_DENIED_ERROR") {
      console.log("\n  💡 Root Cause: Invalid MySQL username or password!")
      console.log("     In cPanel:")
      console.log("     1. Go to 'MySQL Databases'.")
      console.log("     2. Check the exact username (cPanel prefixes usernames with your account, e.g. 'cpaneluser_zkwa').")
      console.log("     3. Verify the user has been added to the database under 'Add User To Database' and granted ALL PRIVILEGES.")
    } else if (err.code === "ER_BAD_DB_ERROR") {
      console.log("\n  💡 Root Cause: The database name does not exist!")
      console.log("     In cPanel, database names are usually prefixed, e.g. 'cpaneluser_zkwaconnect'.")
    } else if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
      console.log("\n  💡 Root Cause: Port 3306 is not accepting TCP connections on this host.")
      console.log("     Try using 127.0.0.1 instead of localhost.")
    }
    return false
  }
}

async function runTests() {
  // Test 1: Configured host
  let success = await testConnection(config, "Configured Host")

  // Test 2: If configured host was localhost or failed, try 127.0.0.1
  if (!success && config.host !== "127.0.0.1") {
    const altConfig = { ...config, host: "127.0.0.1" }
    success = await testConnection(altConfig, "127.0.0.1 (IPv4 fallback)")
  }

  // Test 3: Common cPanel Unix sockets if on Linux
  if (!success && process.platform === "linux") {
    const commonSockets = ["/var/lib/mysql/mysql.sock", "/tmp/mysql.sock", "/var/run/mysqld/mysqld.sock"]
    for (const socketPath of commonSockets) {
      if (fs.existsSync(socketPath)) {
        const socketConfig = { ...config, socketPath, host: undefined, port: undefined }
        success = await testConnection(socketConfig, `Unix Socket (${socketPath})`)
        if (success) {
          console.log(`\n🎉 Socket connection succeeded! You can set DATABASE_URL in .env with:`)
          console.log(`   DATABASE_URL="mysql://${config.user}:${config.password}@localhost/${config.database}?socket=${socketPath}"`)
          break
        }
      }
    }
  }

  console.log("\n============================================================")
  if (success) {
    console.log("✅ Database test completed successfully!")
  } else {
    console.log("❌ Please update your .env with the correct MySQL credentials.")
  }
  console.log("============================================================\n")
  process.exit(success ? 0 : 1)
}

runTests()

