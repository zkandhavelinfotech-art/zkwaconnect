// Production server: `npm start` (local and Railway) and cPanel "Setup Node.js App" hosting (GoDaddy, HostGator — Phusion
// Passenger, startup file server.js or app.js). Vercel doesn't use this file. Run `npm run build` first.
const { createServer } = require("node:http")
const { loadEnvConfig } = require("@next/env")
const next = require("next")

// Always a production server, even if .env says NODE_ENV=development.
process.env.NODE_ENV = "production"
// Load .env before choosing the port. Variables already set by the host (Passenger, cPanel, Railway) are never overwritten.
loadEnvConfig(__dirname, false)

const rawPort = process.env.PORT
const port = rawPort ? (isNaN(Number(rawPort)) ? rawPort : Number(rawPort)) : 3000
const app = next({ dev: false, dir: __dirname })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((request, response) => handle(request, response)).listen(port, () => {
    console.log(`ZKWAConnect ready on ${typeof port === "number" ? `http://localhost:${port}` : port}`)
  }).on("error", error => {
    console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use by another program. Set a free PORT in .env or stop the other program.` : error)
    process.exit(1)
  })
}).catch(error => {
  console.error("ZKWAConnect failed to start", error)
  process.exit(1)
})
