import { NextResponse } from "next/server"
import { execSync } from "node:child_process"
import path from "node:path"
import fs from "node:fs"

export async function POST(req: Request) {
  try {
    let envMode = "live"
    try {
      const body = await req.json()
      if (body?.env === "dev") envMode = "dev"
    } catch {
      // default to live
    }

    const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14)
    const versionTag = `v5.2.0-b${timestamp}`
    const rootDir = process.cwd()

    console.log(`[Publish API] Creating dynamic build: ${versionTag} (${envMode})...`)

    // Execute package release script
    const scriptPath = path.join(rootDir, "scripts", "package-release.mjs")
    execSync(`node "${scriptPath}" --env=${envMode} --version=${versionTag}`, {
      cwd: rootDir,
      stdio: "pipe",
      timeout: 120000,
    })

    const expectedZipName = `ZKWAConnect-${versionTag}-DEPLOY-${envMode.toUpperCase()}.zip`
    const releaseZipPath = path.join(rootDir, "release", expectedZipName)

    // Fallback to standard name if custom version file not found
    const finalZipName = fs.existsSync(releaseZipPath)
      ? expectedZipName
      : `ZKWAConnect-v6.0.0-DEPLOY-${envMode.toUpperCase()}.zip`
    
    const finalPath = path.join(rootDir, "release", finalZipName)
    let sizeMB = "0"
    if (fs.existsSync(finalPath)) {
      sizeMB = (fs.statSync(finalPath).size / (1024 * 1024)).toFixed(2)
    }

    return NextResponse.json({
      success: true,
      version: versionTag,
      env: envMode,
      filename: finalZipName,
      sizeMB: `${sizeMB} MB`,
      downloadUrl: `/api/publish/download?file=${encodeURIComponent(finalZipName)}`,
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[Publish API] Build error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to build deployment package",
      },
      { status: 500 }
    )
  }
}
