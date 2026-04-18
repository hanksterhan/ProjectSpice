# ProjectSpice

Personal recipe manager for 5 family accounts, built on Cloudflare Workers + React Router v7.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Cloudflare Workers |
| Framework | React Router v7 (SSR) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | D1 (Drizzle ORM, SLICE-2) |
| Sessions | KV |
| Images | R2 |
| Domain | spice.h6nk.dev (prod) |

## Development

```bash
pnpm install
pnpm dev           # Vite dev server with CF Worker dev proxy
```

## Environments

| Env | Deploy command | Domain |
|-----|----------------|--------|
| Local | `pnpm dev` | localhost:5173 |
| Staging | `pnpm deploy:staging` | *.workers.dev |
| Production | `pnpm deploy:prod` | spice.h6nk.dev |

## Key Commands

```bash
pnpm typecheck       # TypeScript check (also regenerates types)
pnpm lint            # ESLint
pnpm test            # Vitest
pnpm build           # Production build
pnpm cf-typegen      # Regenerate worker-configuration.d.ts
pnpm seed            # Seed local DB (requires SLICE-2)
```

## Cloudflare Resources to Provision

After `wrangler login`, run:

```bash
# D1 databases
wrangler d1 create projectspice-staging
wrangler d1 create projectspice-production

# KV namespaces
wrangler kv namespace create SESSIONS --env staging
wrangler kv namespace create SESSIONS --env production

# R2 buckets
wrangler r2 bucket create projectspice-images-staging
wrangler r2 bucket create projectspice-images-prod
```

Then fill in the IDs in `wrangler.jsonc` where it says `REPLACE_WITH_*`.

## Wrangler Secrets

Set per environment with `wrangler secret put <NAME> --env <ENV>`:

- `SESSION_SECRET` — cookie signing key
- `ANTHROPIC_OAUTH_TOKEN` — Claude Max subscription OAuth token (from `claude setup-token`)
- `OPENAI_CODEX_TOKEN` — Codex subscription OAuth token (from `codex login`)

For local dev: copy `.dev.vars.example` to `.dev.vars` and fill in values.

## GitHub Actions Secrets Required

- `CLOUDFLARE_API_TOKEN` — CF API token with Workers edit permissions
- `CLOUDFLARE_ACCOUNT_ID` — CF account ID

## Architecture

```
app/
  routes/         React Router route modules
  routes.ts       Route config
  root.tsx        Root layout
  app.css         Tailwind v4 + shadcn CSS variables

workers/
  app.ts          Cloudflare Worker entry point

scripts/
  seed.ts         Local DB seed (family accounts + sample recipes)
```

## Plan

Active plan: `~/workspaces/plans/active/projectspice-recipe-manager-plan.md`
