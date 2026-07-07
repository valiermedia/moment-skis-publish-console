import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe auth instance (no node-only imports) for the middleware gate.
const { auth } = NextAuth(authConfig);

/**
 * Route gate. Non-signed-in users are sent to /login. Signed-in-but-not-authorized
 * users (not an org member / no repo write) are held at /request-access and never
 * see the console. API routes enforce their own guard (requireAuthorized) too.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Always-open paths.
  const isPublic =
    pathname.startsWith("/api/auth") ||
    pathname === "/api/health" ||
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  if (!session?.user) {
    const url = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(url);
  }

  // Signed in but not authorized → request-access holding page.
  if (!session.user.allowed && pathname !== "/request-access") {
    const url = new URL("/request-access", req.nextUrl.origin);
    return NextResponse.redirect(url);
  }

  // Authorized users shouldn't sit on the request-access page.
  if (session.user.allowed && pathname === "/request-access") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  // The settings page is super-admin only. (The /api/admin routes enforce their
  // own 403; this just keeps non-admins off the page.)
  if (pathname.startsWith("/admin") && !session.user.isAdmin) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Run on everything except static assets and the auth API (handled above anyway).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
