import { NextResponse, type NextRequest } from "next/server";
import { createRequestSupabase } from "./lib/supabase/request.server";

export async function middleware(request: NextRequest) {
  // Auth writes/callbacks own their cookie lifecycle. Do not rotate a token in
  // middleware and then independently rotate its old value in the route.
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/_next/") || pathname.startsWith("/_vinext/") || pathname.startsWith("/assets/") || pathname.startsWith("/circuitjs/") || /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|wasm|map|woff2?)$/i.test(pathname)) return NextResponse.next();
  if (pathname.startsWith("/auth/") && pathname !== "/auth/update-password") return NextResponse.next();
  if (!request.headers.get("cookie")?.includes("sb-")) return NextResponse.next();
  const context = await createRequestSupabase(request);
  if (!context) return NextResponse.next();
  try {
    await context.client.auth.getUser();
  } catch {
    // Protected page/route checks still fail closed if Auth is unavailable.
  }
  return context.finish(NextResponse.next({ request: { headers: context.requestHeaders() } }));
}

export const config = {
  matcher: ["/:path*"],
};
