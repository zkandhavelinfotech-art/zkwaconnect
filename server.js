// Production server: `npm start` (local and Railway) and cPanel/GoDaddy PaaS / Phusion Passenger hosting
const fs = require("node:fs")
const path = require("node:path")
const { execSync } = require("node:child_process")
const { createServer } = require("node:http")
const { loadEnvConfig } = require("@next/env")

// Always a production server, even if .env says NODE_ENV=development.
process.env.NODE_ENV = "production"
// Load .env before choosing the port. Variables already set by the host (GoDaddy, Passenger, cPanel, Railway) are never overwritten.
loadEnvConfig(__dirname, false)

// Self-Healing Step 1: Verify production build (.next/BUILD_ID) exists before starting Next.js
const buildIdFile = path.join(__dirname, ".next", "BUILD_ID")
if (!fs.existsSync(buildIdFile)) {
  console.log("==================================================================")
  console.log("⚠️ [ZKWAConnect] No production build found in '.next' directory.")
  console.log("⚙️  Running 'npx next build' automatically for GoDaddy / Hosting server...")
  console.log("==================================================================")
  try {
    execSync("npx next build", {
      stdio: "inherit",
      cwd: __dirname,
      env: { ...process.env, NODE_ENV: "production" },
    })
    console.log("✅ [ZKWAConnect] Production build finished successfully!")
  } catch (buildError) {
    console.error("❌ [ZKWAConnect] Automated 'next build' encountered an error:", buildError?.message || buildError)
  }
}

// Self-Healing Step 2: Auto-run Prisma client generate if missing
const prismaClientPath = path.join(__dirname, "generated", "prisma", "client", "index.js")
if (!fs.existsSync(prismaClientPath)) {
  console.log("⚙️  [ZKWAConnect] Generating Prisma Client...")
  try {
    execSync("npx prisma generate", { stdio: "inherit", cwd: __dirname })
    console.log("✅ [ZKWAConnect] Prisma Client generated successfully!")
  } catch (prismaError) {
    console.warn("⚠️ [ZKWAConnect] Prisma generate skipped or failed:", prismaError?.message || prismaError)
  }
}

const next = require("next")
const rawPort = process.env.PORT
// If PORT is a Unix socket path (e.g. from Phusion Passenger / cPanel), pass it directly; otherwise parse number
const port = rawPort ? (isNaN(Number(rawPort)) ? rawPort : Number(rawPort)) : 3000
const host = typeof port === "number" ? (process.env.HOST || "0.0.0.0") : undefined
const app = next({ dev: false, dir: __dirname })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((request, response) => handle(request, response))

  const listenCallback = () => {
    console.log("==================================================================")
    console.log(`🚀 ZKWAConnect v5.2.0 production server running`)
    console.log(`🌐 Listening on: ${typeof port === "number" ? `http://${host}:${port}` : port}`)
    console.log("==================================================================")
  }

  if (typeof port === "number") {
    server.listen(port, host, listenCallback)
  } else {
    server.listen(port, listenCallback)
  }

  server.on("error", error => {
    if (error.code === "EACCES") {
      console.error(`❌ [EACCES] Permission denied binding to ${host}:${port}.`)
      console.error(`💡 Solution: Configure PORT in your hosting settings (e.g. PORT=3000 or PORT=8080) instead of restricted ports.`)
    } else if (error.code === "EADDRINUSE") {
      console.error(`❌ [EADDRINUSE] Port ${port} is already in use by another process.`)
    } else {
      console.error("❌ Server error:", error)
    }
    process.exit(1)
  })
}).catch(error => {
  console.error("❌ ZKWAConnect failed to start", error)
  process.exit(1)
})
