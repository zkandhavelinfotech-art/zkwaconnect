import { NextRequest, NextResponse } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host = (req.headers.get("host") || "").toLowerCase()
  const hasSession = Boolean(req.cookies.get("zkwaconnect_session")?.value)

  // 1. API Subdomain routing (api.zkwaconnect.in)
  if (host.startsWith("api.")) {
    if (pathname.startsWith("/v1/")) {
      const url = req.nextUrl.clone()
      url.pathname = `/api${pathname}`
      return NextResponse.rewrite(url)
    }
  }

  // 2. Customer Platform Subdomain routing (app.zkwaconnect.in)
  if (host.startsWith("app.")) {
    if (pathname === "/") {
      return NextResponse.redirect(new URL(hasSession ? "/projects" : "/login", req.url))
    }
  }

  // 3. Marketing Domain (zkwaconnect.in) - root serves marketing
  if (host === "zkwaconnect.in" || host === "www.zkwaconnect.in") {
    // Marketing site at root
    if (pathname === "/") {
      return NextResponse.next()
    }
  }

  // 4. Tracked API requests
  if (pathname.startsWith("/api/")) {
    const headers = new Headers(req.headers)
    headers.set("x-zk-path", pathname)
    headers.set("x-zk-method", req.method)
    return NextResponse.next({ request: { headers } })
  }

  // 5. Convenience redirect for settings/developer/api-keys
  if (pathname === "/settings/developer/api-keys" || pathname === "/app/settings/developer/api-keys") {
    return NextResponse.redirect(new URL("/app/developers", req.url))
  }

  // 6. Admin Portal protection
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!hasSession) return NextResponse.redirect(new URL("/admin/login", req.url))
    return NextResponse.next()
  }

  // 7. Customer App Portal protection
  if (pathname.startsWith("/app") || pathname.startsWith("/onboarding") || pathname.startsWith("/projects") || pathname.startsWith("/partner")) {
    if (!hasSession) {
      const url = new URL("/login", req.url)
      url.searchParams.set("from", pathname)
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  if ((pathname === "/login" || pathname === "/register") && hasSession) {
    return NextResponse.redirect(new URL("/projects", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/",
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
