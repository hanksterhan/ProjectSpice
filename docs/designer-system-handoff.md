# ProjectSpice Designer System Handoff

Last updated: April 28, 2026

## Purpose

ProjectSpice is a private family recipe manager built around a large imported Paprika library, kitchen use, and future-facing recipe improvement. This document is a designer handoff: it names the product surfaces, content types, interaction patterns, media opportunities, and UX challenges that matter for a thorough redesign.

The core design goal is a modern, media-first cooking companion that can handle hundreds of recipes, cookbooks, folders, tags, logs, and meal-planning artifacts without feeling crowded or administrative.

## At A Glance

Design mandate:

- Make ProjectSpice feel like a modern family cookbook, not a database admin tool.
- Lead with recipe imagery, recent cooking activity, and clear decisions about what to cook next.
- Preserve the power-user depth needed for an 836-recipe library.
- Keep kitchen mode highly readable, low-friction, and touch-friendly.
- Make organization feel natural: recipes are content, cookbooks are sources, collections are folders, tags are filters.

Primary redesign focus:

- Signed-in home page.
- Recipe browsing and filtering.
- Recipe detail and cooking mode.
- Media treatments for recipes, cookbooks, collections, tags, and logs.
- Import/review flows for a large migrated library.
- Navigation model across mobile, tablet, and desktop.

## Product Positioning

ProjectSpice should feel like a calm digital cookbook with power-user organization underneath. The app is not only a storage system. The most important product moments are:

- Finding the right recipe quickly from a large library.
- Feeling invited by recipe photography and visual organization.
- Cooking from a phone or tablet with minimal friction.
- Logging what happened after cooking.
- Trusting that imported family data is safe, exportable, and recoverable.

The current implementation has broad feature coverage, but the visual system is still utilitarian. A redesign should preserve the functional depth while making browsing, deciding, and cooking feel more tactile and image-led.

## Current Product Map

Primary routes and surfaces:

- Home: `/home` or `/`, currently a simple sign-in/status hub.
- Recipes: `/recipes`, searchable/filterable recipe grid.
- Recipe detail: `/recipes/:id`, ingredients, directions, tags, scaling, inline ingredient mapping, variants.
- Cooking mode: `/recipes/:id/cook`, full-screen guided kitchen view.
- New/edit recipe: `/recipes/new`, `/recipes/:id/edit`.
- AI improvement: `/recipes/:id/improve`, diff and apply-as-copy flow.
- Cooking logs: `/logs/new`, `/logs/:id`, recipe-linked or free-form logs with photos.
- Shopping lists: `/shopping-lists`, `/shopping-lists/:id`, aisle grouped checklists.
- Meal planner: `/meal-planner`, weekly planning and shopping-list generation.
- Stats: `/stats`, cooking cadence and most-made surfaces.
- Onboarding: `/onboarding`, `/onboarding/cookbook-review`.
- Imports: Paprika, URL, GPT, EPUB, PDF.
- Settings: tags, cookbooks, collections, AI profiles, display preferences, export.

Important object types:

- Recipes: title, image, description, source, times, servings, rating, tags, cook count, visibility, variants.
- Ingredients: grouped rows, parsed quantities, scalable quantities, notes, weights, footnotes.
- Directions: ordered steps with mapped ingredient references.
- Tags: user-defined facets and import-derived classification.
- Cookbooks: source-like groupings, archivable to reduce library noise.
- Collections: user-curated folders such as holidays, projects, menus, or seasonal sets.
- Cooking logs: date, rating, notes, modifications, photos.
- Shopping lists: active/completed lists, aisle groups, checked items.
- Meal plan entries: date, meal slot, recipe, servings override, notes.
- AI profiles and variants: user preference profiles and recipe versions derived from originals.

## Existing Design Language

The current app is mostly Tailwind utility styling with shadcn-like CSS variables:

- Neutral palette: white/black/gray with muted borders.
- Compact controls: rounded 6-8px buttons, chips, cards, sticky headers.
- Text-first navigation links.
- Sparse imagery, although recipes and logs support images through `/cdn/images/*`.
- Accessibility support exists: high contrast, large font, reduced motion, screen-reader labels in key flows.

This makes the app legible and fast, but it does not yet communicate food, appetite, family memory, or media richness. The redesign can introduce stronger visual hierarchy, richer imagery, and more editorial composition while keeping the app efficient.

## Homepage Redesign Brief

The home page should become the signed-in product dashboard, not a placeholder. It should answer: "What should I cook, revisit, import, or plan next?"

Recommended first viewport:

- A media-led welcome area using one strong recipe image or a tasteful rotating "recent/favorite" recipe image.
- Primary action: search or browse recipes.
- Secondary actions: cook recent recipe, import, open meal planner, open shopping list.
- A compact status row: recipe count, recently cooked, active shopping list, offline-ready indicator.
- A hint of the recipe library below the fold so the page does not feel like a marketing splash.

Suggested homepage modules:

- Continue Cooking: recently viewed or recently cooked recipes.
- This Week: meal plan preview with open slots.
- From Your Library: visually rich recipe cards selected by season, tags, favorites, or most-made.
- Collections: media tiles for curated folders/lists.
- Recently Imported: useful after Paprika, PDF, EPUB, or URL imports.
- Cooking Memories: latest log photos and notes.
- Quick Actions: import, add recipe, create list, export data.

Design challenge: this page must feel modern and warm without turning into a busy dashboard. Keep the primary viewport focused on one large visual decision surface, then use smaller horizontal rails or dense list rows below.

## Media-First System

Recipes should be the visual anchor of the app.

Recipe cards should support:

- Image-first layout with stable aspect ratio.
- Fallback states for recipes without photos.
- Title, time, cook count, owner/shared indicator, max two tags, and optional rating.
- Subtle source signals: imported, family shared, AI improved, cookbook sourced.
- Responsive density: large editorial cards on home, compact grid cards in search-heavy contexts.

Collections, cookbooks, and tags should not all look the same:

- Cookbooks are source containers. They can use cover-like treatments, archive state, import provenance, and recipe counts.
- Collections are curated folders. They should feel intentional and mood-board-like, possibly using a collage of 3-4 recipe images.
- Tags are facets. They should remain lightweight chips or filter tokens, but can gain color or icon systems if controlled.

Cooking logs are memory objects:

- Prioritize photo grids, date, rating, and short notes.
- Let a log photo become a recipe's "lived experience" signal without replacing canonical recipe images by default.
- Consider before/after or "last made" surfaces on recipe detail.

Import previews need confidence-oriented media:

- Show thumbnails, extracted title, source, tags/cookbooks, confidence, and field warnings.
- Low-confidence recipes should be visibly reviewable, not alarming.
- Bulk import screens should feel like curation, not file processing.

## Key UX Challenges

1. Large library navigation  
Henry's Paprika corpus contains 836 recipes. Search, filters, collections, cookbooks, and tags must help without overwhelming the screen.

2. Media richness vs. cognitive load  
There are many objects that can become tiles: recipes, cookbooks, collections, tags, logs, meal slots. The redesign needs a clear hierarchy so everything does not become an equally loud card.

3. Tags vs. cookbooks vs. collections  
These are distinct mental models:
- Tags answer "what kind of recipe is this?"
- Cookbooks answer "where did this come from?"
- Collections answer "why did I group these together?"

4. Archived cookbooks  
Archived is a visibility state, not a tag. Default browsing hides recipes that only live in archived cookbooks. The UI needs to make this understandable without exposing database logic.

5. Kitchen ergonomics  
Cooking mode needs large touch targets, readable text at arm's length, wake lock status, step navigation, timers, and an ingredient checklist. Decorative media should not compete with readability while cooking.

6. Offline trust  
Offline recipe view and queued cooking logs are part of the promise. The UI should show offline/pending states calmly and clearly.

7. AI provenance  
AI improvements create variants rather than overwriting originals. Designers should make original vs. improved recipes, diffs, profile names, and version history understandable.

8. Family sharing and copyright posture  
Private/family/public visibility matters. PDF/EPUB-sourced recipes can be shared within the household but not via public signed links. The UI needs clear, low-drama permissions language.

9. Import confidence  
Paprika import is high-volume; EPUB/PDF are guided and confidence-scored. The review UI must support fast scanning, bulk action, and precise correction.

10. Accessibility preferences  
High contrast, large font, and reduced motion are already product features. The redesign should treat them as first-class variants, not afterthoughts.

## Design Priorities

Use these as tie-breakers when visual richness and product complexity compete:

1. Cooking readability beats decoration.
2. Search and filtering clarity beats visual novelty.
3. One dominant media moment per screen beats many equal-weight cards.
4. Organization should explain itself through shape and placement, not tutorial text.
5. Imported content must feel trustworthy even when some fields are imperfect.
6. Mobile and tablet flows are first-class, especially recipe detail, cooking mode, shopping lists, and quick logging.

## Screen-Level Design Notes

### Recipe Library

Current behavior:

- Search is URL-param driven and debounced.
- Sort options: recent, A-Z, most-made.
- Scopes: Mine, Family, Shared with You.
- Tag filters use chips and a collapsible tag panel.
- Archived cookbook visibility is toggled.
- Grid paginates at 24 recipes.

Redesign opportunity:

- Keep search prominent and fast.
- Use a stronger image grid with responsive density.
- Separate global scope, organization filters, and sort so they do not visually compete.
- Consider a left rail or drawer on desktop for filters; bottom sheet or segmented controls on mobile.
- Make empty states media-aware and action-oriented.

### Recipe Detail

Current behavior:

- Title, description, metadata, tags, cook count.
- Ingredients with scale controls.
- Directions with inline ingredient popovers or parenthetical quantities.
- Actions: Cook, I Made This, Add to List, Improve, Edit, Delete.
- AI variants appear as a version list.
- Source and copyright/share limitations appear near the bottom.

Redesign opportunity:

- Add a visual recipe header with image, title, metadata, and primary Cook action.
- Keep ingredient scaling highly discoverable.
- Make ingredients and directions easy to compare, especially on tablet/desktop.
- Consider sticky action rail on desktop and bottom action bar on mobile.
- Use tabs or sections carefully; cooking users should not have to hunt.

### Cooking Mode

Current behavior:

- Full-screen route.
- Tap zones: left 40% previous, right 40% next, middle reserved.
- Mise-en-place checklist.
- Wake Lock status.
- Text size cycle.
- Multi-timer bottom strip with pause/resume/remove and pause-all.
- Quick log sheet appears on exit.

Redesign opportunity:

- Preserve ergonomics over ornament.
- Use strong typographic scale and quiet step progress.
- Timers need clear hierarchy when multiple are active.
- Ingredient checklist should be collapsible, scannable, and thumb-friendly.
- Quick log should feel like a natural close to the session, not a form interruption.

### Onboarding

Current behavior:

- Returning Paprika user path.
- Start-fresh path.
- Cookbook review after import.

Redesign opportunity:

- Treat import as a guided migration, with confidence and momentum.
- For Paprika users, set expectations around recipe count, photos, categories/cookbooks, and review.
- For new users, make the first recipe path feel lightweight and visual.

### Imports

Current behavior:

- Paprika binary import parses in browser, batches recipes, uploads photos separately.
- URL import supports structured extraction and paste-HTML fallback.
- GPT import supports strict `PROJECTSPICE_RECIPE_V1` template paste.
- EPUB/PDF import uses guided review.

Redesign opportunity:

- Use a shared import review pattern across sources.
- Distinguish "parsed", "needs review", "imported", "skipped", and "failed" states.
- Show recipe image previews early.
- Make bulk selection and correction efficient.

### Organization Settings

Current behavior:

- Tags: CRUD, merge suggestions.
- Cookbooks: CRUD, archive toggle.
- Collections: CRUD, reorder recipes.
- AI profiles: CRUD and templates.

Redesign opportunity:

- Move commonly used organization into the library experience instead of burying everything in settings.
- Use distinct visual treatments for tag management, cookbook archive review, and collection building.
- Make merging tags feel safe with previewed consequences.

### Meal Planner And Shopping Lists

Current behavior:

- Weekly meal planner with slots and servings override.
- Generate shopping list from week.
- Shopping lists group by aisle, support manual and recipe-derived items, check-off, complete/reopen.

Redesign opportunity:

- Meal planner should be calendar-like but not visually heavy.
- Shopping list is an in-store tool: large check targets, aisle clarity, collapsed completed items, and low visual noise.
- Recipe images can help planning, but the shopping list itself should be text-efficient.

### Stats And Logs

Current behavior:

- Cooking cadence stats.
- Logs can include photos, ratings, notes, and modifications.

Redesign opportunity:

- Make stats feel like reflection, not analytics bloat.
- Surface "most made", "haven't cooked in a while", and memorable photos.
- Use log photos as emotional texture across home and recipe detail.

## Navigation Model

The app needs a clearer primary navigation system. Current navigation is route-local and link-heavy.

Recommended primary nav:

- Home
- Recipes
- Plan
- Lists
- Logs
- Settings

Recommended contextual actions:

- Add Recipe
- Import
- Cook
- Log
- Add to List

Mobile should likely use a bottom nav for primary destinations plus a floating or header-level add/import action. Desktop can use a left rail or compact top nav. Recipe detail and cooking mode need route-specific navigation that does not fight the primary nav.

## Component Inventory For Redesign

Core components to specify:

- App shell: desktop nav, mobile nav, sticky headers, offline/pending sync status.
- Recipe card: editorial, grid, compact row, picker row.
- Image treatment: recipe hero, thumbnail, collage, empty photo fallback.
- Search bar and command-like quick find.
- Filter chips and tag browser.
- Segmented controls: scope, sort, display mode.
- Cookbook card and archived state.
- Collection card with image collage.
- Tag chip, tag merge suggestion, tag count.
- Ingredient list row and group heading.
- Scale control.
- Direction step row.
- Inline ingredient reference popover.
- Cooking step view.
- Timer chip/card.
- Quick log sheet.
- Rating input.
- Photo upload and log photo grid.
- Shopping list item and aisle section.
- Meal plan day column and meal slot.
- Import progress and import review item.
- AI diff field, accept/reject controls, variant/version panel.
- Toasts, undo, pending offline, failed sync, empty states.

## Visual Direction

The visual system should be modern, warm, and food-aware. Avoid an overly beige cookbook aesthetic and avoid a purely monochrome admin look. Use neutrals as the base, then introduce a restrained accent system inspired by produce, spice, heat, and freshness.

Suggested principles:

- Use real recipe images whenever available.
- Keep cards at 8px radius or less unless a component clearly needs a different shape.
- Use generous image crops but stable aspect ratios.
- Favor strong typography and spacing over decorative flourishes.
- Keep tags compact and secondary.
- Let one media object dominate a view; keep supporting modules quieter.
- Avoid making every object a card. Use rows, rails, sections, and trays where density matters.

Potential palette direction:

- Neutral base: warm off-white, charcoal, soft gray borders.
- Accent families: chili red, herb green, citrus yellow, blueberry/ink, stainless blue-gray.
- Semantic colors: success/pending/error must remain accessible in high-contrast mode.

Typography:

- Use a highly readable sans-serif for UI.
- Consider a restrained display face only for recipe/home hero titles if it does not hurt legibility.
- Cooking mode should use plain, large, high-legibility text.

## Content Density Rules

To avoid busyness:

- Recipe cards show at most two tags by default.
- Use counts and icons sparingly.
- Prefer one primary action per card or row.
- Hide advanced filters behind a clear filter surface.
- Let "archived", "shared", "AI improved", and "source type" appear only when relevant.
- Use progressive disclosure for import diagnostics, AI details, and metadata.
- Keep cooking mode free of inline popovers and dense metadata.

## Accessibility And Responsive Constraints

Design must account for:

- Mobile-first recipe browsing and cooking.
- Tablet cooking at counter distance.
- Desktop bulk organization and import review.
- High contrast mode.
- Large font mode.
- Reduced motion.
- Screen-reader labels for checkboxes, timers, import states, and ingredient references.
- Focus-visible states on all interactive controls.
- Sufficient touch target size in cooking, shopping, logging, and onboarding.

## Open Design Questions

- Should recipes have favorites/pins, or should "most-made" and collections carry that role?
- Should cookbook covers be generated from recipe collages or manually selected?
- How should tags be grouped or colored, if at all?
- Should home prioritize recent activity, seasonal suggestions, or meal-planning tasks?
- How should family-shared recipes appear alongside owned recipes in the main grid?
- How much AI presence should appear in normal recipe browsing?
- Should cooking logs be central enough to deserve a primary nav item, or live under Home/Recipes?
- What is the default visual treatment for recipes without images after importing 836 recipes?

## Redesign Deliverables Requested From Designer

A complete UX redesign should include:

- App navigation model for mobile, tablet, and desktop.
- Modern signed-in home page.
- Recipe library grid/list with search, filters, scopes, and archived visibility.
- Recipe detail page with media header, ingredients, directions, actions, and variants.
- Cooking mode design with timers, checklist, step navigation, and quick log.
- Import review system for Paprika, URL/GPT, EPUB, and PDF.
- Cookbooks, collections, and tags visual systems.
- Meal planner and shopping list flows.
- Cooking log and stats surfaces.
- Component inventory with states.
- Accessibility variants for high contrast, large text, reduced motion, empty/error/offline states.

The designer does not need to preserve the current visual layout. They should preserve the product behaviors and constraints above, then propose a cleaner information architecture, visual hierarchy, and component system.

## Source Context

This handoff is based on the delivered plan at `~/workspaces/plans/done/projectspice-recipe-manager-plan.md` and the current ProjectSpice implementation in `/Users/hhan/workspaces/ProjectSpice`.
