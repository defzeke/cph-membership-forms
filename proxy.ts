import { NextResponse, type NextRequest } from "next/server";

import { registrationGuard } from "@/lib/proxy";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/register" || pathname === "/register/") {
    return NextResponse.next();
  }

  if (!registrationGuard.hasRequiredCookies(request.cookies)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/register";
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/register/:path*"],
};
