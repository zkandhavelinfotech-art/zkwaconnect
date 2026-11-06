import { NextRequest, NextResponse } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host = req.headers.get("host") || ""

  // 1. API Subdomain routing (api.zkwaconnect.in/v1/... -> /api/v1/...)
  if (host.startsWith("api.") && pathname.startsWith("/v1/")) {
    const url = req.nextUrl.clone()
    url.pathname = `/api${pathname}`
    return NextResponse.rewrite(url)
  }

  // 2. Allow API requests with tracking headers
  if (pathname.startsWith("/api/")) {
    const headers = new Headers(req.headers)
    headers.set("x-zk-path", pathname)
    headers.set("x-zk-method", req.method)
    return NextResponse.next({ request: { headers } })
  }

  // 3. Convenience redirect for settings/developer/api-keys
  if (pathname === "/settings/developer/api-keys" || pathname === "/app/settings/developer/api-keys") {
    return NextResponse.redirect(new URL("/app/developers", req.url))
  }

  const hasSession = Boolean(req.cookies.get("zkwaconnect_session")?.value)

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!hasSession) return NextResponse.redirect(new URL("/admin/login", req.url))
    return NextResponse.next()
  }
  if (pathname.startsWith("/app") || pathname.startsWith("/onboarding") || pathname.startsWith("/projects") || pathname.startsWith("/partner")) {
    if (!hasSession) {
      const url = new URL("/login", req.url)
      url.searchParams.set("from", pathname)
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }
  if ((pathname === "/login" || pathname === "/register") && hasSession)
    return NextResponse.redirect(new URL("/projects", req.url))
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/app/:path*",
    "/onboarding/:path*",
    "/projects/:path*",
    "/partner/:path*",
    "/partner",
    "/admin/:path*",
    "/login",
    "/register",
    "/api/:path*",
    "/v1/:path*",
    "/settings/:path*",
  ],
}
