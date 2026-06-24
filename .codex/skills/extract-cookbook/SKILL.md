---
name: extract-cookbook
description: This skill should be used when extracting cookbook EPUB files into ProjectSpice recipes, single or multi-image recipe galleries, cookbook chapters, and cookbook techniques, including auditing image matches, variants, deduplication, and sidebar/library integration.
---

# Extract Cookbook

Use this skill to turn a cookbook EPUB into ProjectSpice data that feels native in the recipe library. Prioritize a careful, auditable extraction over a blind bulk import.

## Start Here

1. Read `references/extraction-playbook.md` before changing extractor logic or running an import.
2. Read `references/projectspice-integration.md` before touching ProjectSpice schema, importer, image output, tags, cookbook chapters, techniques, sidebar behavior, or tests.
3. Inspect the target EPUB structure before assuming it matches previous books. Check OPF metadata, spine order, nav/TOC, XHTML class names, pagebreak markers, image paths, captions, timing/yield blocks, and representative recipe pages.
4. Work chapter by chapter. Confirm recipe counts, chapter labels, image coverage, and technique candidates for each chapter before applying data broadly.
5. Treat the first import as a draft. Audit representative rows and images before applying to local D1 or committing generated assets.
6. Always do a second image-assignment pass for new cookbook structures. Compare the raw spine order, standalone image-only documents, image-before-heading pages, image-after-recipe pages, interstitial/process/table-spread images, generated SQL `imageUrl`/`imageUrls`, per-recipe image counts, and several opened bitmap assets against neighboring recipe titles.

## Core ProjectSpice Rules

- Store cookbook identity in `source.name`, usually `Author - Cookbook Title`; do not encode cookbook identity as normal recipe tags.
- Store cookbook chapter membership as internal `chapter:<label>` tags so the library can render chapter rows under the cookbook tree. Keep those markers out of visible tag facets.
- Use ordinary tags only for culinary facets such as `Protein`, `Vegetarian`, `Beverage`, `Dessert`, `Sauce`, `Bread`, `Fermented`, `Fish`, `Salad`, `Curry`, and `Snacks`.
- Preserve recipe timing metadata when available. Populate `times.prepMinutes`, `times.cookMinutes`, and `times.totalMinutes` from explicit prep/cook/total blocks; total time is not always present, but should be filled whenever the book provides it.
- Prefer no image over a bad image. Do not attach title cards, chapter headers, captions, decorative art, indexes, or low-confidence placeholders.
- Accept that some real recipes do not have a picture.
- Use captions, image anchors, page numbers, inline image placement, and nearby context to assign images to the right recipe. Reuse an image for only one recipe unless there is strong book evidence that the image truly represents multiple entries.
- Preserve multiple real recipe images when the cookbook provides them, especially process-photo sequences, step grids, or same-caption image runs. Keep the first high-confidence image as `imageUrl` and store the ordered gallery in `imageUrls`.
- Beware photo-only split files and back-to-back image pages. Some EPUBs place a recipe photo in a standalone document immediately before that recipe's title, while decorative or second photos can sit between recipes. Segment boundaries must prevent the previous recipe from stealing the next recipe's lead image.
- Beware same-file interstitial images between recipes. A full-page/process/table-spread image immediately before a recipe title may belong to the previous recipe or to the chapter/book as a spread, especially when the next recipe also has its own post-title image. Prefer the post-title recipe photo for the next recipe and only pull a pre-title image forward when the raw layout proves that is the book's recipe-photo convention.
- Do not let general table spreads or multi-recipe beauty shots become a specific recipe's primary image unless the book explicitly ties that spread to the recipe. If the image contains several finished dishes or process examples from neighboring recipes, either assign it backward to the recipe that introduced the process sequence or exclude it.
- Fold small recipe variants into the parent recipe `variations` array when they are presented as variations of a base recipe. Do not create duplicate standalone recipes for those variants.
- Record techniques separately from recipes when the content teaches a process, formula, table, checklist, troubleshooting guide, or reusable reference knowledge without a full recipe ingredient/direction structure.
- Techniques are first-class reference content in ProjectSpice. Keep them available through `/techniques` and the left drawer, not hidden under a cookbook submenu.

## Current Code Anchors

- EPUB extraction: `app/server/cookbook-epub/cookbook-epub.extractor.ts`
- EPUB extraction types: `app/server/cookbook-epub/cookbook-epub.types.ts`
- EPUB import and image writing: `scripts/import-cookbook-epub.mjs`
- Extractor tests and regression examples: `app/server/cookbook-epub/__tests__/cookbook-epub.extractor.test.ts`
- Recipe schema and fixtures: `app/modules/recipe-domain/`
- Library cookbook tree and hidden chapter tags: `app/modules/library/recipe-library.ts`
- Cookbook techniques persistence: `app/server/db/migrations/0005_cookbook_techniques.sql`, `app/server/cookbook-techniques/`
- Techniques UI: `app/routes/techniques.tsx`, `app/routes/techniques.$slug.tsx`
- Cookbook image assets: `public/recipe-images/cookbooks/<book-slug>/`

## Standard Workflow

1. Inspect the EPUB metadata and structure.
2. Identify real book chapters from the nav/TOC or spine/page ranges.
3. Sample several pages per chapter, including at least one recipe with image, one recipe without image if present, one variant block, and one non-recipe technique/sidebar.
4. Update extractor heuristics only as needed for durable patterns, not one-off title hacks.
5. Run focused extractor tests and add regression assertions for new structural discoveries.
6. Dry-run the importer and inspect the JSON summary plus generated SQL for source names, chapter markers, tag shape, recipe count, timing coverage, technique count, warnings, and image file count.
7. Run the image second pass: inspect neighboring recipe/image runs around suspicious areas, especially recipes with no image, multiple candidate images, unexpectedly low/high `imageUrls` counts, image-before-title runs followed by an image-after-title, table-spread/process-grid images, or a primary image that visually resembles a neighboring recipe.
8. Audit generated images by opening representative assets and comparing them to recipe titles/captions/page numbers.
9. Apply locally only after the dry run looks right.
10. Verify local D1 rows for sources, chapters, hidden tags, representative recipes, timing columns/`recipe_json.times`, variants, techniques, and image URLs.
11. Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and any targeted visual checks needed for sidebar/library behavior.

## Useful Commands

```bash
pnpm test app/server/cookbook-epub/__tests__/cookbook-epub.extractor.test.ts
pnpm test app/modules/library/__tests__/recipe-library.test.ts
pnpm cookbook:import -- --out /tmp/projectspice-cookbook-import.sql "/absolute/path/to/book.epub"
pnpm cookbook:import -- --apply --local "/absolute/path/to/book.epub"
```

For multi-image audits, parse the generated SQL or local D1 rows into `title -> imageUrls.length` and inspect the top galleries plus known process-heavy recipes before applying or committing. Also inspect neighboring recipes where an image appears between two recipe titles; verify whether it belongs backward, forward, or to neither recipe before trusting the generated primary image.

Use `--remote` only when the user explicitly asks to update the remote Cloudflare D1 database.
