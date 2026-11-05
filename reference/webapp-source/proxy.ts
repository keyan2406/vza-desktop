import { type NextRequest } from "next/server";
import { applySecurityHeaders } from "./utils/security-headers";
import { updateSession } from "./utils/supabase/proxy";

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|api/discord|api/cron|api/import/blueprints|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
