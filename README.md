# ProjectSpice

ProjectSpice is being rebuilt from a minimal V1 scaffold. The current app is a
small React Router + Cloudflare Worker baseline for the modular, AI-native recipe
workbench described in the active plan:

```text
/Users/hhan/workspaces/plans/active/project-spice-v1-modular-rebuild-plan.md
```

The old full-featured app remains recoverable through git history. Do not
reintroduce old routes, imports, auth, media pipelines, or family-sharing
infrastructure unless a current V1 slice explicitly asks for it.

## Current Scope

Milestone 1 contains only:

- React Router app shell
- Cloudflare Worker request handler
- One scaffold home route
- Minimal CSS
- Build, lint, typecheck, and test scripts
- Wrangler config without D1, KV, R2, queues, or auth bindings

## Run Locally

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Open:

```text
http://127.0.0.1:5173/
```

## Commands

```bash
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Repository Layout

```text
app/
  app.css
  entry.server.tsx
  root.tsx
  routes.ts
  routes/home.tsx
workers/
  app.ts
```
