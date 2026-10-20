// Runs before `npm run dev`. Two dev servers share and corrupt the .next folder
// (ENOENT ... .next/server/... errors), so refuse to start a second one.
const ports = [3000, 3001, 3002, 3003, 3004, 3005, 3100]

async function isZkwaServer(port) {
  try {
    const response = await fetch(`http://localhost:${port}/marketing/index.html`, { signal: AbortSignal.timeout(1500) })
    return response.ok && (await response.text()).includes("ZKWAConnect")
  } catch {
    return false
  }
}

const running = (await Promise.all(ports.map(async port => ((await isZkwaServer(port)) ? port : null)))).filter(Boolean)
if (running.length) {
  console.error(`\n  ZKWAConnect is already running at http://localhost:${running[0]}`)
  console.error("  Use that one, or stop it (Ctrl+C in its window) before starting another.")
  console.error("  Running two dev servers at once corrupts the .next folder.\n")
  // exitCode instead of process.exit(): exiting while fetch sockets close crashes Node on Windows.
  process.exitCode = 1
}
