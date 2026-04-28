# ProjectSpice

ProjectSpice is a personal and family recipe manager built with React Router v7 on Cloudflare Workers. It is designed around Henry's real Paprika corpus, offline kitchen use, family accounts, recipe improvement workflows, shopping lists, and trustworthy export.

The full implementation plan is archived at:

```text
~/workspaces/plans/done/projectspice-recipe-manager-plan.md
```

## Stack

- React Router v7
- React 19
- Tailwind CSS v4
- Cloudflare Workers
- Cloudflare D1 for relational data
- Cloudflare KV for sessions and AI cache/quota state
- Cloudflare R2 for recipe/log images and import files
- Cloudflare Queues for asynchronous PDF import work
- Drizzle ORM with the D1 driver
- Vitest for unit tests
- Playwright for desktop/mobile smoke tests

## Features

ProjectSpice currently includes:

- Email/password auth with five seeded family accounts
- Onboarding for returning Paprika users and new users
- Recipe CRUD with manual entry and editing
- Recipe list with FTS5 search, sorting, pagination, tags, archived cookbook filtering, and Mine/Family/Shared with You scopes
- Recipe detail with grouped ingredients, scaling controls, metadata, variants, and inline ingredient popovers
- Paprika `.paprikarecipes` importer
- Paprika HTML directory/ZIP importer
- GPT markdown recipe importer
- URL import with structured-data extraction and paste-HTML fallback
- Tags, similarity suggestions, and merge workflow
- Cookbooks with archived state
- Collections
- Offline recipe cache through service worker + IndexedDB
- Cooking mode with Wake Lock, tap zones, swipe/keyboard navigation, multi-timers, text sizing, and mise-en-place checklist
- Cooking logs, free-form logs, quick log sheet, and log photos
- R2-backed image serving through `/cdn/images/*`
- Shopping lists with aisle grouping, recipe ingredient import, mobile check-off, completion, and family sharing
- Data export ZIP with JSON, Paprika-compatible HTML, and Schema.org JSON-LD
- AI profile management
- AI recipe improvement UI with SSE endpoint, profile comparison, diff accept/reject, copy-as-variant, cache/quota, and `ai_runs` audit
- Inline ingredient mapping in directions
- Guided EPUB import
- PDF cookbook import flow with OCR/Workers AI hooks and deterministic fallback
- AI-suggested tagging during import
- Cooking cadence stats
- Meal planner with weekly shopping-list generation
- Accessibility controls and high-contrast/reduced-motion support
- Image optimization with WebP variants and performance audit

Important AI note: the interface and token-chain runtime are implemented. Workers AI primary is intentionally truth-labeled as deferred unless a Cloudflare Workers AI binding is explicitly wired and verified.

## Repository Layout

```text
app/
  components/         Shared React components
  db/                 Drizzle schema and D1 Sessions API wrapper
  lib/                Parsers, import/export helpers, offline helpers, AI helpers
  routes/             React Router route modules and API/resource routes
drizzle/              D1 SQL migrations and Drizzle metadata
public/sw.js          Service worker
scripts/              Seed, readiness, smoke setup, performance, truth-test scripts
tests/e2e/            Playwright smoke tests
workers/app.ts        Cloudflare Worker entry point
wrangler.jsonc        Local, staging, and production Cloudflare bindings
```

## Prerequisites

Install:

- Node.js compatible with the repo dependencies
- `pnpm`
- A Cloudflare account with Wrangler authentication for remote deploys

Then install dependencies:

```bash
pnpm install
```

`pnpm install` also attempts to regenerate Cloudflare runtime types with `pnpm cf-typegen`.

## Local Environment

Create a local `.dev.vars` file from the example:

```bash
cp .dev.vars.example .dev.vars
```

Required local variables:

```text
SESSION_SECRET=...
ANTHROPIC_OAUTH_TOKEN=...
OPENAI_CODEX_TOKEN=...
```

For normal local app work, `SESSION_SECRET` is required. The AI tokens are required for exercising the implemented AI improvement runtime path. Do not commit `.dev.vars` or `.env`; both are ignored.

## Local Database and Seed Data

Apply D1 migrations locally:

```bash
pnpm db:migrate
```

Seed the local database:

```bash
pnpm seed
```

The seed script creates five family accounts and ten sample recipes. It prints the local bootstrap credentials when it runs.

For smoke tests, use:

```bash
pnpm smoke:setup
```

That applies local migrations, reseeds the local DB, and uploads a tiny local R2 smoke image.

## Run Locally

Start the development server:

```bash
pnpm dev
```

The app runs at:

```text
http://localhost:5173
```

For Playwright's default web server path, the app is started on:

```text
http://127.0.0.1:5173
```

## Common Development Commands

```bash
pnpm test          # Vitest unit/regression tests
pnpm lint          # ESLint
pnpm typecheck     # Wrangler types + React Router types + TypeScript build
pnpm build         # Production build, then scrub secret-bearing build artifacts
pnpm smoke:e2e     # Playwright desktop/mobile smoke suite
pnpm perf:audit    # Performance/readiness audit for images, cache, bundle, queries
pnpm paprika:truth # Local truth test against Henry's Paprika corpus, when data exists
```

Recommended full local gate before deploy:

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

For the release smoke path:

```bash
pnpm smoke:e2e
```

The Playwright config starts the local app automatically unless `PROJECTSPICE_SMOKE_BASE_URL` is set.

## Paprika Corpus Import

Henry's primary Paprika export path is expected at:

```text
/Users/hhan/workspaces/RecipeBookParser/data/MyRecipes.paprikarecipes
```

The app's preferred import path is the native `.paprikarecipes` file. The HTML export importer remains as fallback.

The local truth-test command validates parser/import behavior against the real corpus:

```bash
pnpm paprika:truth
```

Use the in-app `/imports/paprika` route for the actual product import flow.

## Cloudflare Configuration

Cloudflare bindings live in `wrangler.jsonc`.

Local bindings:

- D1: `DB`
- KV: `SESSIONS`
- R2: `IMAGES`
- Queue: `PDF_IMPORT_QUEUE`
- Vars: `ENVIRONMENT=development`

Staging:

- Worker: `projectspice-staging`
- D1: `projectspice-staging`
- KV: `SESSIONS`
- R2 bucket: `projectspice-images-staging`
- Queue: `projectspice-pdf-import-staging`

Production:

- Worker: `projectspice-production`
- Domain: `spice.h6nk.dev`
- D1: `projectspice-production`
- KV: `SESSIONS`
- R2 bucket: `projectspice-images-prod`
- Queue: `projectspice-pdf-import-prod`

## Provision Cloudflare Resources

The repo includes convenience scripts for provisioning new staging/prod resources:

```bash
pnpm cf:provision:staging
pnpm cf:provision:prod
```

If you create new resources, update `wrangler.jsonc` with the actual resource IDs returned by Wrangler.

Required remote secrets for both staging and production:

```text
SESSION_SECRET
ANTHROPIC_OAUTH_TOKEN
OPENAI_CODEX_TOKEN
```

Set them with Wrangler:

```bash
pnpm exec wrangler secret put SESSION_SECRET --env staging
pnpm exec wrangler secret put ANTHROPIC_OAUTH_TOKEN --env staging
pnpm exec wrangler secret put OPENAI_CODEX_TOKEN --env staging

pnpm exec wrangler secret put SESSION_SECRET --env production
pnpm exec wrangler secret put ANTHROPIC_OAUTH_TOKEN --env production
pnpm exec wrangler secret put OPENAI_CODEX_TOKEN --env production
```

Check Cloudflare readiness:

```bash
pnpm cf:check --env staging --remote-secrets
pnpm cf:check --env production --remote-secrets
```

This validates configured resource IDs, env vars, and remote secret presence.

## Remote Migrations and Seeding

Apply staging migrations:

```bash
pnpm db:migrate:staging
```

Apply production migrations:

```bash
pnpm db:migrate:prod
```

Seed staging:

```bash
pnpm seed:staging
```

There is no dedicated `seed:prod` script. If production seeding is needed for bootstrap accounts, run the seed script deliberately with production env/remote flags after confirming the target DB, because the seed script clears existing seed data by deleting from `users`.

## Deploy to Staging

Run the local gate first:

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

Apply staging migrations:

```bash
pnpm db:migrate:staging
```

Deploy:

```bash
pnpm deploy:staging
```

`pnpm deploy:staging` runs the Cloudflare readiness check with remote secrets, builds with `CLOUDFLARE_ENV=staging`, and deploys with Wrangler.

Run smoke tests against staging:

```bash
PROJECTSPICE_SMOKE_BASE_URL=https://projectspice-staging.henryhan62.workers.dev pnpm smoke:e2e
```

If a staging custom domain is wired, use that URL instead.

## Deploy to Production

Production is configured for:

```text
https://spice.h6nk.dev
```

Before deploying:

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm build
pnpm db:migrate:prod
pnpm cf:check --env production --remote-secrets
```

Deploy:

```bash
pnpm deploy:prod
```

Run smoke tests against production:

```bash
PROJECTSPICE_SMOKE_BASE_URL=https://spice.h6nk.dev pnpm smoke:e2e
```

Production deploys use `workers_dev=false` and the custom domain route in `wrangler.jsonc`.

## Full Corpus Release Path

For a production release intended to import Henry's full Paprika library:

1. Run the full local gate.
2. Run `pnpm paprika:truth` locally with the real corpus available.
3. Apply staging migrations and deploy staging.
4. Run smoke tests against staging.
5. Apply production migrations and deploy production.
6. Run smoke tests against `https://spice.h6nk.dev`.
7. Sign in as Henry.
8. Use `/imports/paprika` with `/Users/hhan/workspaces/RecipeBookParser/data/MyRecipes.paprikarecipes`.
9. Verify recipe count, search, representative images, tags/cookbooks, export, and rollback readiness.

Rollback for a bad import is based on `import_job_id`: delete rows associated with the failed import job.

## Access Control Rules

Recipe visibility:

- `private`: owner only
- `family`: visible to signed-in family users
- `link` / `public`: schema-supported future modes, not the current family-sharing path

Owner-only recipe actions:

- Edit
- Delete/restore
- AI improve/apply variant

Family-visible recipe actions:

- View
- Cook mode
- Create personal cooking log
- Add ingredients to shopping lists

PDF/EPUB-sourced recipes may be shared within the household, but public signed-link sharing is intentionally blocked.

Shopping lists can be family-shared through rows in the `shares` table with `resource_type='shopping_list'` and `shared_with_user_id IS NULL`.

## AI Runtime Notes

Implemented AI surfaces:

- `/settings/ai-profiles`
- `/recipes/:id/improve`
- `/api/recipes/:id/improve`
- Profile compare
- Field-level diff accept/reject
- Apply-as-copy recipe variants
- Version panel
- KV cache/quota
- `ai_runs` audit rows

Required configured credentials:

- `ANTHROPIC_OAUTH_TOKEN`
- `OPENAI_CODEX_TOKEN`

Workers AI primary is not currently the verified primary runtime. Keep product copy truthful unless a Workers AI binding and runtime path are added and tested.

## Data and Migrations

Schema lives in:

```text
app/db/schema.ts
```

D1 migrations live in:

```text
drizzle/
```

Generate migrations after schema changes:

```bash
pnpm db:generate
```

Apply local migrations:

```bash
pnpm db:migrate
```

Apply remote migrations:

```bash
pnpm db:migrate:staging
pnpm db:migrate:prod
```

`createDb()` in `app/db/index.ts` wraps Cloudflare's D1 Sessions API. Use it instead of constructing a raw Drizzle client.

## Images and Offline

App-owned images should be served through:

```text
/cdn/images/*
```

Use helpers in:

```text
app/lib/image-url.ts
```

The service worker caches recipe detail pages, app assets, and app-owned images. Offline recipe data is mirrored into IndexedDB for recently viewed recipes. Offline cooking logs are queued and replayed when the app reconnects.

## Testing Notes

Vitest covers parsers, import/export helpers, AI helpers, offline log sync, image URL rules, release-truth checks, family-sharing policy, and more.

Playwright smoke tests cover the core happy path on desktop and mobile:

- Login
- Onboarding redirect handling
- Recipe list/search/detail
- Edit/save
- Cooking mode
- Quick log
- Shopping list
- Export
- Image route 200

Run local smoke:

```bash
pnpm smoke:e2e
```

Run smoke against a deployed target:

```bash
PROJECTSPICE_SMOKE_BASE_URL=https://example.com pnpm smoke:e2e
```

## Troubleshooting

If typecheck fails because generated types are stale:

```bash
pnpm cf-typegen
pnpm exec react-router typegen
```

If local smoke data is missing:

```bash
pnpm smoke:setup
```

If a build creates secret-bearing artifacts, `pnpm build` should remove them through `scripts/scrub-build-secrets.ts`. Do not commit anything under `build/`.

If a Cloudflare deploy fails before upload, run:

```bash
pnpm cf:check --env staging --remote-secrets
pnpm cf:check --env production --remote-secrets
```

If R2 images do not render, confirm the object exists in the correct bucket and the app URL uses `/cdn/images/*`, not stale `/images/*`.

## Git Hygiene

Ignored generated/local files include:

- `node_modules/`
- `build/`
- `.wrangler/`
- `.react-router/`
- `test-results/`
- `playwright-report/`
- `.dev.vars`
- `.env`
- `*.tsbuildinfo`
- `worker-configuration.d.ts`

Keep README and `CLAUDE.md` current when operational commands, deploy flow, access-control rules, or feature reality changes.
