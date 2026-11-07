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
  "app.js",
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
  "zkwa-build-zip.bat",
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

// Ensure default schema in release is MySQL for GoDaddy / cPanel deployment
const stagingMysqlSchema = path.join(stagingDir, "prisma", "schema.mysql.prisma")
const stagingDefaultSchema = path.join(stagingDir, "prisma", "schema.prisma")
if (fs.existsSync(stagingMysqlSchema)) {
  fs.copyFileSync(stagingMysqlSchema, stagingDefaultSchema)
}

// Generate the MySQL Prisma client directly inside staging so it's ready out of the box
try {
  console.log("Generating MySQL Prisma client in release bundle...")
  execSync(`npx prisma generate --schema="${stagingDefaultSchema}"`, { stdio: "inherit" })
} catch (e) {
  console.warn("Notice: Prisma client generation in staging skipped:", e?.message || e)
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

## 1. Quick Server Setup (GoDaddy / cPanel / Shared Hosting)
1. In cPanel **Setup Node.js App**:
   - **Node.js version:** Select 20.x or 22.x
   - **Application mode:** \`Production\`
   - **Application root:** \`/home/username/public_html\` or \`/home/username/zkwaconnect\`
   - **Application startup file:** \`app.js\` (or \`server.js\`)
2. **Extract this ZIP** into your Application root directory.
3. Open **phpMyAdmin**, select your MySQL database, and import \`prisma/schema-mysql.sql\`.
4. In cPanel, click **Run NPM Install** or in terminal run:
   \`\`\`bash
   npm install --production=false
   npm run build
   \`\`\`
5. Click **Restart App** in cPanel!

## 2. Multi-Domain Routing
- **Marketing & Admin Portal:** \`zkwaconnect.in\` (Port 3000 or unified 3002)
- **Customer WhatsApp Platform:** \`app.zkwaconnect.in\` (Port 3001 or unified 3002)
- **Public REST API:** \`api.zkwaconnect.in\` (Port 3002)
`
fs.writeFileSync(path.join(stagingDir, "DEPLOY-README.md"), deployReadme, "utf8")

console.log("Compressing package into ZIP with Linux/POSIX forward-slash paths...")
try {
  const normStaging = stagingDir.replace(/\\/g, "/")
  const normZip = zipPath.replace(/\\/g, "/")

  // PowerShell script that creates ZIP with POSIX forward slashes for Linux/GoDaddy compatibility
  const psScript = `
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $source = "${normStaging}"
    $destination = "${normZip}"
    if (Test-Path $destination) { Remove-Item $destination -Force }

    $archive = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)
    Get-ChildItem -Path $source -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
        $relPath = $_.FullName.Substring((Get-Item $source).FullName.Length + 1).Replace('\\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $relPath, [System.IO.Compression.CompressionLevel]::Optimal)
    }
    $archive.Dispose()
  `

  const tempPsFile = path.join(releaseDir, `zip_builder_${envMode}.ps1`)
  fs.writeFileSync(tempPsFile, psScript, "utf8")
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPsFile}"`, { stdio: "inherit" })
  fs.rmSync(tempPsFile, { force: true })

  // Clean staging directory
  fs.rmSync(stagingDir, { recursive: true, force: true })

  const stats = fs.statSync(zipPath)
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
  console.log("============================================================")
  console.log(`✅ Deployment ZIP Successfully Created! (POSIX-compliant)`)
  console.log(`📁 File: ${zipPath}`)
  console.log(`📦 Size: ${sizeMB} MB`)
  console.log("============================================================")
} catch (err) {
  console.error("Compression failed:", err)
  process.exit(1)
}
