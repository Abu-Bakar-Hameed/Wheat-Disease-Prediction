import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-side gate for the admin console.
 *
 * Reads the `wg_admin` cookie mirrored by the auth store on login (see
 * src/lib/auth.tsx). Requests to /admin/* without it are redirected to the
 * farmer login page opened on its inline Admin tab (/login?mode=admin-login).
 *
 * This is a coarse, first-line gate. The authoritative role check still lives
 * in the backend, which validates the JWT/admin role on every /admin API call
 * — a crafted cookie cannot reach admin data without a valid session token.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdmin = request.cookies.get("wg_admin")?.value === "1";

  if ((pathname === "/admin" || pathname.startsWith("/admin/")) && !isAdmin) {
    const url = new URL("/login", request.url);
    url.searchParams.set("mode", "admin-login");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
