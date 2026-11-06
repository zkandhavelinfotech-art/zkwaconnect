#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const schemaPath = path.join(rootDir, "prisma", "schema.prisma")

const target = (process.argv[2] || "").toLowerCase()
if (!["mysql", "postgres", "postgresql"].includes(target)) {
  console.log("Usage: node scripts/db-switch.mjs <mysql|postgres>")
  process.exit(1)
}

const provider = target === "mysql" ? "mysql" : "postgresql"
let content = fs.readFileSync(schemaPath, "utf8")

// Replace provider line
content = content.replace(/provider\s*=\s*"(postgresql|mysql)"/, `provider = "${provider}"`)

fs.writeFileSync(schemaPath, content, "utf8")
console.log(`✅ Prisma schema database provider switched to: ${provider.toUpperCase()}`)
console.log(`Run 'npx prisma generate' or 'npm run db:generate' to update the client.`)

