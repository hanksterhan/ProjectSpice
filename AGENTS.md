# ProjectSpice Agent Notes

ProjectSpice is being rebuilt as a small, modular, AI-native recipe workbench. The north star is a modern Paprika-style app with clearer recipe management and Codex/GPT support for creating and transforming recipes.

Read the plan before substantial implementation:

- Execution plan: `/Users/hhan/workspaces/plans/active/project-spice-v1-modular-rebuild-plan.md`
- Review/prototype plan: `/Users/hhan/workspaces/plans/scratch/project-spice-v1-modular-rebuild-plan.html`

The previous full-featured app remains recoverable through git history. Do not preserve old complexity unless a current V1 slice explicitly needs it.

## V1 Scope

Build only the focused recipe loop:

- Create, edit, save, view, and delete recipes.
- Store every recipe in one canonical schema.
- Make ingredients and directions structured, readable, and pleasant to edit.
- Let AI generate or transform recipes into reviewable drafts before save.
- Track lightweight recipe metadata: favorites, 0.1-granularity ratings, and cooked dates.
- Deploy to Cloudflare for `spice.h6nk.dev`.

Defer imports, scraping, shopping lists, meal planning, family sharing, public sharing, uploaded media pipelines, nutrition, pantry, login, and complex AI provider routing.

## Architecture Rules

- Prefer small domain modules: `recipe-domain`, `recipe-editor`, `recipe-viewer`, `library`, `ai-workbench`, `ui-shell`, and server modules for `db`, `recipes`, and `ai`.
- Routes call services. Services call repositories. Repositories own D1 details.
- All recipe-shaped data validates through `recipe-domain`.
- V1 is single-user and private. Do not add users, sessions, passwords, or auth middleware.
- Store recipe images as optional `imageUrl` strings only. Do not add R2 uploads or image transforms in V1.
- Use one narrow Codex/GPT provider adapter. AI output must validate with Zod and remain a draft until accepted.

## Recipe Intake

- Recipe intake lives in `app/modules/ai-workbench/project-spice-recipe-intake.ts`; keep the system prompt, output spec, and parser in sync with `recipe-domain`.
- The intake UI is reachable from New Recipe and must preview parsed drafts before saving.
- Accept common ChatGPT/Claude paste artifacts where practical, including markdown JSON fences, curly quotes, omitted optional fields, and null optional fields.
- Direction steps should keep stable ids, explicit order numbers, ingredient refs when reliable, and quantities in the step text when known.

## Recipe Fixtures

- Use the canonical `recipe-domain` fixtures when building schema, persistence, seed, library, viewer, editor, and AI draft tests.
- A converted Paprika corpus is available at `app/modules/recipe-domain/paprika-chilled-desserts.fixtures.ts`, sourced from `zips/chilled_desserts.paprikarecipes`.
- The Paprika corpus contains 16 chilled dessert recipes already normalized into the Project Spice `Recipe` schema. Use it for realistic fixture and seed coverage instead of inventing placeholder recipes.
- Embedded Paprika photo/base64 payloads are intentionally excluded. V1 may add lightweight `imageUrl` mock assignments later, but should not reintroduce uploaded media, R2, or image transforms.
- Keep large fixture corpora out of normal runtime barrels unless a feature explicitly needs them; prefer direct imports in tests, seed scripts, or fixture-specific modules.

## Commands

Keep this list current as the rebuild changes scripts.

```bash
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Working Rules

- Optimize for clarity over breadth.
- Keep slices small and aligned with the plan.
- Do not create documents by default; use conversation reports unless the user asks for a file or acceptance criteria require one.
- Never commit secrets. `.dev.vars`, `.env`, build output, Wrangler state, generated types, TS build info, and packaged zips should stay ignored.
- Keep Cloudflare deployment visible early, but do not wire V2 infrastructure unless a V1 slice requires it.
