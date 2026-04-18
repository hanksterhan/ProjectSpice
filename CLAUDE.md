# ProjectSpice

Personal recipe manager for 5 family accounts on Cloudflare Workers + React Router v7.

**Full plan** (architecture, data model, Paprika import traps, AI spec, all slices):
`~/workspaces/plans/scratch/projectspice-recipe-manager-plan.md`

## Commands

```bash
pnpm dev           # local dev (localhost:5173)
pnpm typecheck     # TypeScript check
pnpm lint          # ESLint
pnpm test          # Vitest
pnpm seed          # seed local DB
```

## Architecture

```
app/
  routes/           React Router route modules
  lib/
    ingredient-parser.ts
    db/             Drizzle client + D1 Sessions API wrapper
workers/
  app.ts            CF Worker entry point
scripts/
  seed.ts
```

## Slice Status

| Slice | Status | Description |
|-------|--------|-------------|
| SLICE-1 | done | Remix scaffold + CF Workers + Tailwind + shadcn |
| SLICE-2 | done | Drizzle schema (21 tables) + D1 migrations + Sessions API wrapper |
| SLICE-3 | done | Auth — KV sessions, PBKDF2, login/logout, 5 family accounts seeded |
| SLICE-4 | done | Ingredient string parser subsystem (62 fixture tests) |
| SLICE-5 | next | Time string parser |

## Hard Constraints

- **Scope every DB query by `user_id`** — no exceptions
- **Use D1 Sessions API wrapper** after every mutation (prevents stale replica reads)
- **Soft-delete only** — filter `isNull(recipes.deletedAt)` in all list queries
- **Mobile-first on every UI slice** — verify on phone viewport before marking done
- **All ingredient strings through `parseIngredientLine()`** — never parse inline
- **AI is P2** — V1 ships no LLM features except URL-scraper fallback and GPT-markdown parse
