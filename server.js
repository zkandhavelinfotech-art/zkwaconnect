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
const port = rawPort ? (isNaN(Number(rawPort)) ? rawPort : Number(rawPort)) : 3000
const app = next({ dev: false, dir: __dirname })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((request, response) => handle(request, response)).listen(port, () => {
    console.log("==================================================================")
    console.log(`🚀 ZKWAConnect v5.2.0 production server running on port: ${port}`)
    console.log(`🌐 Ready on ${typeof port === "number" ? `http://localhost:${port}` : port}`)
    console.log("==================================================================")
  }).on("error", error => {
    console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use by another program. Set a free PORT in .env or stop the other program.` : error)
    process.exit(1)
  })
}).catch(error => {
  console.error("❌ ZKWAConnect failed to start", error)
  process.exit(1)
})
