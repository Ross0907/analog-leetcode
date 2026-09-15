export type SupabaseConfig = { url: string; key: string };
type AuthEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
};

export function readSupabaseConfig(environment: AuthEnvironment): SupabaseConfig | null {
  const url = environment.SUPABASE_URL?.trim();
  const key = (environment.SUPABASE_PUBLISHABLE_KEY ?? environment.SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
    if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null;
    if (!key.startsWith("sb_publishable_")) {
      // Legacy anon keys are JWTs. Refuse elevated keys even though this client
      // only calls Auth; application sessions must never use service_role.
      const payload = JSON.parse(atob(key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")));
      if (payload.role !== "anon") return null;
    }
    return { url: parsed.origin, key };
  } catch { return null; }
}

export async function getSupabaseConfig(): Promise<SupabaseConfig | null> {
  try {
    const { env } = await import("cloudflare:workers");
    const configured = readSupabaseConfig(env);
    if (configured) return configured;
  } catch {
    // A portable Node preview has no Cloudflare binding module.
  }
  return readSupabaseConfig({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  });
}
