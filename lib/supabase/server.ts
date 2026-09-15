import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config.server";

/** Read-only RSC client. Middleware refreshes cookies before rendering. */
export async function createSupabaseServerClient() {
  const config = await getSupabaseConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: () => { /* Refresh writes are applied by middleware or route handlers. */ },
    },
  });
}
