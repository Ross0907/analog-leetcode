import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import { getSupabaseConfig, type SupabaseConfig } from "./config.server";

/** A fresh SDK client and cookie jar per request; never shared across users. */
export async function createRequestSupabase(request: Request, configuration?: SupabaseConfig | null) {
  const config = configuration === undefined ? await getSupabaseConfig() : configuration;
  if (!config) return null;
  const jar = new Map(parseCookieHeader(request.headers.get("cookie") ?? "").map(({ name, value }) => [name, value ?? ""]));
  const changed = new Map<string, { value: string; options: CookieOptions }>();
  const client = createServerClient(config.url, config.key, {
    cookieOptions: { path: "/", sameSite: "lax", httpOnly: true, secure: new URL(request.url).protocol === "https:" },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          jar.set(name, value);
          changed.set(name, { value, options });
        }
      },
    },
  });
  return {
    client,
    requestHeaders() {
      const headers = new Headers(request.headers);
      headers.set("cookie", [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; "));
      return headers;
    },
    finish(response: Response) {
      for (const [name, { value, options }] of changed) {
        response.headers.append("set-cookie", serializeCookieHeader(name, value, options));
      }
      response.headers.set("cache-control", "private, no-store");
      response.headers.set("vary", "Cookie");
      return response;
    },
  };
}

export type RequestSupabase = NonNullable<Awaited<ReturnType<typeof createRequestSupabase>>>;
