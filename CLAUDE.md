# ProjectSpice Agent Notes

ProjectSpice is a completed personal/family recipe manager on React Router v7 + Cloudflare Workers, D1, KV, R2, and Queues. The delivery plan is complete and archived at `~/workspaces/plans/done/projectspice-recipe-manager-plan.md`.

## Critical Commands

```bash
pnpm dev              # local app on localhost:5173
pnpm db:migrate       # apply local D1 migrations
pnpm seed             # seed 5 family accounts + sample recipes
pnpm test             # Vitest
pnpm lint             # ESLint
pnpm typecheck        # wrangler/react-router/tsc type generation + checks
pnpm build            # production build + secret-artifact scrubber
pnpm smoke:e2e        # Playwright desktop/mobile smoke path
```

## Hard Constraints

- Access control is not simply `recipes.user_id = current user`: family-visible recipes can be viewed/cooked/logged/list-added by other family users. Owner-only operations still require ownership.
- Keep recipe public sharing stricter than family sharing: PDF/EPUB-sourced recipes may be shared with family but must not get public signed-link sharing.
- Use `createDb()` from `app/db/index.ts`; it wraps D1 Sessions API for read-after-write consistency.
- Filter soft-deleted recipes with `isNull(recipes.deletedAt)` or equivalent SQL in all user-facing recipe reads.
- All ingredient parsing goes through `parseIngredientLine()`.
- App-owned images should route through `/cdn/images/*` and `app/lib/image-url.ts`.
- Never commit secrets. `.dev.vars`, `.env`, build output, Wrangler state, generated types, and TS build info are ignored.

## Current Feature Reality

The AI interface exists: `/settings/ai-profiles`, `/recipes/:id/improve`, SSE improvement endpoint, profile compare, field diff accept/reject, copy-as-variant, KV quota/cache, and `ai_runs` audit. Workers AI primary remains truth-labeled as deferred unless a binding is explicitly wired; the implemented runtime path uses configured Anthropic/OpenAI token-chain credentials.

Family sharing exists: recipe `visibility` supports private/family views, `/recipes` has Mine/Family/Shared with You scopes, and shopping lists can be family-shared through `shares`.
