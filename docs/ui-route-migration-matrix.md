# ProjectSpice UI Route Migration Matrix

Last updated: April 28, 2026

This matrix audits the current `app/routes/*.tsx` human-facing UI surfaces for the ProjectSpice UI refactor. It records shell eligibility, behaviors that must survive the reskin, and the closest designer handoff match from `zips/design_handoff_projectspice`.

## Migration Rules

- **Shell eligible** means the route should eventually render inside the authenticated `AppShell` with shared sidebar/top bar.
- **Opt out** means the route should intentionally avoid the authenticated shell because it is auth, onboarding, or kitchen takeover UI.
- **Resource only** routes in `app/routes/*.ts` are outside the visual migration, except where their behavior supports an in-scope UI.
- Preserve existing loader/action behavior first; the UI refactor should not rewrite data ownership, family visibility, import parsing, offline queuing, or AI improvement contracts unless a later slice explicitly calls for it.

## Route Matrix

| Route | File | Shell | Current behaviors to preserve | Handoff match |
| --- | --- | --- | --- | --- |
| `/` and `/home` | `app/routes/home.tsx` | Eligible | Redirects signed-in users without onboarding to `/onboarding`; shows signed-out login entry; provides quick links to recipes, lists, planner, and imports; includes logout form. | Home dashboard |
| `/login` | `app/routes/login.tsx` | Opt out | Redirects already signed-in users; validates email/password; creates session; sends incomplete users to onboarding. | Tokenized auth |
| `/change-password` | `app/routes/change-password.tsx` | Opt out or minimal account shell | Requires auth; verifies current password; validates confirmation; updates hashed password. | Tokenized account form |
| `/logout` | `app/routes/logout.tsx` | Opt out | Session destroy endpoint; no visual surface. | None |
| `/recipes` | `app/routes/recipes.tsx` | Eligible | URL-backed `q`, `tag`, `sort`, `scope`, `showArchived`, and `page`; mine/family/shared access semantics; archived cookbook filtering; recipe image thumbnails; pagination; tag chips; links to settings, stats, planner, and new recipe. | Recipe Library |
| `/recipes/new` | `app/routes/recipes.new.tsx` | Eligible | Requires auth; title validation; user-unique slug generation; ingredient parsing through `parseIngredientLine`; tag creation/linking; difficulty, visibility, source, timing, servings, notes. | Recipe creation form |
| `/recipes/:id` | `app/routes/recipes.$id.tsx` | Eligible | Owner or family-visible read access; soft-delete restore/delete owner actions; cook count; variants; logs; tags; scaling; inline ingredient quantity preference; shopping-list/add/improve/edit/cook actions; source/copyright/family sharing constraints. | Recipe Detail |
| `/recipes/:id/edit` | `app/routes/recipes.$id.edit.tsx` | Eligible | Owner-only access; title validation; ingredient reparse and replace; tag suggestions; difficulty, visibility, timing, servings, source, notes; redirects back to detail. | Recipe edit form |
| `/recipes/:id/cook` | `app/routes/recipes.$id.cook.tsx` | Opt out | Full-screen mode; owner/family access; wake lock; keyboard and tap-zone navigation; text size toggle; mise checklist; timers with audio; exit confirmation for running timers; quick log; offline log queue. | Cooking Mode |
| `/recipes/:id/improve` | `app/routes/recipes.$id.improve.tsx` | Eligible | Owner-only original recipe access; loads AI profiles, quota, variants; streams SSE improvement requests; field-level accept/reject state; saves accepted output as variant; preserves original recipe. | AI Improve / Variants |
| `/logs/new` | `app/routes/logs.new.tsx` | Eligible | Requires auth; recipe selector; rating, notes, modifications, date; optional recipe linking. | Cooking memories/log form |
| `/logs/:id` | `app/routes/logs.$id.tsx` | Eligible | Owner-only log access; recipe backlink; photo upload to R2; photo deletion from R2 and DB; rating display; notes/modifications. | Cooking memories/detail |
| `/stats` | `app/routes/stats.tsx` | Eligible | Requires auth; cooking cadence, stat tiles, top recipes, recent logs, date formatting; empty state linking to log flow. | Quiet stats with editorial accents |
| `/meal-planner` | `app/routes/meal-planner.tsx` | Eligible | Requires auth; week planning; add/drop/move/update/delete entries; meal slots; recipe chooser; generate shopping list. | Planning surface |
| `/shopping-lists` | `app/routes/shopping-lists.tsx` | Eligible | Requires auth; create/delete lists; active/completed grouping; family share creation; recipe handoff via query param. | Shopping list index |
| `/shopping-lists/:id` | `app/routes/shopping-lists.$id.tsx` | Eligible | Owner or shared-family access; share/unshare; complete/uncomplete; check/uncheck with fetchers; remove item; add manual item; add ingredients from an accessible recipe; aisle grouping; copy-link affordance. | Shopping list detail |
| `/cookbooks/:id` | `app/routes/cookbooks.$id.tsx` | Eligible | Owner-only cookbook access; archived badge; recipe list with images; remove recipe from cookbook; empty state. | Organization: cookbooks as sources |
| `/collections/:id` | `app/routes/collections.$id.tsx` | Eligible | Owner-only collection access; recipe list with images; add available recipes; remove recipes; move up/down ordering; empty state. | Organization: curated collections |
| `/settings` | `app/routes/settings.tsx` | Eligible | Requires auth; display preferences for inline quantities, high contrast, large font, reduced motion; navigation to management pages; export link; account link. | Dense Quiet settings |
| `/settings/tags` | `app/routes/settings.tags.tsx` | Eligible | Requires auth; tag counts; similar-tag suggestions; rename; delete; merge with collision handling. | Organization: tags as facets |
| `/settings/cookbooks` | `app/routes/settings.cookbooks.tsx` | Eligible | Requires auth; cookbook counts; create; rename; archive/unarchive; delete; active/archived grouping. | Organization: cookbook management |
| `/settings/collections` | `app/routes/settings.collections.tsx` | Eligible | Requires auth; collection counts; create; rename; delete; collection detail links. | Organization: collection management |
| `/settings/ai-profiles` | `app/routes/settings.ai-profiles.tsx` | Eligible | Requires auth; AI profile create/update/delete; preferences fields; used by improve flow. | AI settings supporting Improve |
| `/onboarding` | `app/routes/onboarding.tsx` | Opt out | Requires auth; recognizes completed users; supports Paprika-import path and start-fresh completion. | Guided onboarding |
| `/onboarding/cookbook-review` | `app/routes/onboarding.cookbook-review.tsx` | Opt out | Requires auth; reviews imported cookbooks; archive toggles; save/skip completion. | Guided migration review |
| `/imports/paprika` | `app/routes/imports.paprika.tsx` | Eligible | Requires auth; browser-side `.paprikarecipes` parsing; batch recipe import; optional photo upload batches; onboarding-aware return path; progress and error reporting. | Import Review foundation |
| `/imports/paprika-html` | `app/routes/imports.paprika-html.tsx` | Eligible | Requires auth; browser-side ZIP/HTML parse; batch import to API; no-photo caveat; progress and warning reporting. | Import Review foundation |
| `/imports/gpt` | `app/routes/imports.gpt.tsx` | Eligible | Requires auth; copy prompt; parses structured AI recipe text; duplicate slug handling; ingredient parsing; import tags; redirects to created recipe. | Import/manual AI source |
| `/imports/url` | `app/routes/imports.url.tsx` | Eligible | Requires auth; daily rate limit via import jobs; URL scrape; manual HTML paste fallback; best-effort image download to R2; import tags; redirects to created recipe. | Import Review source variant |
| `/imports/epub` | `app/routes/imports.epub.tsx` | Eligible | Requires auth; browser-side EPUB parse; candidate review/edit; select/deselect; bulk tag selected; imports selected candidates. | Import Review source variant |
| `/imports/pdf` | `app/routes/imports.pdf.tsx` | Eligible | Requires auth; upload to async PDF/OCR API; poll by import id; review/edit candidates; select/deselect; bulk tag selected; import selected candidates. | Import Review screen |

## Non-Human Routes

These routes should not enter the visual migration matrix except through the screens that call them:

| Route | File | Notes |
| --- | --- | --- |
| `/cdn/images/*` | `app/routes/cdn.images.$.ts` | Image delivery endpoint. Preserve for recipe/log media. |
| `/favicon.ico` | `app/routes/favicon.ico.ts` | Browser asset endpoint. |
| `/.well-known/appspecific/com.chrome.devtools.json` | `app/routes/chrome-devtools-json.ts` | Devtools metadata endpoint. |
| `/api/imports/*` | `app/routes/api.imports.*.ts` | Import backends for Paprika, Paprika HTML, EPUB, PDF, photos, and job status. |
| `/api/logs` | `app/routes/api.logs.ts` | Cooking log API used by quick log/offline sync. |
| `/api/export` | `app/routes/api.export.ts` | Data export endpoint surfaced from Settings. |
| `/api/recipes/:id/improve` | `app/routes/api.recipes.$id.improve.ts` | SSE AI improvement endpoint used by Improve route. |

## Coverage Notes

- The first shared-shell pass should cover all **Eligible** routes above, with `/recipes/:id/cook`, auth, and onboarding deliberately outside the shell.
- Legacy route-local headers are common across imports, settings, stats, collections, cookbooks, shopping, and recipe forms. They should collapse into `AppShell` navigation rather than be restyled independently.
- Current UI styling mixes tokenized classes (`bg-background`, `text-muted-foreground`) with legacy Tailwind grays (`bg-white`, `bg-gray-*`, `text-gray-*`). Later token and debt-scanner slices should treat both patterns deliberately.
- The designer handoff directly covers Home, Library, Detail, Cooking Mode, AI Improve / Variants, Import Review, Sidebar, and TopBar. Other routes should use those same primitives and Quiet operational layouts rather than inventing separate page systems.
