---
name: deploy-spice
description: Deploy ProjectSpice current main to Cloudflare production. Use when the user asks to deploy ProjectSpice, deploy spice.h6nk.dev, push current main to Cloudflare, run the production release checklist, or verify a production deployment for this repo.
---

# Deploy Spice

Deploy the current `main` branch of ProjectSpice to Cloudflare production at
`https://spice.h6nk.dev/`.

## Guardrails

- Work from `/Users/hhan/workspaces/ProjectSpice` unless the user explicitly gives another checkout.
- Deploy only from `main`.
- Never print, read aloud, or commit secrets. `.dev.vars` and `.env*` remain private.
- Stop and ask before deploying if local commits are unpushed, the branch is not `main`, verification fails, migrations fail, or `git pull --ff-only` cannot fast-forward.
- Do not modify app code as part of deployment unless the user explicitly asks for a fix.
- Treat production D1 migrations and `wrangler deploy --env production` as live production changes.
- Treat production recipe seeding as a live production D1 write. Run it only when the deployment includes seed/corpus changes, production is missing expected seed rows, or the user explicitly asks to seed production.
- If a production D1 command fails, run read-only Wrangler diagnostics before concluding auth/resource failure:
  `pnpm wrangler whoami`, `pnpm wrangler d1 list`, and a read-only
  `pnpm wrangler d1 execute projectspice-v1-production --remote --command "SELECT name FROM sqlite_master LIMIT 5"`.

## Checklist

1. Confirm repository state.

   ```bash
   git status --short --branch
   git fetch origin
   git status --short --branch
   ```

   Required state before continuing:
   - Branch is `main`.
   - `main` is not behind `origin/main`.
   - `HEAD` equals `origin/main`, unless the user has explicitly approved deploying an unpushed local commit.
   - Working tree is clean.

   If local `main` is behind and clean, run:

   ```bash
   git pull --ff-only origin main
   ```

   Record the exact deploy target SHA before verification:

   ```bash
   git rev-parse HEAD
   git rev-parse origin/main
   ```

2. Run local verification.

   ```bash
   pnpm test
   pnpm lint
   pnpm typecheck
   pnpm build
   ```

   Note: Wrangler may print sandbox log-file `EPERM` warnings for
   `~/Library/Preferences/.wrangler/logs/...`. Treat them as non-blocking only
   when the command exits with code `0`.

3. Check and apply production D1 migrations.

   ```bash
   pnpm wrangler d1 migrations list projectspice-v1-production --remote --env production
   ```

   If Wrangler reports `No migrations to apply`, record that and continue.
   Only run apply when pending migrations are listed:

   ```bash
   pnpm wrangler d1 migrations apply projectspice-v1-production --remote --env production
   ```

4. Check production recipe seed state.

   Generate the current seed SQL without applying it:

   ```bash
   pnpm seed:recipes:sql
   ```

   Check the current production recipe count:

   ```bash
   pnpm wrangler d1 execute projectspice-v1-production --remote --env production --command "SELECT COUNT(*) AS count FROM recipes WHERE deleted_at IS NULL"
   ```

   If the deployment includes changes to recipe fixtures, seed scripts, or other seedable corpus data, or if production is missing expected seed rows, stop and ask before applying the production seed unless the user already explicitly requested it. The production seed is insert-or-ignore and should not overwrite existing recipe rows:

   ```bash
   pnpm seed:recipes:production
   ```

   After applying, rerun the production recipe count and record the before/after counts.

5. Dry-run production deployment.

   ```bash
   CLOUDFLARE_ENV=production pnpm build
   pnpm wrangler deploy --dry-run --env production
   ```

6. Deploy production.

   ```bash
   pnpm wrangler deploy --env production
   ```

7. Smoke-check production.

   ```bash
   curl -I https://spice.h6nk.dev/
   curl -I https://spice.h6nk.dev/ai
   ```

   Accept either:
   - `200` responses from the Worker, or
   - `302` redirects to `h6nk.cloudflareaccess.com` with `www-authenticate: Cloudflare-Access`, which means the Worker route is live but the domain is protected by Cloudflare Access.

   Then, when browser tooling is available, open `https://spice.h6nk.dev/` and verify:
   - The recipe library loads.
   - A recipe detail page opens from the library.
   - Manual recipe create/edit/delete works.
   - The AI workbench returns a reviewable draft when `OPENAI_API_KEY` is configured.
   - No app-level login prompt, auth cookie flow, upload UI, or R2-backed media flow appears. Cloudflare Access login is external and may appear before the app.

   When checking whether a frontend change reached production, verify the deployed asset content or visible UI, not only the Worker version. For CSS/JS changes, fetch the current production asset named in the build output or page markup and search for a selector/string that only exists in the new build.

## Reporting

End with:
- Deployed git commit SHA.
- Whether deployed `HEAD` matched `origin/main`.
- Commands run and pass/fail result.
- Whether production D1 migrations were applied.
- Whether production recipe seed was checked or applied, including before/after counts when applied.
- Production URL.
- Any warnings, especially Wrangler warnings that did not fail the command.
