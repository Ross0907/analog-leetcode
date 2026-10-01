ANACODE - SUPABASE SETUP FOR THE OWNER
====================================

1. Save SETUP-SUPABASE.bat on your Windows computer.
2. Double-click it. You do NOT need to install Node, Git or developer tools,
   and you do NOT need to run it as administrator.
3. Follow the numbered steps. Paste values into the window when asked.
   Hidden token/key prompts do not show pasted characters; that is normal.
4. Before changing an account, the helper shows the target and changes.
   Type YES only after checking them. Pressing Enter skips that change.
5. Read the report saved on your Desktop and finish any TODO / LIVE TEST steps.

GET THESE READY
--------------
- The actual application homepage, such as https://your-app.workers.dev.
  Use the Cloudflare app, not the GitHub Pages project/showcase page.
- Access to the EXISTING Supabase project used by that app.
  Find its Project URL and publishable key through Connect or Settings > API.
  A legacy anon key also works. Never use the service_role or secret key.
- Access to the Cloudflare account that owns the existing app, if you want
  the helper to connect its settings too. The Worker name defaults to anacode.
- A mail provider's SMTP settings and a verified sender domain for public
  confirmation and password-reset emails. The helper opens the relevant
  dashboard and checks whether a custom sender has been configured.

If the other developer owns either account, ask them to grant you access or
run this helper themselves. GitHub access alone does not grant that access.
Do not create replacement projects just to get past a permission error:
existing users and their identities belong to the original Supabase project.

WHAT THE HELPER DOES
-------------------
- Checks that the public Supabase key belongs to a reachable project.
- Optionally uses a temporary Supabase personal access token to set the
  production Site URL, add the app callback, enable email signup, require
  email confirmation and set a password minimum of at least 12 characters.
- Preserves existing redirects, stronger password minimums, SMTP details,
  templates, other providers, users and database contents.
- Optionally allows localhost:3000 for development.
- Optionally connects an EXISTING Cloudflare Worker by updating the two
  Supabase secrets together. It creates a random RATE_LIMIT_HMAC_SECRET only
  when that binding does not already exist. Other bindings are preserved.
- Writes a report with outcomes and remaining steps. No keys or tokens are
  written to the report, temporary files, or command-line arguments.

It does not install software, merge branches, upload application code,
create projects, configure GitHub Actions secrets, or run database migrations.
Cloudflare may create a new Worker version when its secrets change; check
the active deployment. Secret changes can affect a running website's login.

TEMPORARY ACCESS TOKENS
-----------------------
The helper opens the token pages and explains which permissions to select.

Supabase: https://supabase.com/dashboard/account/tokens
Use a token named AnaCode setup. If fine-grained tokens are available, select
only the app's project, with Auth Config read/write and Project Settings
read/write. Classic tokens are broader, so revoke the setup token afterward.

Cloudflare: https://dash.cloudflare.com/profile/api-tokens
Use Account > Workers Scripts > Edit for only the account that owns the app.
Use an API token, not the Global API Key. Revoke this temporary setup token
afterward; leave a separately managed GitHub deployment token intact.

The file uses Windows' built-in PowerShell with a process-only execution
policy setting. It does not change the computer's permanent policy. Tokens
are kept in process memory during the run, then discarded. Run it privately
on your own computer, not in a recorded/shared terminal.

FINISH THESE IN THE BROWSER
--------------------------
1. Configure your SMTP provider and verify its sender domain. Keep Supabase
   confirmation and recovery links using {{ .ConfirmationURL }}. Avoid
   provider link tracking that rewrites those links.
2. Open the app's signup page, create an account with your own inbox and open
   the confirmation email in the SAME browser that requested it.
3. Sign in, refresh Profile, sign out, and test Forgot password. Open the reset
   email in that same browser too, then test the new password.
4. Submit a challenge and refresh Profile to confirm progress is saved.
   Progress needs the separate Cloudflare D1 database and its migrations.
5. Revoke temporary setup tokens, even if setup stopped partway through.

PASS means a particular configuration check passed. The helper cannot prove
email delivery or a complete live login until you test it with your inbox.
It flags existing CAPTCHA settings because this version of the application
does not yet submit CAPTCHA tokens; ask the developer to integrate it.

IF LOGIN STILL SAYS IT IS NOT CONFIGURED
---------------------------------------
- Confirm that this is the Cloudflare app URL, not the GitHub Pages showcase.
- Confirm that the deployed app includes the Supabase login changes.
- Check the active Worker's SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY secrets.
- If a later GitHub deployment replaces them, ask the maintainer to remove
  stale same-named GitHub secret overrides or update them to the same project.
- Send the Desktop report to your developer. Do not send access tokens.

Official references checked when building this helper:
https://supabase.com/docs/reference/api/v1-update-auth-service-config
https://supabase.com/docs/guides/platform/personal-access-tokens
https://supabase.com/docs/guides/auth/redirect-urls
https://supabase.com/docs/guides/auth/auth-smtp
https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/bulk_update/
