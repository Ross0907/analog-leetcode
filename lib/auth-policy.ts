/** Shared input policy; never treats a client supplied identity as authenticated. */
export type AuthMode = "signin" | "signup" | "reset";

export function safeReturnPath(value: unknown, fallback = "/profile"): string {
  if (typeof value !== "string" || value.length > 2048) return fallback;
  let decoded = value;
  for (let count = 0; count < 3; count += 1) {
    if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") || [...decoded].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return fallback;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { return fallback; }
  }
  try {
    const url = new URL(value, "https://anacode.invalid");
    const decodedUrl = new URL(decoded, "https://anacode.invalid");
    if (url.origin !== "https://anacode.invalid" || decodedUrl.origin !== url.origin) return fallback;
    // Password update is the one auth page allowed after a recovery callback.
    const reserved = /^(?:\/login(?:\/|$)|\/auth(?:\/|$)|\/(?:signin-with-chatgpt|signout-with-chatgpt|callback)(?:\/|$))/;
    if (decodedUrl.pathname !== "/auth/update-password" && reserved.test(decodedUrl.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

export function signInPath(returnTo = "/profile", mode: AuthMode = "signin"): string {
  const query = new URLSearchParams({ return_to: safeReturnPath(returnTo) });
  if (mode !== "signin") query.set("mode", mode);
  return `/login?${query}`;
}

export function isSameOriginAuthRequest(request: Request): boolean {
  if (request.method !== "POST") return false;
  const site = request.headers.get("sec-fetch-site");
  return request.headers.get("origin") === new URL(request.url).origin &&
    (!site || site === "same-origin" || site === "none");
}

export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validNewPassword(value: string): boolean {
  return value.length >= 12 && value.length <= 128;
}

export const AUTH_MESSAGES: Record<string, string> = {
  invalid: "Check the form fields and try again.",
  credentials: "Unable to sign in. Check your email and password.",
  unconfirmed: "Confirm your email before signing in. Check your inbox for the confirmation link.",
  unavailable: "Account access is temporarily unavailable. Please try again shortly.",
  configuration: "Account access has not been configured for this deployment yet.",
  rate_limit: "Too many attempts. Wait a little before trying again.",
  password: "Use a password between 12 and 128 characters and make sure both entries match.",
  weak_password: "Choose a stronger password. This password does not meet the account security requirements.",
  callback: "This email link is expired or could not be verified. Open it in the browser where you requested it, or request a new link.",
  session: "Sign in or open a fresh password reset email before changing your password.",
  reauthentication: "Please sign in again before changing your password.",
  confirm_email: "Check your inbox to confirm your email. Open the confirmation link in this browser, then continue signing in.",
  reset_email: "If an account exists for that email, a password reset link is on its way. Open the link in this browser.",
  password_updated: "Your password has been updated. You can sign in with your new password.",
  signed_out: "You have been signed out on this device.",
};

/** Query strings can select only registered messages, never object properties. */
export function authMessage(code: unknown): string | undefined {
  return typeof code === "string" && Object.hasOwn(AUTH_MESSAGES, code) ? AUTH_MESSAGES[code] : undefined;
}
