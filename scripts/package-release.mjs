#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")

// Parse command line arguments
const args = process.argv.slice(2)
let envMode = "live"
for (const arg of args) {
  if (arg.startsWith("--env=")) envMode = arg.split("=")[1].toLowerCase()
  else if (arg === "dev" || arg === "development") envMode = "dev"
  else if (arg === "live" || arg === "prod" || arg === "production") envMode = "live"
}

const isLive = envMode === "live" || envMode === "prod" || envMode === "production"
const releaseDir = path.join(rootDir, "release")
const stagingDir = path.join(releaseDir, `staging-${envMode}`)
const zipName = `ZKWAConnect-v6.0.0-DEPLOY-${isLive ? "LIVE" : "DEV"}.zip`
const zipPath = path.join(releaseDir, zipName)

console.log("============================================================")
console.log(`  ZKWAConnect v6 Release Packager — [${isLive ? "LIVE / PRODUCTION" : "DEV / LOCAL"}]`)
console.log("============================================================")

// Ensure release dir exists and clean previous staging
if (!fs.existsSync(releaseDir)) fs.mkdirSync(releaseDir, { recursive: true })
if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true })
if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true })
fs.mkdirSync(stagingDir, { recursive: true })

// Copy directories
const dirsToCopy = [
  "app",
  "apps",
  "components",
  "generated",
  "lib",
  "public",
  "prisma",
  "publish-portal",
  "scripts"
]

// Copy files
const filesToCopy = [
  "server.js",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.ts",
  "middleware.ts",
  "ecosystem.config.js",
  "docker-compose.yml",
  "nginx.conf",
  ".htaccess",
  "zkwa-publish.bat",
  "README.md"
]

console.log("Copying files to staging directory...")

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".git") {
        copyDirRecursive(srcPath, destPath)
      }
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

for (const dir of dirsToCopy) {
  const src = path.join(rootDir, dir)
  const dest = path.join(stagingDir, dir)
  copyDirRecursive(src, dest)
}

for (const file of filesToCopy) {
  const src = path.join(rootDir, file)
  const dest = path.join(stagingDir, file)
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
  }
}

// Generate tailored .env for staging
const envContent = isLive
  ? `# ZKWAConnect v6 — Live / Production Environment
NODE_ENV="production"
PORT=3002

# MySQL Production Database Connection (GoDaddy / AWS RDS / Live VPS)
DATABASE_URL="mysql://zkwaconnect_user:YourStrongPassword@localhost:3306/zkwaconnect_prod"

# Production Domains
NEXT_PUBLIC_APP_URL="https://app.zkwaconnect.in"
NEXT_PUBLIC_API_URL="https://api.zkwaconnect.in/api/v1"
NEXT_PUBLIC_MARKETING_URL="https://zkwaconnect.in"

# Master Security Secrets
NEXTAUTH_SECRET="zkwa_live_master_jwt_secret_32chars_long!"
ENCRYPTION_KEY="zkwa_live_encryption_master_key_32chars!"
`
  : `# ZKWAConnect v6 — Development / Localhost Environment
NODE_ENV="development"
PORT=3002

# MySQL Localhost Database Connection (XAMPP / Local MySQL)
DATABASE_URL="mysql://root:Admin%40123@localhost:3306/zkwaconnect_dev"

# Development URLs
NEXT_PUBLIC_APP_URL="http://localhost:3002"
NEXT_PUBLIC_API_URL="http://localhost:3002/api/v1"
NEXT_PUBLIC_MARKETING_URL="http://localhost:3002"

# Local Secrets
NEXTAUTH_SECRET="zkwa_dev_master_secret_key_32chars!"
ENCRYPTION_KEY="zkwa_dev_encryption_key_32chars_long!"
`

fs.writeFileSync(path.join(stagingDir, ".env"), envContent, "utf8")
fs.writeFileSync(path.join(stagingDir, ".env.example"), envContent, "utf8")

// Generate DEPLOY-README.md
const deployReadme = `# ZKWAConnect v6 — Deployment Guide (${isLive ? "LIVE / PRODUCTION" : "DEV / LOCAL"})

This ZIP contains the complete production-ready source code, database migration scripts, and server configurations for ZKWAConnect v6.

## 1. Quick Server Setup
1. **Extract this ZIP** to your server directory (e.g. \`/var/www/zkwaconnect\` or GoDaddy \`/home/user/zkwaconnect\`).
2. **Review .env:** Update the \`DATABASE_URL\` with your MySQL database credentials.
3. **Import Database Schema:**
   - In phpMyAdmin / MySQL CLI, run:
     \`\`\`bash
     mysql -u username -p database_name < prisma/schema-mysql.sql
     \`\`\`
4. **Install & Build:**
   \`\`\`bash
   npm install --production=false
   npm run build
   \`\`\`
5. **Start Application:**
   - Standalone: \`npm start\`
   - With PM2: \`pm2 start ecosystem.config.js --env ${isLive ? "production" : "development"}\`
   - With Docker: \`docker-compose up -d\`

## 2. Multi-Domain Routing
- **Marketing & Admin Portal:** \`zkwaconnect.in\` (Port 3000 or unified 3002)
- **Customer WhatsApp Platform:** \`app.zkwaconnect.in\` (Port 3001 or unified 3002)
- **Public REST API:** \`api.zkwaconnect.in\` (Port 3002)
`
fs.writeFileSync(path.join(stagingDir, "DEPLOY-README.md"), deployReadme, "utf8")

console.log("Compressing package into ZIP via .NET System.IO.Compression...")
try {
  const normStaging = stagingDir.replace(/\\/g, "/")
  const normZip = zipPath.replace(/\\/g, "/")
  const psCmd = `powershell -NoProfile -Command "$ProgressPreference = 'SilentlyContinue'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${normStaging}', '${normZip}', [System.IO.Compression.CompressionLevel]::Optimal, $false)"`
  execSync(psCmd, { stdio: "inherit" })

  // Clean staging directory
  fs.rmSync(stagingDir, { recursive: true, force: true })

  const stats = fs.statSync(zipPath)
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
  console.log("============================================================")
  console.log(`✅ Deployment ZIP Successfully Created!`)
  console.log(`📁 File: ${zipPath}`)
  console.log(`📦 Size: ${sizeMB} MB`)
  console.log("============================================================")
} catch (err) {
  console.error("Compression failed:", err)
  process.exit(1)
}
