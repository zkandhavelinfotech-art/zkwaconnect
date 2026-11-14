#!/usr/bin/env node
/**
 * ZKWAConnect — Universal Dev & Production Launcher
 * Handles port binding resilience and GoDaddy/Cloud PaaS fallback.
 * If executed in a cloud hosting environment (where PORT is assigned by host or NODE_ENV=production),
 * it seamlessly hands over to production server.js instead of crashing with EACCES.
 */

const isProduction =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.PORT && process.env.PORT !== "3002") ||
  Boolean(process.env.DYNO || process.env.KUBERNETES_SERVICE_HOST || process.env.WEBSITE_SITE_NAME)

if (isProduction) {
  console.log("==================================================================")
  console.log("🌐 Production / Cloud Hosting environment detected.")
  console.log("➡️  Handing over to standalone production server.js...")
  console.log("==================================================================")
  require("../server.js")
} else {
  const { spawn, execSync } = require("node:child_process")
  const path = require("node:path")
  const fs = require("node:fs")
  const port = process.env.PORT || 3002

  // Auto-clean stale production chunks from .next to prevent 'Cannot find module ./XXXX.js' collisions in next dev
  const rootPath = path.resolve(__dirname, "..")
  const nextDir = path.join(rootPath, ".next")
  const buildIdFile = path.join(nextDir, "BUILD_ID")
  const staleServer = path.join(nextDir, "server")

  if (fs.existsSync(buildIdFile) || fs.existsSync(staleServer)) {
    console.log("==================================================================")
    console.log("🧹 [ZKWAConnect] Flushing stale webpack cache to prevent chunk collisions...")
    try {
      fs.rmSync(staleServer, { recursive: true, force: true })
      fs.rmSync(path.join(nextDir, "cache"), { recursive: true, force: true })
      fs.rmSync(buildIdFile, { force: true })
      console.log("✅ [ZKWAConnect] Dev cache cleaned successfully!")
    } catch (cleanErr) {
      console.warn("⚠️ [ZKWAConnect] Cache clean notice:", cleanErr?.message || cleanErr)
    }
    console.log("==================================================================")
  }

  // Pre-check port 3002 to avoid EACCES / EADDRINUSE from abandoned background node processes
  try {
    if (process.platform === "win32") {
      const netstat = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim()
      const lines = netstat.split("\n")
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && Number(pid) > 0 && Number(pid) !== process.pid) {
          try {
            process.kill(Number(pid), "SIGKILL")
            console.log(`🔌 [ZKWAConnect] Freed port ${port} from stale PID ${pid}.`)
          } catch {}
        }
      }
    }
  } catch {}

  console.log(`[ZKWAConnect] Starting local development server on port ${port}...`)
  
  // Cross-platform spawn of Next.js CLI
  const nextBin = path.join(__dirname, "..", "node_modules", "next", "dist", "bin", "next")
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    stdio: "inherit",
    cwd: rootPath,
    env: { ...process.env, PORT: String(port) },
  })

  child.on("error", err => {
    console.error("[ZKWAConnect] Failed to start next dev:", err)
    process.exit(1)
  })

  child.on("exit", code => {
    process.exit(code || 0)
  })
}

