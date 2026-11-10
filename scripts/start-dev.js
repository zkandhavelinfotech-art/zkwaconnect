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
  const { spawn } = require("node:child_process")
  const path = require("node:path")
  const port = process.env.PORT || 3002

  console.log(`[ZKWAConnect] Starting local development server on port ${port}...`)
  
  // Cross-platform spawn of Next.js CLI
  const nextBin = path.join(__dirname, "..", "node_modules", "next", "dist", "bin", "next")
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
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
