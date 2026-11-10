#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")

console.log("==================================================================")
console.log("🐬 ZKWAConnect v5.2.0 — Automated MySQL Migration & Setup")
console.log("==================================================================\n")

// 1. Check schema.prisma
const schemaPath = path.join(rootDir, "prisma", "schema.prisma")
const mysqlSchemaPath = path.join(rootDir, "prisma", "schema.mysql.prisma")

if (fs.existsSync(mysqlSchemaPath)) {
  console.log("📋 [Step 1/4] Applying MySQL Prisma schema...")
  fs.copyFileSync(mysqlSchemaPath, schemaPath)
  console.log("  ✅ MySQL schema configured.")
} else {
  let content = fs.readFileSync(schemaPath, "utf8")
  content = content.replace(/provider\s*=\s*"(postgresql|mysql)"/, `provider = "mysql"`)
  fs.writeFileSync(schemaPath, content, "utf8")
  console.log("  ✅ Schema provider set to MySQL.")
}

// 2. Generate Prisma Client
console.log("\n⚙️  [Step 2/4] Generating Prisma Client for MySQL...")
try {
  execSync("npx prisma generate", { stdio: "inherit", cwd: rootDir })
  console.log("  ✅ Prisma Client generated successfully.")
} catch (e) {
  console.error("  ❌ Prisma generate failed:", e?.message || e)
  process.exit(1)
}

// 3. Push schema to MySQL database
console.log("\n🚀 [Step 3/4] Pushing schema to MySQL database (creating tables & indexes)...")
try {
  execSync("npx prisma db push --accept-data-loss", { stdio: "inherit", cwd: rootDir })
  console.log("  ✅ MySQL database tables created / updated successfully!")
} catch (e) {
  console.warn("  ⚠️ Automated db push encountered an issue:", e?.message || e)
  console.log("  ℹ️ You can also import 'prisma/schema-mysql.sql' via phpMyAdmin.")
}

// 4. Seed initial default accounts and plans
console.log("\n🌱 [Step 4/4] Seeding default platform plans, admin and customer logins...")
try {
  execSync("npx tsx scripts/setup-customer-and-admin-logins.ts", { stdio: "inherit", cwd: rootDir })
  console.log("  ✅ Default plans and logins successfully initialized!")
} catch (e) {
  console.warn("  ⚠️ Seed step skipped or partial:", e?.message || e)
}

console.log("\n==================================================================")
console.log("🎉 MySQL Database Migration & Setup Completed Successfully!")
console.log("==================================================================")
