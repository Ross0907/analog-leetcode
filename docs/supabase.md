# Supabase accounts

AnaCode uses Supabase Auth for email/password accounts. Passwords and identity verification are handled by the official `@supabase/supabase-js` and `@supabase/ssr` clients. Application routes validate users with `auth.getUser()` before reading or writing account progress. Browser identity headers are ignored.

## Connect a project

Create or select a Supabase project, then copy its **Project URL** and **publishable API key** from the project connection/API settings. The required server environment values are:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_project_key
```

A legacy `anon` JWT may be supplied as `SUPABASE_ANON_KEY` instead. A secret key or `service_role` key must not be used; the configuration loader rejects these keys. No Supabase database password, service key, or admin credential is needed. There are no client environment variables to inject into the browser bundle.

For local Cloudflare development, put these values in the ignored `.dev.vars` file at the repository root and restart the development server. Portable Node runtimes read the same environment variable names from `process.env`.

For production, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as runtime secrets on the existing Cloudflare Worker using its Settings → Variables and Secrets screen or Wrangler with `--config dist/server/wrangler.json`. Worker secrets survive ordinary application deployments; configure them on each deployed environment. Keep credentials out of committed configuration and build artifacts. The static GitHub Pages project page does not run accounts; the Cloudflare application does.

Until valid configuration is present, the account page clearly says sign-in is unavailable and disables account form submission. Anonymous circuit practice remains usable. A successful build does not prove that a remote Supabase project or email provider is connected.

## Email configuration

1. Enable the **Email** provider and **Confirm email** in Supabase Authentication settings. Set the password minimum to at least 12 characters to match the application. Existing accounts can still sign in with their existing passwords.
2. Set **Site URL** to the production application's HTTPS origin.
3. Add the callback redirect URLs for each environment. The callback includes a `return_to` query, so use a narrowly scoped callback wildcard such as `https://your-app.example/auth/callback**`; for local testing add `http://localhost:3000/auth/callback**` (use the actual local port). Follow Supabase's redirect wildcard rules, and avoid unrestricted production host wildcards.
4. Keep confirmation and password recovery emails using Supabase's `{{ .ConfirmationURL }}` link. The application starts a PKCE flow, and Supabase redirects the confirmed email link to `/auth/callback?code=...`. Do not replace this with an implicit-token URL or a custom token-hash template without updating the callback implementation.
5. Configure a production SMTP provider in Supabase and verify the sender domain. Supabase's default sender is restricted and intended for testing; its delivery limits do not support a public launch.
6. Check Authentication → Rate Limits for the expected launch traffic. Supabase enforces authentication limits and the UI reports rate-limited requests without exposing provider details. If additional bot protection is needed, configure an edge rule for `/auth/actions/*` before enabling a Supabase CAPTCHA requirement; this version does not collect a CAPTCHA token.

Confirmation and recovery links must be opened in the same browser that requested them: PKCE binds the link to a verifier in that browser's cookie. An expired link, a scanner-consumed link, or a link opened in another browser shows a recoverable error. Users can request another reset link or sign in after confirmation. Existing confirmation emails remain usable until the provider expires them.

## Routes and session behavior

| Route | Purpose |
| --- | --- |
| `/login` | Sign in |
| `/login?mode=signup` | Create an account and send confirmation |
| `/login?mode=reset` | Request a password reset email |
| `/auth/callback` | Exchange the PKCE email code for a Supabase session |
| `/auth/update-password` | Choose a new password with a verified session |
| `/auth/actions/{action}` | Same-origin POST endpoints for signin, signup, reset-password, update-password, and signout |
| `/profile` | Verified account details and saved D1 progress |
| `/api/progress` | Verified user's solved problem slugs for the catalog; no-store and no email field |

The server handles all Auth SDK operations. Session and verifier cookies use `HttpOnly`, `SameSite=Lax`, root scope, and `Secure` on HTTPS. Server-only cookies prevent client scripts from reading tokens; there is deliberately no browser Supabase client. Middleware refreshes sessions and passes the updated cookie to both the current server request and browser response. Auth responses use `private, no-store`; do not enable CDN caching on account pages or session responses.

Each request creates a separate Supabase client. Sign-out is a POST operation and revokes the current device's refresh token through Supabase before expiring its cookie. Other devices stay signed in. Password updates use a server-verified session; Supabase may require fresh authentication according to project policy. POST requests require an exact same-origin `Origin` header, reject cross-site fetch metadata, and cap form bodies at 16 KiB. Return destinations are restricted to safe application paths.

## Saved progress

Supabase's verified user UUID is the identity key in the existing D1 `users`, `submissions`, and `user_problem_progress` tables. No Supabase SQL schema or RLS policy is required because this integration does not use Supabase's Data API. The grader preserves its existing D1 transactions, idempotency, and rate limits. Configure the existing `DB` binding and grading HMAC secret separately to persist submissions.

Accounts formerly identified only by platform headers are not automatically linked to a new Supabase account. Do not link historical progress by a browser-provided email or ID; any historical migration must verify ownership explicitly.

## Validation

`tests/auth.test.mts` exercises real Supabase SDK calls against a controlled HTTP fixture: sign-in cookies, signup PKCE verification, recovery/callback exchange, server user verification, token refresh, sign-out revocation, safe redirects, cross-site rejection, oversized bodies, configuration validation, and errors. Fixtures do not contact a real project or send email.

Before launching with a configured project, complete these live checks:

1. Create an account using an inbox you control and confirm its email in the same browser.
2. Sign in, refresh `/profile`, close/reopen the browser, and verify the session persists.
3. Submit a supported challenge and confirm the same attempt appears in the profile after refresh.
4. Sign out and verify `/profile` redirects to sign-in.
5. Request a password reset, follow the email, change the password, sign out, and verify only the new password works.
6. Test an expired callback, a wrong password, a rate-limited request, and another device to confirm the account remains isolated.

Live project access and an inbox are needed to verify delivery and the remote account lifecycle. A missing project must remain reported as unconfigured, never replaced with a simulated login.

Official references: [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [PKCE and server-side session behavior](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [password authentication](https://supabase.com/docs/guides/auth/passwords), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), and [SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp).
