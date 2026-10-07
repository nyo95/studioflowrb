import { NextResponse, type NextRequest } from "next/server";

// The locked cookie name (src/platform/core/auth/cookie-name.ts) is
// deliberately re-declared here: proxy must not rely on shared modules or
// globals, and performs NO database or identity resolution.
const SESSION_COOKIE_NAME = "studioflow_session";

/** Public UI routes: sign-in only. The component showcase at /ui-engine needs a session like every other page. */
const PUBLIC_PATHS = ["/login"];

/**
 * Optimistic public-route/session-cookie presence gating ONLY (CORE.md §3).
 * No database access, no grant evaluation, no authorization: every server
 * page, route handler, and server action fails closed independently.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!isPublic && !hasSessionCookie) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

/**
 * The deliverable upload route is excluded on purpose: Next.js buffers (and silently truncates at 10 MB) any request body that
 * passes through proxy. The route authenticates itself with requirePrincipalGrants and answers 401 without a session.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/studioflow/deliverables|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|txt|xml)$).*)"],
};
