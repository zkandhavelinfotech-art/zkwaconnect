import fs from "node:fs/promises"
import path from "node:path"

// Updates KEY=value lines in the project .env, keeping comments and order, and applies the values to this
// running process. Keeps a single .env.backup of the previous file (it contains secrets, so only one copy).
export async function updateEnvFile(values: Record<string, string>) {
  const file = path.join(process.cwd(), ".env")
  const original = await fs.readFile(file, "utf8").catch(() => "")
  const eol = original.includes("\r\n") ? "\r\n" : "\n"
  const pending = new Map(Object.entries(values))
  const lines = original ? original.split(/\r?\n/) : []

  const updated = lines.map(line => {
    const key = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1]
    if (!key || !pending.has(key)) return line
    const value = pending.get(key)!
    pending.delete(key)
    return `${key}=${value}`
  })
  if (pending.size) {
    while (updated.length && updated[updated.length - 1] === "") updated.pop()
    updated.push("", "# Added from Admin → Meta app setup")
    for (const [key, value] of pending) updated.push(`${key}=${value}`)
  }

  if (original) await fs.writeFile(path.join(process.cwd(), ".env.backup"), original, { mode: 0o600 })
  await fs.writeFile(file, `${updated.join(eol).replace(/\s*$/, "")}${eol}`, { mode: 0o600 })
  for (const [key, value] of Object.entries(values)) process.env[key] = value
  return { file, backup: original ? ".env.backup" : null }
}

export function canWriteEnvFile() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_ENV_WRITE === "true"
}
