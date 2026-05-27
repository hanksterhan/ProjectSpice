# ProjectSpice Agent Notes

ProjectSpice is restarting as a small Cloudflare-native V1 recipe workbench. The rebuild plan is:

`/Users/hhan/workspaces/plans/scratch/project-spice-v1-modular-rebuild-plan.md`

The previous full-featured family recipe manager remains recoverable through git history. Do not recreate its breadth by default.

## V1 Product Scope

V1 should prove a focused loop:

- Create, edit, save, view, and delete recipes.
- Keep every recipe shaped by one canonical recipe schema.
- Make ingredients and directions structured, readable, and pleasant to edit.
- Let AI generate or transform recipes into a reviewable draft before save.

Explicitly defer imports, scraping, shopping lists, meal planning, family sharing, public sharing, uploaded media pipelines, nutrition, pantry, cooking logs, and complex AI provider routing.

## Architecture Defaults

- Use React Router v7 on Cloudflare Workers with D1, Drizzle, and KV where needed.
- Keep the module map domain-first: `recipe-domain`, `recipe-editor`, `recipe-viewer`, `library`, `ai-workbench`, `persistence`, `auth-session`, `ui-shell`, and `deployment`.
- Route code should call services; services should call repositories; repositories own D1 details.
- All recipe-shaped data must validate through `recipe-domain`.
- V1 is single-user and private. Do not add login, users, sessions, passwords, or auth middleware unless the plan changes.
- Store optional recipe images as lightweight `imageUrl` strings only. Do not wire R2 uploads or image transforms in V1.
- Use one narrow AI provider adapter. Validate structured AI JSON with Zod and require user review before save.

## Critical Commands

These commands may change as the rebuild lands; keep this list current.

```bash
pnpm dev
pnpm db:migrate
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Hard Constraints

- Preserve clarity over feature breadth.
- Do not create documents by default; report work in the conversation unless explicitly asked or acceptance criteria require a file.
- Never commit secrets. `.dev.vars`, `.env`, build output, Wrangler state, generated types, TS build info, and packaged zips should stay ignored.
- Keep Cloudflare deployment concerns visible early, but avoid wiring deferred V2 infrastructure unless a V1 slice truly needs it.
