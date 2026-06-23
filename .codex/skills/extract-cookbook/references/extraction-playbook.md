# Cookbook EPUB Extraction Playbook

## Purpose

Turn one or more cookbook EPUB files into high-confidence ProjectSpice recipe drafts, cookbook techniques, images, and chapter metadata. Preserve the cookbook's structure without importing noise.

## Lessons From Previous ProjectSpice Sessions

- The initial parser was built against `Binging with Babish` and `The Complete Guide to Healthy Drinks`; those books deliberately cover different EPUB shapes.
- `Binging with Babish` uses a broad `The Recipes` TOC section and many page-sliced XHTML files. Real recipe photos can be caption-linked or inline. Some real recipes, such as `Meatballs`, legitimately have no image.
- `The Complete Guide to Healthy Drinks` uses clear chapter files (`c01` to `c05`) and drove most of the technique, variant, page-number, and caption-linked image improvements.
- Image detection originally became too conservative, missing real photos for `milk kefir`, `tepache`, and `kombucha`. The fix was to use page-number evidence and caption links while still rejecting title-card/header images.
- Image detection also originally accepted bad images containing only words or chapter/title art. The preferred failure mode is no image.
- Cookbook import tags originally included fake bookkeeping labels such as `cookbook`, `cookbook:<slug>`, and `cookbook-recipe`; those were removed because source/cookbook identity belongs in `source.name` and the cookbook tree.
- Healthy Drinks variants such as `milk kefir with vanilla` and `sparkling mixed berry kombucha` should live as variations on the base recipe, not as duplicate recipe rows.
- Generic headings such as `best practices`, `brewing`, and `making your first batch` need context from nearby body text so they become useful technique titles like `kombucha best practices`, `tea brewing`, and `making your first batch of kombucha`.
- Techniques are not expandable in the sidebar yet. They are a direct reference section until there is enough volume to justify grouping by type or topic.

## EPUB Inspection Checklist

Inspect the EPUB before changing code:

- Locate `META-INF/container.xml`, the OPF package file, metadata title/creator/publisher, manifest, and spine.
- Identify nav/TOC files and whether chapters are explicit chapter XHTML files, page-sliced XHTML files, or anchor ranges within shared files.
- Inspect recipe page HTML for title classes, ingredient classes, yield text, method/direction classes, notes, sidebars, variants, captions, pagebreak spans, and image placement.
- Inspect image manifest paths and sizes. Page-numbered filenames are useful but must be verified against content.
- Compare TOC anchors and caption links. Many cookbook captions link from a figure/caption to a recipe heading anchor.
- Sample each major chapter rather than only the first recipe.

## Recipe Detection

Treat a segment as a recipe when it has:

- A plausible recipe heading, preferably with recipe-title class evidence.
- A yield or serving/makes/yields line.
- At least two ingredient-like lines.
- At least one direction/method/procedure/instruction line.

Avoid treating these as recipes:

- Chapter openers, TOC pages, indexes, copyright pages, tool guides, glossary pages, and decorative title pages.
- Technique or reference sections without ingredients and executable directions.
- Standalone variant headings that clearly belong under a base recipe.

## Chapter Extraction

Use real book structure for chapters:

- Prefer nav/TOC chapter labels when available.
- Use spine document names or page ranges only after checking they match the TOC.
- Encode chapter membership as `chapter:<label>` internal tags during import.
- Do not use culinary tags as chapter labels.
- For books with only one recipe section, use the real section label, such as `The Recipes`, instead of inventing topical chapters.

Known examples:

- `Andrew Rea - Binging with Babish`: `The Recipes`.
- `America's Test Kitchen - The Complete Guide to Healthy Drinks`: `Smoothies`, `Juices`, `Teas, Tisanes & More`, `Flavored Waters`, `Fermented, Soaked & Simmered`.

## Image Assignment

Rank evidence in this order:

1. Inline image inside the recipe segment.
2. Caption-linked image where the caption anchor points to the recipe heading.
3. Same-page or nearby-page image fallback for techniques, or for recipes only after explicit user acceptance and careful audit.

Score candidates with:

- Role strength: inline > caption-linked > nearby.
- Page distance from recipe heading.
- Image byte size as a weak proxy for real photography.
- Image order in the EPUB as a tie-breaker.
- Alt text when present.

Reject likely bad images:

- Roman-numeral front-matter images.
- Small assets under the current size threshold unless manual audit proves they are real.
- Images whose filenames/classes/captions indicate TOC, chapter opener, border, icon, logo, caption, or decorative art.
- Any image that visually contains only title text, chapter text, or design elements.

Deduplicate recipe images:

- Assign each image path to the highest-scoring recipe owner.
- Break ties toward the earlier recipe only if page/caption evidence is otherwise equal.
- If removing a duplicated image leaves a recipe empty, add or preserve a warning rather than forcing a weak fallback.

Accept no image:

- Some recipes in real cookbooks have no photo.
- A no-image recipe with solid ingredients/directions is better than a visually wrong image in the app.

## Variants

Fold variants into the parent recipe when:

- The book labels a section as `Variation` or uses variant-specific class names near a base recipe.
- The variant changes flavoring or small method details while depending on the parent recipe.
- The variant has instructions but not a full independent ingredient/direction structure.

Create separate recipes only when:

- The variant has its own full title, yield, ingredients, and directions.
- The book treats it as a separate TOC recipe rather than a sub-option.

Keep stable IDs for variation titles and steps.

## Techniques

Record a technique instead of a recipe when content is reusable reference knowledge:

- Process guide: how to brew, ferment, steep, simmer, whip, cream, soak, batch, or troubleshoot.
- Table: times, temperatures, ratios, formulas, charts.
- Checklist: best practices, tips, common mistakes.
- Formula/base: syrups, mixes, bases, master methods.
- Troubleshooting: over/under-fermented, texture failures, extraction issues.

Do not record noise:

- Tool shopping blurbs, generic 101 chapter openers, mini-TOC entries, indexes, and purely promotional text.
- Generic headings without enough body text unless the context gives them a specific, useful title.

Technique types currently used:

- `guide`
- `checklist`
- `formula`
- `table`
- `troubleshooting`

Technique blocks can be paragraphs, lists, callouts, headings, and tables. Preserve useful tables instead of flattening them into prose.

## Audit Loop

After extraction, inspect:

- Total recipe count vs TOC recipe count.
- Total technique count and whether technique titles are specific.
- Warnings for no-image recipes.
- Representative recipes from every chapter.
- At least three image matches from each image assignment mode: inline, caption-linked, nearby if used.
- Variants are folded and not duplicated as recipes.
- Cookbook chapters are real book chapters.
- Tags are culinary, not bookkeeping.

