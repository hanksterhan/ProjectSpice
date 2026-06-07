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
   - Working tree is clean.

   If local `main` is behind and clean, run:

   ```bash
   git pull --ff-only origin main
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

3. Apply production D1 migrations.

   ```bash
   pnpm wrangler d1 migrations apply projectspice-v1-production --remote --env production
   ```

4. Dry-run production deployment.

   ```bash
   CLOUDFLARE_ENV=production pnpm build
   pnpm wrangler deploy --dry-run --env production
   ```

5. Deploy production.

   ```bash
   pnpm wrangler deploy --env production
   ```

6. Smoke-check production.

   ```bash
   curl -I https://spice.h6nk.dev/
   curl -I https://spice.h6nk.dev/ai
   ```

   Then, when browser tooling is available, open `https://spice.h6nk.dev/` and verify:
   - The recipe library loads.
   - A recipe detail page opens from the library.
   - Manual recipe create/edit/delete works.
   - The AI workbench returns a reviewable draft when `OPENAI_API_KEY` is configured.
   - No login prompt, auth cookie flow, upload UI, or R2-backed media flow appears.

## Reporting

End with:
- Deployed git commit SHA.
- Commands run and pass/fail result.
- Whether production D1 migrations were applied.
- Production URL.
- Any warnings, especially Wrangler warnings that did not fail the command.
