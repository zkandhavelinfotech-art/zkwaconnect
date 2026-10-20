import { NextRequest, NextResponse } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith("/api/")) {
    const headers = new Headers(req.headers)
    headers.set("x-zk-path", pathname)
    headers.set("x-zk-method", req.method)
    return NextResponse.next({ request: { headers } })
  }
  const hasSession      = Boolean(req.cookies.get("zkwaconnect_session")?.value)

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!hasSession) return NextResponse.redirect(new URL("/admin/login", req.url))
    return NextResponse.next()
  }
  if (pathname.startsWith("/app") || pathname.startsWith("/onboarding") || pathname.startsWith("/projects")) {
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
  matcher: ["/app/:path*", "/onboarding/:path*", "/projects/:path*", "/admin/:path*", "/login", "/register", "/api/:path*"],
}
