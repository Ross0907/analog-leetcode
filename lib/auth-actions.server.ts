import { isSameOriginAuthRequest, safeReturnPath, signInPath, validEmail, validNewPassword, type AuthMode } from "./auth-policy";
import { createRequestSupabase, type RequestSupabase } from "./supabase/request.server";

type ContextFactory = (request: Request) => Promise<RequestSupabase | null>;
const ACTIONS = new Set(["signin", "signup", "reset-password", "update-password", "signout"]);
const MAX_FORM_BYTES = 16_384;

function redirectResponse(request: Request, path: string) {
  return new Response(null, { status: 303, headers: {
    location: new URL(path, new URL(request.url).origin).href,
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
  } });
}

function noticePath(mode: AuthMode, returnTo: string, kind: "error" | "message", code: string) {
  return `${signInPath(returnTo, mode)}&${kind}=${encodeURIComponent(code)}`;
}

function errorCode(error: { code?: string; status?: number; name?: string }, fallback: string) {
  if (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") return "rate_limit";
  if (error.code === "email_not_confirmed") return "unconfirmed";
  if (error.code === "weak_password") return "weak_password";
  if (error.code === "reauthentication_needed" || error.code === "reauthentication_not_valid") return "reauthentication";
  if ((error.status ?? 0) >= 500 || error.status === 0 || error.name === "AuthRetryableFetchError") return "unavailable";
  return fallback;
}

async function readForm(request: Request): Promise<URLSearchParams | null> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return null;
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding !== "identity") return null;
  const size = request.headers.get("content-length");
  if (size && (!/^\d+$/.test(size) || Number(size) > MAX_FORM_BYTES)) return null;
  if (!request.body) return new URLSearchParams();
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let count = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > MAX_FORM_BYTES) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    return new URLSearchParams(text + decoder.decode());
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function handleAuthAction(request: Request, action: string, createContext: ContextFactory = createRequestSupabase): Promise<Response> {
  if (!ACTIONS.has(action)) return new Response("Not found", { status: 404 });
  if (!isSameOriginAuthRequest(request)) return new Response("A same-origin form submission is required.", { status: 403, headers: { "cache-control": "no-store" } });
  const mode: AuthMode = action === "signup" ? "signup" : action === "reset-password" ? "reset" : "signin";
  const form = await readForm(request);
  const returnTo = safeReturnPath(form?.get("return_to"));
  const errorPath = (code: string) => action === "update-password"
    ? `/auth/update-password?error=${code}`
    : noticePath(mode, returnTo, "error", code);
  if (!form) return redirectResponse(request, errorPath("invalid"));
  const context = await createContext(request);
  if (!context) return redirectResponse(request, errorPath("configuration"));
  const finish = (path: string) => context.finish(redirectResponse(request, path));
  const { auth } = context.client;

  try {
    if (action === "signout") {
      const { error } = await auth.signOut({ scope: "local" });
      return finish(error ? errorPath(errorCode(error, "unavailable")) : noticePath("signin", returnTo, "message", "signed_out"));
    }
    const password = form.get("password") ?? "";
    if (action === "update-password") {
      const { data: { user }, error: userError } = await auth.getUser();
      if (userError || !user) return finish(noticePath("reset", "/profile", "error", "session"));
      if (!validNewPassword(password) || password !== form.get("confirm_password")) return finish(errorPath("password"));
      const { error } = await auth.updateUser({ password });
      if (error) return finish(errorPath(errorCode(error, "weak_password")));
      return finish("/profile?message=password_updated");
    }

    const email = (form.get("email") ?? "").trim();
    if (!validEmail(email)) return finish(errorPath("invalid"));
    const callback = new URL("/auth/callback", request.url);
    callback.searchParams.set("return_to", action === "reset-password" ? "/auth/update-password" : returnTo);

    if (action === "reset-password") {
      const { error } = await auth.resetPasswordForEmail(email, { redirectTo: callback.href });
      return finish(error ? errorPath(errorCode(error, "unavailable")) : noticePath(mode, returnTo, "message", "reset_email"));
    }
    if (action === "signup") {
      if (!validNewPassword(password) || password !== form.get("confirm_password")) return finish(errorPath("password"));
      const name = (form.get("full_name") ?? "").trim();
      if (!name || name.length > 120 || [...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return finish(errorPath("invalid"));
      const { data, error } = await auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: callback.href } });
      if (error) return finish(errorPath(errorCode(error, "unavailable")));
      // Projects with email confirmation enabled intentionally return no session.
      return finish(data.session ? returnTo : noticePath(mode, returnTo, "message", "confirm_email"));
    }
    if (!password || password.length > 128) return finish(errorPath("invalid"));
    const { error } = await auth.signInWithPassword({ email, password });
    return finish(error ? errorPath(errorCode(error, "credentials")) : returnTo);
  } catch {
    return finish(errorPath("unavailable"));
  }
}

export async function handleAuthCallback(request: Request, createContext: ContextFactory = createRequestSupabase): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get("return_to"));
  const code = url.searchParams.get("code");
  if (url.searchParams.has("error") || !code || code.length > 2048) {
    return redirectResponse(request, noticePath("signin", returnTo, "error", "callback"));
  }
  const context = await createContext(request);
  if (!context) return redirectResponse(request, noticePath("signin", returnTo, "error", "configuration"));
  try {
    const { error } = await context.client.auth.exchangeCodeForSession(code);
    return context.finish(redirectResponse(request, error ? noticePath("signin", returnTo, "error", errorCode(error, "callback")) : returnTo));
  } catch {
    return context.finish(redirectResponse(request, noticePath("signin", returnTo, "error", "unavailable")));
  }
}
