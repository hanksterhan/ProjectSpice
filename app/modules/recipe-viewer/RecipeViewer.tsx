import { useState, type KeyboardEvent } from "react";
import { Bookmark, Clock3, ExternalLink } from "lucide-react";
import { Form, Link } from "react-router";

import {
  formatDisplayTime,
  formatIngredientDisplayText,
  getCookCount,
  getDisplayDirectionSteps,
  getLastCookedDate,
  type Recipe,
} from "~/modules/recipe-domain";
import {
  builtInRecipeLenses,
  getRecipeLensDetailPath,
  getRecipeLensEditPath,
  getRecipeLensDefinition,
  type RecipeLens,
  type RecipeLensKey,
  type RecipeLensSummary,
} from "~/modules/recipe-lenses";
import { FavoriteStar, RatingStars, RecipeImage } from "~/modules/ui-shell/primitives";

import {
  buildDirectionIngredientIndex,
  enrichDirectionStepText,
  getDirectionStepIngredientSummary,
} from "./direction-ingredients";

type RecipeViewerProps = {
  recipe: Recipe;
  activeLensKey?: RecipeLensKey | "original";
  activeLens?: RecipeLens | null;
};

export function RecipeViewer({
  recipe,
  activeLensKey = "original",
  activeLens = null,
}: RecipeViewerProps) {
  const displayRecipe = getDisplayRecipe(recipe, activeLens);
  const activeLensDefinition =
    activeLensKey === "original"
      ? undefined
      : builtInRecipeLenses.find((lens) => lens.key === activeLensKey);
  const prepTime = formatDisplayTime(displayRecipe.times?.prepMinutes);
  const cookTime = formatDisplayTime(displayRecipe.times?.cookMinutes);
  const totalTime = formatDisplayTime(displayRecipe.times?.totalMinutes);
  const directionIngredientIndex = buildDirectionIngredientIndex(displayRecipe.ingredients);
  const cookCount = getCookCount(recipe);
  const lastCookedDate = getLastCookedDate(recipe);
  const cookbookTitle = getCookbookTitle(displayRecipe);
  const chapterTitle = getCookbookChapterTitle(displayRecipe);
  const titlePanelTags = getTitlePanelTags(displayRecipe).slice(0, 5);
  const yieldLabel = formatYield(displayRecipe);
  const hasRatingAndTags =
    displayRecipe.rating !== undefined || Boolean(chapterTitle) || titlePanelTags.length > 0;
  const titlePanelTimes = [
    { label: "Prep", value: prepTime },
    { label: "Cook", value: cookTime },
    { label: "Total", value: totalTime },
  ].filter((time) => time.value);

  return (
    <article className="recipe-detail-page">
      <header className="recipe-detail-hero">
        <div className="recipe-detail-title-panel">
          {recipe.favorite ? (
            <FavoriteStar favorite className="recipe-detail-favorite-marker" />
          ) : null}
          {cookbookTitle ? <p className="recipe-cookbook-source">{cookbookTitle}</p> : null}
          <h1>{displayRecipe.title}</h1>
          {displayRecipe.description ? <p>{displayRecipe.description}</p> : null}
          {activeLensKey !== "original" && activeLensDefinition ? (
            <div className="recipe-lens-current" aria-label="Active recipe lens">
              <span>Viewing lens</span>
              <strong>{activeLensDefinition.label}</strong>
            </div>
          ) : null}
          <div className="recipe-title-metadata" aria-label="Recipe metadata">
            {hasRatingAndTags ? (
              <div className="recipe-meta recipe-meta-row" aria-label="Recipe rating and tags">
                {displayRecipe.rating !== undefined ? (
                  <RatingStars rating={displayRecipe.rating} />
                ) : null}
                {chapterTitle ? (
                  <span className="recipe-chapter-chip">
                    <Bookmark aria-hidden="true" size={13} strokeWidth={2.5} />
                    {chapterTitle}
                  </span>
                ) : null}
                {titlePanelTags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="recipe-meta recipe-meta-row" aria-label="Recipe yield and cook history">
              {yieldLabel ? (
                <span className="recipe-detail-chip">
                  <span>Yield:</span>
                  <strong>{yieldLabel}</strong>
                </span>
              ) : null}
              <span className="recipe-detail-chip">
                <span>Cooked:</span>
                <strong>{cookCount > 0 ? `${cookCount}x` : "not yet"}</strong>
              </span>
              {lastCookedDate ? (
                <span className="recipe-detail-chip">
                  <span>Last:</span>
                  <strong>{formatCookedDate(lastCookedDate)}</strong>
                </span>
              ) : null}
            </div>

            {titlePanelTimes.length > 0 ? (
              <div className="recipe-meta recipe-meta-row" aria-label="Recipe times">
                {titlePanelTimes.map((time) => (
                  <span className="recipe-time-chip" key={time.label}>
                    <Clock3 aria-hidden="true" size={13} strokeWidth={2} />
                    <span>{time.label}:</span>
                    <strong>{time.value}</strong>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <RecipeImageGallery recipe={displayRecipe} />
      </header>

      <nav className="recipe-mobile-tabs" aria-label="Recipe sections">
        <a href="#ingredients-heading">Ingredients</a>
        <a href="#directions-heading">Directions</a>
        {displayRecipe.variations?.length ? (
          <a href="#variations-heading">Variations</a>
        ) : null}
        <a href="#notes-heading">Notes</a>
      </nav>

      <div className="recipe-detail-layout">
        <aside className="ingredient-rail" aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading">Ingredients</h2>
          {displayRecipe.ingredients.map((section) => (
            <section className="ingredient-section" key={section.id}>
              {shouldShowSectionTitle(section.title, "ingredients") ? (
                <h3>{section.title}</h3>
              ) : null}
              <ul>
                {section.items.map((ingredient) => (
                  <li key={ingredient.id}>
                    {formatIngredientDisplayText(ingredient)}
                    {ingredient.optional ? <span>Optional</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>

        <main className="direction-pane" aria-labelledby="directions-heading">
          <div className="direction-pane-header">
            <div>
              <h2 id="directions-heading">Directions</h2>
            </div>
            {recipe.source?.url ? (
              <p className="recipe-source-link">
                <a href={recipe.source.url} rel="noreferrer" target="_blank">
                  <ExternalLink aria-hidden="true" size={16} strokeWidth={2.5} />
                  <span>{recipe.source.name ?? "Open source"}</span>
                </a>
              </p>
            ) : recipe.source?.name ? (
              <p>{recipe.source.name}</p>
            ) : null}
          </div>

          {displayRecipe.directions.map((section) => (
            <section className="direction-section" key={section.id}>
              {shouldShowSectionTitle(section.title, "directions") ? (
                <h3>{section.title}</h3>
              ) : null}
              <ol>
                {getDisplayDirectionSteps(section.steps).map(({ displayOrder, displayText, step }) => {
                  const displayStep = { ...step, text: displayText };
                  const textParts = enrichDirectionStepText(displayStep, displayRecipe.ingredients);
                  const mentionedIngredientIds = new Set(
                    textParts
                      .filter((part) => part.type === "ingredient")
                      .map((part) => part.ingredientId),
                  );
                  const ingredientSummary = getDirectionStepIngredientSummary(
                    step,
                    directionIngredientIndex,
                  ).filter(
                    (ingredient) => !mentionedIngredientIds.has(ingredient.id),
                  );

                  return (
                    <li key={`${step.id}-${displayOrder}`}>
                      <span>{displayOrder}</span>
                      <div>
                        <p>
                          {textParts.map((part, partIndex) =>
                            part.type === "ingredient" ? (
                              <span
                                className="direction-ingredient-mention"
                                key={`${part.ingredientId}-${partIndex}`}
                              >
                                {part.text}
                                {part.showMeasure ? <span>{part.measure}</span> : null}
                              </span>
                            ) : (
                              <span key={`text-${partIndex}`}>{part.text}</span>
                            ),
                          )}
                        </p>
                        {ingredientSummary.length > 0 ? (
                          <div
                            className="direction-ingredient-summary"
                            aria-label={`Step ${displayOrder} ingredients`}
                          >
                            {ingredientSummary.map((ingredient) => (
                              <span key={ingredient.id}>
                                <strong>{ingredient.measure}</strong>
                                {ingredient.displayText
                                  .replace(ingredient.measure, "")
                                  .trim()
                                  .replace(/^,?\s*/, "")}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {step.timerMinutes ? (
                          <small>{formatDisplayTime(step.timerMinutes)}</small>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          {displayRecipe.variations?.length ? (
            <section className="recipe-variations" aria-labelledby="variations-heading">
              <h2 id="variations-heading">Variations</h2>
              <div className="recipe-variation-list">
                {displayRecipe.variations.map((variation) => (
                  <article className="recipe-variation" key={variation.id}>
                    <h3>{variation.title}</h3>
                    {variation.description ? <p>{variation.description}</p> : null}
                    {variation.ingredients?.map((section) => (
                      <section className="recipe-variation-ingredients" key={section.id}>
                        {shouldShowSectionTitle(section.title, "ingredients") ? (
                          <h4>{section.title}</h4>
                        ) : null}
                        <ul>
                          {section.items.map((ingredient) => (
                            <li key={ingredient.id}>
                              {formatIngredientDisplayText(ingredient)}
                              {ingredient.optional ? <span>Optional</span> : null}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                    {variation.directions?.map((section) => (
                      <section className="recipe-variation-directions" key={section.id}>
                        {shouldShowSectionTitle(section.title, "directions") ? (
                          <h4>{section.title}</h4>
                        ) : null}
                        <ol>
                          {getDisplayDirectionSteps(section.steps).map(
                            ({ displayOrder, displayText, step }) => (
                              <li key={`${step.id}-${displayOrder}`}>
                                <span>{displayOrder}</span>
                                <p>{displayText}</p>
                              </li>
                            ),
                          )}
                        </ol>
                      </section>
                    ))}
                    {variation.notes?.map((note) => <p key={note}>{note}</p>)}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="recipe-notes" aria-labelledby="notes-heading">
            <h2 id="notes-heading">Recipe Notes</h2>
            {displayRecipe.notes && displayRecipe.notes.length > 0 ? (
              displayRecipe.notes.map((note) => <p key={note}>{note}</p>)
            ) : (
              <p>No notes yet.</p>
            )}
          </section>
        </main>
      </div>
    </article>
  );
}

function getDisplayRecipe(recipe: Recipe, activeLens: RecipeLens | null): Recipe {
  if (!activeLens) {
    return recipe;
  }

  return {
    ...activeLens.recipeDraft,
    id: recipe.id,
    imageUrl: activeLens.recipeDraft.imageUrl ?? recipe.imageUrl,
    imageUrls: activeLens.recipeDraft.imageUrls ?? recipe.imageUrls,
    version: recipe.version,
    createdAt: recipe.createdAt,
    updatedAt: activeLens.updatedAt,
  };
}

function RecipeImageGallery({ recipe }: { recipe: Recipe }) {
  const imageUrls = getRecipeImageUrls(recipe);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedImageUrl = imageUrls[selectedIndex] ?? recipe.imageUrl;
  const hasGallery = imageUrls.length > 1;
  const selectPreviousImage = () => {
    setSelectedIndex((currentIndex) =>
      currentIndex === 0 ? imageUrls.length - 1 : currentIndex - 1,
    );
  };
  const selectNextImage = () => {
    setSelectedIndex((currentIndex) =>
      currentIndex >= imageUrls.length - 1 ? 0 : currentIndex + 1,
    );
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasGallery) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectPreviousImage();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      selectNextImage();
    }
  };

  return (
    <div
      aria-label={hasGallery ? `${recipe.title} image gallery` : undefined}
      className="recipe-image-gallery"
      onKeyDown={handleKeyDown}
      tabIndex={hasGallery ? 0 : undefined}
    >
      <div className="recipe-image-stage">
        <RecipeImage
          className="recipe-detail-image"
          loading="eager"
          src={selectedImageUrl}
          title={recipe.title}
        />
        {hasGallery ? (
          <span className="recipe-image-count" aria-label={`${selectedIndex + 1} of ${imageUrls.length} recipe images`}>
            {selectedIndex + 1} / {imageUrls.length}
          </span>
        ) : null}
      </div>
      {hasGallery ? (
        <div className="recipe-image-thumbnails" aria-label="Recipe images">
          {imageUrls.map((imageUrl, imageIndex) => (
            <button
              aria-label={`Show recipe image ${imageIndex + 1} of ${imageUrls.length}`}
              aria-pressed={imageIndex === selectedIndex}
              className={imageIndex === selectedIndex ? "active" : undefined}
              key={`${imageUrl}-${imageIndex}`}
              onClick={() => setSelectedIndex(imageIndex)}
              type="button"
            >
              <RecipeImage
                className="recipe-image-thumbnail"
                src={imageUrl}
                title={`${recipe.title} image ${imageIndex + 1}`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getRecipeImageUrls(recipe: Recipe): string[] {
  return Array.from(
    new Set([recipe.imageUrl, ...(recipe.imageUrls ?? [])].filter(isString)),
  );
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

type RecipeLensDrawerProps = {
  activeLens: RecipeLens | null;
  activeLensKey: RecipeLensKey | "original";
  lensSummaries: RecipeLensSummary[];
  onClose: () => void;
  recipe: Recipe;
};

export function RecipeLensDrawer({
  activeLens,
  activeLensKey,
  lensSummaries,
  onClose,
  recipe,
}: RecipeLensDrawerProps) {
  const activeLensDefinition =
    activeLensKey === "original"
      ? undefined
      : builtInRecipeLenses.find((lens) => lens.key === activeLensKey);
  const lensSummaryByKey = new Map(
    lensSummaries.map((lensSummary) => [lensSummary.lensKey, lensSummary]),
  );

  return (
    <aside
      aria-labelledby="recipe-lens-drawer-heading"
      className="recipe-side-panel recipe-lens-drawer"
      id="recipe-lens-drawer"
    >
      <div className="recipe-side-panel-header">
        <div>
          <span>Switch view</span>
          <h2 id="recipe-lens-drawer-heading">Recipe lenses</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          title="Close recipe lenses"
          aria-label="Close recipe lenses"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <nav className="recipe-lens-menu" aria-label="Recipe lenses">
        <Link
          aria-current={activeLensKey === "original" ? "page" : undefined}
          className={activeLensKey === "original" ? "active" : undefined}
          to={getRecipeLensDetailPath(recipe)}
        >
          <span>Original</span>
          <small>Canonical saved recipe</small>
        </Link>
        {builtInRecipeLenses.map((lens) => (
          <Link
            aria-current={activeLensKey === lens.key ? "page" : undefined}
            className={activeLensKey === lens.key ? "active" : undefined}
            key={lens.key}
            to={getRecipeLensDetailPath(recipe, lens.key)}
            title={lens.description}
          >
            <span>{lens.shortLabel}</span>
            <small>{lens.description}</small>
          </Link>
        ))}
      </nav>

      <section className="recipe-lens-summary" aria-labelledby="lens-notes-heading">
        <div className="recipe-lens-summary-header">
          <h3 id="lens-notes-heading">Lens Notes</h3>
          {activeLensDefinition ? (
            <Link
              className="recipe-lens-action"
              to={getRecipeLensEditPath(recipe, activeLensDefinition.key)}
            >
              {activeLens ? "Edit lens" : "Create lens"}
            </Link>
          ) : null}
        </div>
        {activeLensKey === "original" ? (
          <p>This is the canonical saved recipe.</p>
        ) : activeLensDefinition ? (
          <p>
            {activeLens?.notes ??
              lensSummaryByKey.get(activeLensDefinition.key)?.notes ??
              `No ${activeLensDefinition.label.toLowerCase()} lens saved yet.`}
          </p>
        ) : null}
      </section>
    </aside>
  );
}

type CookHistoryDrawerProps = {
  activeLensKey: RecipeLensKey | "original";
  lensSummaries: RecipeLensSummary[];
  onClose: () => void;
  recipe: Recipe;
};

type CookHistoryDisplayEntry = {
  cookedOn: string;
  lensKey: string;
  lensName: string;
  note?: string;
};

export function CookHistoryDrawer({
  activeLensKey,
  lensSummaries,
  onClose,
  recipe,
}: CookHistoryDrawerProps) {
  const cookCount = getCookCount(recipe);
  const lastCookedDate = getLastCookedDate(recipe);
  const structuredCookHistory: CookHistoryDisplayEntry[] =
    recipe.cookHistory?.map((entry) => ({
      cookedOn: entry.cookedOn,
      lensKey: entry.lensKey,
      lensName: entry.lensName,
      note: entry.note,
    })) ??
    [];
  const structuredCookHistoryDateSet = new Set(
    structuredCookHistory.map((entry) => entry.cookedOn),
  );
  const legacyCookHistory: CookHistoryDisplayEntry[] =
    recipe.cookedDates?.filter((cookedOn) => !structuredCookHistoryDateSet.has(cookedOn)).map((cookedOn) => ({
      cookedOn,
      lensKey: "unknown",
      lensName: "Recorded cook",
    })) ??
    [];
  const recentCookHistory = [...structuredCookHistory, ...legacyCookHistory]
    .sort((firstEntry, secondEntry) => secondEntry.cookedOn.localeCompare(firstEntry.cookedOn))
    .slice(0, 12);
  const availableCookLensKeys = new Set([
    "original",
    ...lensSummaries.map((lensSummary) => lensSummary.lensKey),
  ]);
  const defaultCookLensKey = availableCookLensKeys.has(activeLensKey) ? activeLensKey : "original";
  const today = getTodayDateInputValue();

  return (
    <aside
      aria-labelledby="cook-history-drawer-heading"
      className="recipe-side-panel cook-history-drawer"
      id="cook-history-drawer"
    >
      <div className="recipe-side-panel-header">
        <div>
          <span>Recipe activity</span>
          <h2 id="cook-history-drawer-heading">Cook History</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          title="Close cook history"
          aria-label="Close cook history"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="cook-history-summary">
        <strong>
          {cookCount > 0
            ? `Cooked ${cookCount} ${cookCount === 1 ? "time" : "times"}`
            : "No cooked dates recorded yet"}
        </strong>
        {lastCookedDate ? <span>Last cooked {formatCookedDate(lastCookedDate)}</span> : null}
      </div>

      <Form className="cook-entry-form" method="post">
        <input name="intent" type="hidden" value="record-cooked" />
        <label className="field cook-entry-version">
          <span>Recipe version</span>
          <select name="lensKey" defaultValue={defaultCookLensKey}>
            <option value="original">Original</option>
            {lensSummaries.map((lensSummary) => {
              const lensDefinition = getRecipeLensDefinition(lensSummary.lensKey);

              return (
                <option key={lensSummary.lensKey} value={lensSummary.lensKey}>
                  {lensDefinition?.label ?? lensSummary.lensKey}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field">
          <span>Cooked on</span>
          <input name="cookedOn" type="date" max={today} defaultValue={today} />
        </label>
        <label className="field">
          <span>Cook notes</span>
          <textarea
            name="cookNote"
            placeholder="What changed, worked, or needs adjusting next time?"
            rows={4}
          />
        </label>
        <button className="button button-primary" type="submit">
          Save Cook Entry
        </button>
      </Form>

      {recentCookHistory.length > 0 ? (
        <div className="cook-history-entries" aria-label="Recent cook history">
          {recentCookHistory.map((entry, index) => (
            <article key={`${entry.cookedOn}-${entry.lensKey}-${index}`}>
              <div>
                <strong>{formatCookedDate(entry.cookedOn)}</strong>
                <span>{entry.lensName}</span>
              </div>
              {entry.note ? <p>{entry.note}</p> : null}
            </article>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function getTodayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatCookedDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return date;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatYield(recipe: Recipe): string {
  const yieldInfo = recipe.yield;

  if (!yieldInfo) {
    return "";
  }

  if (yieldInfo.notes) {
    return yieldInfo.notes.replace(/^yields?\s*:?\s*/i, "");
  }

  return [yieldInfo.quantity, yieldInfo.unit].filter(Boolean).join(" ");
}

function shouldShowSectionTitle(
  title: string | undefined,
  genericTitle: string,
): title is string {
  return Boolean(title && title.trim().toLowerCase() !== genericTitle);
}

function getCookbookTitle(recipe: Recipe): string {
  if (
    recipe.source?.type !== "imported" ||
    !recipe.source.name ||
    isDomainLikeSource(recipe.source.name)
  ) {
    return "";
  }

  return getCookbookTitleFromSourceName(recipe.source.name);
}

function getCookbookTitleFromSourceName(sourceName: string): string {
  const title = sourceName.split(" - ").slice(1).join(" - ").trim();

  return title || sourceName;
}

function getCookbookChapterTitle(recipe: Recipe): string {
  const chapterTag = recipe.tags.find((tag) => /^chapter:\s*\S/i.test(tag));

  return normalizeDisplayTag(chapterTag?.replace(/^chapter:\s*/i, "") ?? "");
}

function getTitlePanelTags(recipe: Recipe): string[] {
  const cookbookTitle = getCookbookTitle(recipe);
  const hiddenTags = new Set(
    [
      cookbookTitle,
      recipe.source?.name,
      recipe.source?.name?.split(" - ")[0],
      "Easy",
      "Medium",
      "Hard",
      "seed",
      "chilled dessert",
    ]
      .map((tag) => normalizeDisplayTag(tag ?? ""))
      .filter(Boolean),
  );

  return recipe.tags
    .map(normalizeDisplayTag)
    .filter((tag) => tag && !hiddenTags.has(tag) && !/^chapter:\s*\S/i.test(tag));
}

function normalizeDisplayTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

function isDomainLikeSource(value: string): boolean {
  const hostname = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";

  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(hostname.replace(/^www\./, ""));
}
