// Production entry for cPanel "Setup Node.js App" hosting (GoDaddy, HostGator — Phusion Passenger).
// Set "Application startup file" to server.js. Railway uses `npm start` instead; Vercel doesn't use this file.
const { createServer } = require("node:http")
const next = require("next")

const port = Number(process.env.PORT) || 3000
const app = next({ dev: false, dir: __dirname })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((request, response) => handle(request, response)).listen(port, () => {
    console.log(`ZKWAConnect ready on port ${port}`)
  })
}).catch(error => {
  console.error("ZKWAConnect failed to start", error)
  process.exit(1)
})
