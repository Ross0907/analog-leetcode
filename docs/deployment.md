# GitHub Actions and Cloudflare deployment

The application deploys to the existing Cloudflare Worker **anacode**. Pull requests run validation only. The deploy job runs after successful validation on a push to `main`; creating this feature branch or its pull request does not deploy it. To retry deployment after configuring settings, choose **Run workflow**, select `main`, and enable **deploy**. Manual runs on a feature branch cannot deploy, and manual runs without that option only validate. The separate GitHub Pages workflow publishes only the static project showcase.

## Required production configuration

In the **application repository**, open Settings → Secrets and variables → Actions. Configure:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare token allowed to deploy the Worker in the selected account. |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | The 32-character Cloudflare account ID. |
| Variable | `D1_DATABASE_ID` | The real existing D1 database UUID. Local placeholder IDs are rejected. |
| Variable | `D1_DATABASE_NAME` | That database's name. |

Secrets belonging to a different GitHub repository or to an unselected GitHub environment are not automatically available to this workflow. The `github-pages` environment belongs to the showcase workflow. Do not move application credentials into it to work around an application deployment failure. The application deploy job currently uses repository secrets and variables; an intentionally selected application environment can be added when its exact name and access policy are known.

If another developer configured the application, first identify the Cloudflare account that owns the existing `anacode` Worker and D1 database. Have the account owner grant suitable access or provide a scoped deployment token through GitHub's secret settings. Confirm that `CLOUDFLARE_ACCOUNT_ID` and the D1 variables belong to that same account. Secrets already stored on that Worker can stay there: neither the workflow nor the account owner needs to recover and print their values. Access to a different developer's Cloudflare account does not transfer automatically with GitHub repository access.

The Worker also requires these three runtime secrets:

| Name | Required value |
| --- | --- |
| `SUPABASE_URL` | The production Supabase project's HTTPS origin. |
| `SUPABASE_PUBLISHABLE_KEY` | A Supabase publishable key, or a legacy public `anon` JWT. Never a secret/service-role key. |
| `RATE_LIMIT_HMAC_SECRET` | At least 32 bytes of strong random data for the grading rate limiter. |

There are two supported ways to supply them. Existing values stored as **secrets** in the Cloudflare Worker dashboard are preserved and inherited. Alternatively, store any of these values as GitHub repository secrets with the same names; Actions supplies only those nonempty values to Wrangler's `--secrets-file`, applying them atomically with the Worker deployment. The temporary file is created outside the checkout and removed after the attempt. Runtime secret values are not injected into the build step or printed in logs. Leaving a GitHub runtime secret empty preserves its existing Worker value.

The generated configuration declares `secrets.required`. Pinned Wrangler 4.132.0 refuses a deployment if any required secret is absent from both the existing Worker and the supplied file. It reports the missing **names**. The workflow also rejects missing Cloudflare credentials, placeholder D1 IDs, mismatched generated bindings, an unexpected Worker name, and missing CircuitJS asset routing. A missing setting produces a failed deploy job, not a successful skipped deployment.

If an existing Worker uses only `SUPABASE_ANON_KEY`, copy the same public `anon` value into a Worker secret named `SUPABASE_PUBLISHABLE_KEY`, or replace it with a publishable key. The application still accepts the legacy alias locally, but the production deployment contract requires the canonical name so the guard can verify it. No Supabase database password or service-role credential is needed.

## Initialize a new D1 database

Create/select the database in the same Cloudflare account and set its ID and name as the repository variables above. Before the first public launch, apply the three checked-in SQL migrations in `drizzle/` in order using Cloudflare's normal D1 administration workflow. They create account/progress tables, stored grading results, and the shared rate-limit table. Existing databases must be checked against their migration history before applying pending migrations; do not recreate an existing schema.

The deployment workflow does **not** run remote database migrations or reset databases. Its generated binding points to the selected existing database. Missing tables will prevent durable grading and saved progress even when the Worker code deploys successfully. Complete Supabase email, redirect URL and SMTP setup using [the account guide](supabase.md), then verify signup, email confirmation, sign-in, recovery, sign-out and persisted grading on the real site.

## Reproduce CI locally

Install the locked dependencies and Chromium, then run `npm run test:e2e`. Playwright starts `scripts/start-e2e-server.mjs`, which creates a unique local D1 database under `.wrangler/e2e/`, applies the real migrations with `--local --persist-to`, and creates a throwaway HMAC key beside the isolated test configuration. Cloudflare Vite uses that same persistence directory with remote bindings disabled. Developer credential files and production databases are untouched. The ordinary production rate limiter stays enabled during grading tests.

Set `ANACODE_E2E_PORT` to use another local port. A managed test run refuses to reuse an unrelated server. Set `ANACODE_E2E_EXTERNAL_SERVER=1` only when deliberately testing an already configured preview; that preview must provide its own local D1 schema and rate-limit key.

Validation includes the complete dependency graph, a blocking `npm audit --audit-level=high`, lint, types, real simulator/provenance tests, rendered output, browser flows, and the production bundle. Simulator provenance is intentionally pinned; upgrading the engine also requires reviewing and updating its artifact evidence.

Deployment additionally runs `node scripts/audit-simulator-provenance.mjs --release`. This gate fails for an artifact whose redistribution requirements have not been cleared, even if its runtime hash and numerical tests pass. A releasable build must include the reviewed corresponding sources, models, notices and matching runtime evidence. The gate addresses the recorded simulator licensing/source gaps and must not be disabled to obtain a green deployment.

Official references: [Cloudflare secrets and atomic secret files](https://developers.cloudflare.com/workers/configuration/secrets/), [Wrangler configuration and required secrets](https://developers.cloudflare.com/workers/wrangler/configuration/), [shared local persistence](https://developers.cloudflare.com/workers/local-development/local-data/), and [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
