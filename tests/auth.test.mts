import assert from "node:assert/strict";
import test from "node:test";
import { authMessage, safeReturnPath, isSameOriginAuthRequest, validNewPassword } from "../lib/auth-policy";
import { readSupabaseConfig } from "../lib/supabase/config.server";
import { createRequestSupabase } from "../lib/supabase/request.server";
import { handleAuthAction, handleAuthCallback } from "../lib/auth-actions.server";

const origin = "https://anacode.example";
const config = { url: "https://example.supabase.co", key: "sb_publishable_test_key" };
const user = { id: "b375cc7e-5d44-460d-8a57-3e047f5682c7", email: "engineer@example.com", aud: "authenticated", role: "authenticated", created_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Engineer" }, app_metadata: { provider: "email" } };
const createContext = (request: Request) => createRequestSupabase(request, config);

test("auth message queries ignore inherited object properties and unknown values", () => {
  for (const value of ["__proto__", "constructor", "toString", "hasOwnProperty", "unregistered", undefined, ["callback"]]) {
    assert.equal(authMessage(value), undefined);
  }
  assert.match(authMessage("callback")!, /could not be verified/);
});

function tokenResponse(expiresIn = 3600) {
  const expiry = Math.floor(Date.now() / 1000) + expiresIn;
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, aud: "authenticated", role: "authenticated" })).toString("base64url"),
    "test-signature",
  ].join(".");
  return { access_token: token, refresh_token: "test-refresh-token", token_type: "bearer", expires_in: expiresIn, expires_at: expiry, user };
}

function formRequest(action: string, fields: Record<string, string> = {}, cookie = "") {
  return new Request(`${origin}/auth/actions/${action}`, { method: "POST", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(fields) });
}

function responseCookies(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

test("return destinations reject external URLs, encoded separators, control characters, and auth loops", () => {
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/%5Cevil.example", "/%2Fevil.example", "/%252Fevil.example", "/\n/evil.example", "/auth/callback", "/login", "/callback", "/foo/../auth/actions/signout"]) {
    assert.equal(safeReturnPath(value), "/profile", value);
  }
  assert.equal(safeReturnPath("/problems/rc-low-pass?tab=scope#plot"), "/problems/rc-low-pass?tab=scope#plot");
  assert.equal(safeReturnPath("/auth/update-password"), "/auth/update-password");
  assert.equal(safeReturnPath("/"), "/");
});

test("configuration requires a project URL and a publishable or legacy anon key, refusing service keys", () => {
  assert.equal(readSupabaseConfig({}), null);
  assert.deepEqual(readSupabaseConfig({ SUPABASE_URL: config.url, SUPABASE_PUBLISHABLE_KEY: config.key }), config);
  assert.equal(readSupabaseConfig({ SUPABASE_URL: "http://public.example", SUPABASE_PUBLISHABLE_KEY: config.key }), null);
  assert.equal(readSupabaseConfig({ SUPABASE_URL: config.url, SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden" }), null);
  const legacyKey = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert.equal(readSupabaseConfig({ SUPABASE_URL: config.url, SUPABASE_ANON_KEY: legacyKey("service_role") }), null);
  assert.ok(readSupabaseConfig({ SUPABASE_URL: config.url, SUPABASE_ANON_KEY: legacyKey("anon") }));
  assert.ok(validNewPassword("a good long passphrase"));
  assert.equal(validNewPassword("short"), false);
});

test("auth writes require a same-origin POST and a bounded form body before touching Auth", async () => {
  let factoryCalls = 0;
  const unusedFactory = async () => { factoryCalls += 1; return null; };
  assert.equal(isSameOriginAuthRequest(new Request(`${origin}/auth/actions/signout`)), false);
  const crossSite = new Request(`${origin}/auth/actions/signin`, { method: "POST", headers: { origin: "https://evil.example" }, body: "x" });
  assert.equal((await handleAuthAction(crossSite, "signin", unusedFactory)).status, 403);
  const oversized = formRequest("signup", { email: "a".repeat(17_000) });
  const response = await handleAuthAction(oversized, "signup", unusedFactory);
  assert.equal(new URL(response.headers.get("location")!).searchParams.get("error"), "invalid");
  assert.equal(factoryCalls, 0);
});

test("missing Supabase configuration fails honestly instead of establishing a fake account", async () => {
  const response = await handleAuthAction(formRequest("signin", { email: user.email, password: "correct password" }), "signin", async () => null);
  assert.equal(response.status, 303);
  assert.match(response.headers.get("location")!, /error=configuration/);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("real Supabase SDK sign-in persists HttpOnly secure cookies, safely redirects, and verifies server identity", async (t) => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url, init });
    assert.equal(url.origin, config.url);
    if (url.pathname.endsWith("/token")) return Response.json(tokenResponse());
    if (url.pathname.endsWith("/user")) return Response.json(user);
    throw new Error(`Unexpected Auth endpoint ${url.pathname}`);
  });
  const response = await handleAuthAction(formRequest("signin", { email: user.email, password: "correct password", return_to: "//evil.example" }), "signin", createContext);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${origin}/profile`);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const cookieHeaders = response.headers.getSetCookie();
  assert.ok(cookieHeaders.some((value) => value.startsWith("sb-example-auth-token=")));
  assert.ok(cookieHeaders.every((value) => /HttpOnly/i.test(value) && /Secure/i.test(value) && /SameSite=Lax/i.test(value)));
  assert.equal(calls[0].url.searchParams.get("grant_type"), "password");
  const context = await createContext(new Request(`${origin}/profile`, { headers: { cookie: responseCookies(response), "oai-authenticated-user-id": "forged-user" } }));
  const verified = await context!.client.auth.getUser();
  assert.equal(verified.data.user?.id, user.id);
  assert.equal(calls.at(-1)?.url.pathname, "/auth/v1/user");
});

test("signup stores a PKCE verifier and waits for confirmation instead of pretending the user is signed in", async (t) => {
  let body: Record<string, unknown> | undefined;
  let signupUrl: URL | undefined;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    signupUrl = new URL(input instanceof Request ? input.url : String(input));
    body = JSON.parse(String(init?.body));
    return Response.json(user);
  });
  const response = await handleAuthAction(formRequest("signup", { email: user.email, full_name: "Engineer", password: "correct password", confirm_password: "correct password", return_to: "/lab" }), "signup", createContext);
  assert.match(response.headers.get("location")!, /message=confirm_email/);
  assert.equal(body?.code_challenge_method, "s256");
  assert.ok(body?.code_challenge);
  assert.ok(response.headers.getSetCookie().some((cookie) => cookie.startsWith("sb-example-auth-token-code-verifier=")));
  const callback = new URL(signupUrl!.searchParams.get("redirect_to")!);
  assert.equal(callback.origin, origin);
  assert.equal(callback.pathname, "/auth/callback");
  assert.equal(callback.searchParams.get("return_to"), "/lab");
});

test("password recovery uses PKCE and callback exchange returns to the password form with a verified session", async (t) => {
  let sentVerifier = "";
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.pathname.endsWith("/recover")) {
      assert.equal(body.code_challenge_method, "s256");
      const callback = new URL(url.searchParams.get("redirect_to")!);
      assert.equal(callback.searchParams.get("return_to"), "/auth/update-password");
      return Response.json({});
    }
    assert.equal(url.searchParams.get("grant_type"), "pkce");
    assert.equal(body.auth_code, "valid-email-code");
    sentVerifier = body.code_verifier;
    return Response.json(tokenResponse());
  });
  const requested = await handleAuthAction(formRequest("reset-password", { email: user.email }), "reset-password", createContext);
  assert.match(requested.headers.get("location")!, /message=reset_email/);
  const callback = await handleAuthCallback(new Request(`${origin}/auth/callback?code=valid-email-code&return_to=%2Fauth%2Fupdate-password`, { headers: { cookie: responseCookies(requested) } }), createContext);
  assert.equal(callback.headers.get("location"), `${origin}/auth/update-password`);
  assert.ok(sentVerifier.length > 20);
  assert.ok(callback.headers.getSetCookie().some((cookie) => cookie.startsWith("sb-example-auth-token=")));
});

test("password changes reject an unverified session", async (t) => {
  let authCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { authCalls += 1; throw new Error("No remote call expected"); });
  const response = await handleAuthAction(formRequest("update-password", { password: "new secure password", confirm_password: "new secure password" }), "update-password", createContext);
  assert.match(response.headers.get("location")!, /error=session/);
  assert.equal(authCalls, 0);
});

test("password changes verify the session and matching confirmation before updating the real SDK user", async (t) => {
  let updates = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/token")) return Response.json(tokenResponse());
    assert.equal(url.pathname, "/auth/v1/user");
    if (init?.method === "PUT") {
      updates += 1;
      assert.equal(JSON.parse(String(init.body)).password, "new secure password");
    }
    return Response.json(user);
  });
  const signedIn = await handleAuthAction(formRequest("signin", { email: user.email, password: "correct password" }), "signin", createContext);
  const mismatch = await handleAuthAction(formRequest("update-password", { password: "new secure password", confirm_password: "different password" }, responseCookies(signedIn)), "update-password", createContext);
  assert.match(mismatch.headers.get("location")!, /error=password/);
  assert.equal(updates, 0);
  const response = await handleAuthAction(formRequest("update-password", { password: "new secure password", confirm_password: "new secure password" }, responseCookies(signedIn)), "update-password", createContext);
  assert.equal(response.headers.get("location"), `${origin}/profile?message=password_updated`);
  assert.equal(updates, 1);
});

test("signout invalidates the Supabase session and expires its cookie", async (t) => {
  let signedOut = false;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/token")) return Response.json(tokenResponse());
    if (url.pathname.endsWith("/logout")) { signedOut = true; assert.equal(url.searchParams.get("scope"), "local"); return new Response(null, { status: 204 }); }
    throw new Error(`Unexpected endpoint ${url.pathname}`);
  });
  const signedIn = await handleAuthAction(formRequest("signin", { email: user.email, password: "correct password" }), "signin", createContext);
  const signedOutResponse = await handleAuthAction(formRequest("signout", {}, responseCookies(signedIn)), "signout", createContext);
  assert.ok(signedOut);
  assert.match(signedOutResponse.headers.get("location")!, /message=signed_out/);
  assert.ok(signedOutResponse.headers.getSetCookie().some((cookie) => /Max-Age=0/i.test(cookie)));
});

test("expired access tokens refresh through the SDK and propagate the new cookies", async (t) => {
  let refreshes = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/user")) return Response.json(user);
    if (url.searchParams.get("grant_type") === "refresh_token") { refreshes += 1; return Response.json(tokenResponse()); }
    return Response.json(tokenResponse(1));
  });
  const signedIn = await handleAuthAction(formRequest("signin", { email: user.email, password: "correct password" }), "signin", createContext);
  const context = await createContext(new Request(`${origin}/profile`, { headers: { cookie: responseCookies(signedIn) } }));
  const verified = await context!.client.auth.getUser();
  assert.equal(verified.data.user?.id, user.id);
  assert.ok(refreshes >= 1);
  const response = context!.finish(new Response(null));
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(context!.requestHeaders().get("cookie")!, /sb-example-auth-token=/);
});

test("invalid credentials and callback errors never expose provider detail or tokens", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: "invalid_credentials", msg: "private provider detail" }, { status: 400 }));
  const response = await handleAuthAction(formRequest("signin", { email: user.email, password: "correct password" }), "signin", createContext);
  assert.match(response.headers.get("location")!, /error=credentials/);
  assert.doesNotMatch(response.headers.get("location")!, /private|password|token/);
  const callback = await handleAuthCallback(new Request(`${origin}/auth/callback?error_description=private+provider+detail`), createContext);
  assert.match(callback.headers.get("location")!, /error=callback/);
  assert.doesNotMatch(callback.headers.get("location")!, /private/);
});
