import { NextRequest, NextResponse } from "next/server"
import path from "node:path"
import fs from "node:fs"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rawFile = searchParams.get("file") || searchParams.get("name") || ""
    const env = (searchParams.get("env") || "live").toLowerCase()

    // Sanitize filename to prevent directory traversal
    const safeBaseName = path.basename(rawFile)
    let targetFileName = safeBaseName

    if (!targetFileName || !targetFileName.endsWith(".zip") || !targetFileName.startsWith("ZKWAConnect")) {
      targetFileName = `ZKWAConnect-v6.0.0-DEPLOY-${env === "dev" ? "DEV" : "LIVE"}.zip`
    }

    const rootDir = process.cwd()
    let filePath = path.join(rootDir, "release", targetFileName)

    // Fallback to public/release if not in release/
    if (!fs.existsSync(filePath)) {
      filePath = path.join(rootDir, "public", "release", targetFileName)
    }

    // Secondary fallback: latest default zip
    if (!fs.existsSync(filePath)) {
      const defaultZip = path.join(rootDir, "release", `ZKWAConnect-v6.0.0-DEPLOY-LIVE.zip`)
      if (fs.existsSync(defaultZip)) {
        filePath = defaultZip
        targetFileName = "ZKWAConnect-v6.0.0-DEPLOY-LIVE.zip"
      }
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `Deployment ZIP file '${targetFileName}' not found. Please click 'Build Package' first.` },
        { status: 404 }
      )
    }

    const fileBuffer = fs.readFileSync(filePath)
    const stat = fs.statSync(filePath)

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${targetFileName}"`,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    })
  } catch (error) {
    console.error("[Publish Download API] Error:", error)
    return NextResponse.json(
      { error: "Failed to download deployment package" },
      { status: 500 }
    )
  }
}
