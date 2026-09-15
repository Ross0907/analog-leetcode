import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { signInPath } from "../lib/auth-policy";

export type AppUser = { userId: string; displayName: string; email: string; fullName: string | null };

export const getUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  try {
    // getSession() and arbitrary identity headers are never authorization.
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.id || !user.email) return null;
    const fullName = typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim().slice(0, 120) || null
      : null;
    return { userId: user.id, email: user.email, displayName: fullName ?? user.email, fullName };
  } catch { return null; }
});

export async function requireUser(returnTo: string): Promise<AppUser> {
  const user = await getUser();
  if (user) return user;
  redirect(signInPath(returnTo));
}
