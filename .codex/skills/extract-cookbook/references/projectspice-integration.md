# ProjectSpice Cookbook Integration Reference

## Current Import Pipeline

Use the existing pipeline unless a cookbook exposes a structural gap:

- `app/server/cookbook-epub/cookbook-epub.extractor.ts` parses EPUB buffers into recipes, techniques, and image references.
- `app/server/cookbook-epub/cookbook-epub.types.ts` defines extracted recipe, technique, image, and metadata shapes.
- `scripts/import-cookbook-epub.mjs` turns extraction output into SQL, writes image assets, sets recipe source names, tags, chapter markers, and technique rows.
- `public/recipe-images/cookbooks/<book-slug>/` stores copied cookbook image assets.

The importer writes generated SQL to `/tmp/projectspice-cookbook-import.sql` by default. Dry-run first, then apply locally when audited.

## Source Names

Use `Author - Cookbook Title` when EPUB metadata provides a usable creator. Normalize publisher-style creator names when needed.

Examples:

- `Andrew Rea - Binging with Babish`
- `America's Test Kitchen - The Complete Guide to Healthy Drinks`

Delete old source names during replacement imports when the naming convention changes. Otherwise duplicate imported recipes remain under both old and new cookbook labels.

## Recipes

All recipe-shaped data must validate through `recipe-domain`.

Imported cookbook recipes should include:

- Stable imported ID derived from title plus book/entry key.
- `source.type = "imported"`.
- `source.name = Author - Cookbook Title`.
- Optional `imageUrl` only when image audit passes.
- Optional `imageUrls` containing the ordered gallery of all high-confidence recipe images. Include the primary image in this array; keep `imageUrl` as the first/gallery-card image for compatibility.
- Culinary tags plus optional hidden `chapter:<label>` markers.
- Folded `variations` for dependent variants.
- Stable direction step IDs and order numbers.

Avoid:

- Auth/user/session fields.
- Uploaded media infrastructure.
- R2 image pipelines.
- Fake cookbook tags.
- V2 import/scraping/shopping-list scope.

## Images

The importer writes only referenced assets. Keep filenames stable and filesystem-safe by slugging EPUB paths. Returned URLs should be under:

```text
/recipe-images/cookbooks/<book-slug>/<image-file>
```

Use the first extracted image as the recipe card/detail image. Keep image extraction conservative and auditable.

For multi-image cookbooks, write every referenced recipe image asset and preserve the extracted order in `recipe_json.imageUrls`. Do not add a separate DB column unless the UI needs gallery counts in summary rows; the canonical recipe JSON can carry the full gallery while `image_url` remains the primary summary image.

Second-pass image audit:

- Compare raw XHTML image blocks around representative recipes against generated `imageUrls.length`.
- Print the top recipes by image count and spot-check their primary image plus several gallery thumbnails.
- Inspect recipes with exactly `0` or `1` image when the raw source appears process-heavy.
- Confirm small process photos were not dropped merely because they are below the hero-photo byte threshold.
- Confirm decorative/title/chapter images did not enter galleries, especially when lowering thresholds for strong inline evidence.

When changing image heuristics, add regression tests with concrete recipes. Current important examples:

- `Philly Cheesesteak Sandwiches` uses Babish `p036.jpg`.
- `Pizza Sauce` uses Babish `p034.jpg`.
- `Meatballs` has no image.
- `simple fruit smoothie` uses Healthy Drinks `Reference_Page_021_Image_0001.jpg`.
- `milk kefir` uses page 227.
- `tepache` uses page 224.
- `kombucha` uses page 229 and must not use front-matter page `vi`.
- `Mango Lassi` was previously identified by the user as a recipe that should not receive a picture.
- Salad Lab `Panzanella` uses `images/00065.jpg`, not the following potato salad image.
- Salad Lab `French-Style Potato Salad` uses `images/00100.jpg`.
- Salad Lab `Fattoush` uses `images/00091.jpg`.
- Salad Lab standalone image pages must not cascade backward into the previous recipe segment.
- Morimoto `Vegetable Temaki` preserves all five small inline process photos.
- Morimoto `Spicy Tuna Temaki` preserves six inline process photos.
- Morimoto `HAKUMAI: PERFECT WHITE RICE` and `BATTERA: PRESSED MACKEREL SUSHI` are useful gallery-count checks for page-spanning process images.

## Tags And Cookbook Chapters

The library cookbook tree is built from imported recipe `source.name`.

Use hidden `chapter:<label>` tags to represent cookbook chapters. `recipe-library.ts` resolves those markers into cookbook tree chapter rows and hides them from visible tag facets.

Keep visible tags food-oriented. The importer currently infers a small vocabulary:

- `Beverage`
- `Fermented`
- `Dessert`
- `Bread`
- `Sauce`
- `Salad`
- `Curry`
- `Snacks`
- `Fish`
- `Protein`
- `Vegetarian`

Prefer conservative title-driven tags. Ingredient text can identify broad `Protein` and `Vegetarian`, but should not make incidental ingredients dominate the tag list. For example, anchovy paste should not turn a turkey burger into `Fish`, and breadcrumbs should not turn meatballs into `Bread`.

## Sidebar And Library Behavior

The cookbook tree is author -> cookbook -> chapter. Chapter clicks filter results using `cookbook` plus `chapter`, not visible tag filters.

Important UX decisions from prior sessions:

- The left navigation tree must not collapse to only the filtered result set. Build navigation from the complete recipe library while filtering only the results pane.
- The `hideCookbooks=1` filter is URL-backed and belongs in the left organizer drawer under Cookbooks.
- The recipe count in the library header should reflect filtered result count only.
- `Techniques` is a direct left-drawer destination, not a top-nav item and not nested under a cookbook.
- Do not make Techniques expandable until there is enough volume and a useful type/topic grouping.

## Techniques

Cookbook techniques persist in `cookbook_techniques` with:

- `id`
- `slug`
- `title`
- `summary`
- `technique_type`
- `source_name`
- `source_document_path`
- `page_number`
- `image_url`
- `blocks_json`
- `tags_json`
- timestamps and soft-delete field

Technique tags should include:

- `technique`
- the technique type
- cookbook chapter tags when available

Technique pages render blocks as paragraphs, lists, callouts, and tables. Preserve tables when the source has structured timing/temperature/ratio information.

## Tests To Update

Update or run these as appropriate:

```bash
pnpm test app/server/cookbook-epub/__tests__/cookbook-epub.extractor.test.ts
pnpm test app/modules/library/__tests__/recipe-library.test.ts
pnpm test app/server/recipes/__tests__/recipe.service.test.ts
pnpm test
pnpm lint
pnpm typecheck
```

Add regression coverage when:

- A new EPUB class pattern is needed for recipe detection.
- A specific image match was wrong or missing.
- A recipe with multiple real images imported with too few `imageUrls`.
- Small inline/caption-linked process photos require lower thresholds than nearby fallback images.
- A no-image recipe was incorrectly assigned a decorative/title image.
- A split-file cookbook has standalone image-only documents before recipe title pages or multiple image-only pages between neighboring recipes.
- A variant was duplicated as a recipe.
- A technique title needs contextual disambiguation.
- A chapter marker must be hidden from normal tag facets.

## Local Data Verification

After applying an import locally, query or inspect:

- Distinct `source_name` values for old duplicates.
- Counts by `source_name`.
- Counts by hidden `chapter:<label>` markers.
- Rows containing fake tags such as `cookbook`, `cookbook-recipe`, or `cookbook:<slug>`.
- Representative recipe JSON for tags, variations, image URL, and source.
- Representative recipe image URLs and `imageUrls.length` for known risky neighboring runs, especially where adjacent recipe photos could shift backward or forward or where process-photo grids should produce galleries.
- Technique rows for `source_name`, `technique_type`, `blocks_json`, and `image_url`.

Keep generated image assets only when referenced by imported rows.
