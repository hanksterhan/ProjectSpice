import { ExternalLink } from "lucide-react";
import { Form } from "react-router";

import {
  formatDisplayTime,
  formatIngredientDisplayText,
  getCookCount,
  getDisplayDirectionSteps,
  getLastCookedDate,
  type Recipe,
} from "~/modules/recipe-domain";
import { RecipeImage } from "~/modules/ui-shell/primitives";

import {
  buildDirectionIngredientIndex,
  enrichDirectionStepText,
  getDirectionStepIngredientSummary,
} from "./direction-ingredients";

type RecipeViewerProps = {
  recipe: Recipe;
};

export function RecipeViewer({ recipe }: RecipeViewerProps) {
  const prepTime = formatDisplayTime(recipe.times?.prepMinutes);
  const cookTime = formatDisplayTime(recipe.times?.cookMinutes);
  const totalTime = formatDisplayTime(recipe.times?.totalMinutes);
  const directionIngredientIndex = buildDirectionIngredientIndex(recipe.ingredients);
  const cookCount = getCookCount(recipe);
  const lastCookedDate = getLastCookedDate(recipe);

  return (
    <article className="recipe-detail-page">
      <header className="recipe-detail-hero">
        <div>
          <h1>{recipe.title}</h1>
          {recipe.description ? <p>{recipe.description}</p> : null}
          <div className="recipe-meta large" aria-label="Recipe tags">
            {recipe.favorite ? <span className="favorite-chip">Favorite</span> : null}
            {recipe.rating !== undefined ? (
              <span className="rating-chip">{recipe.rating.toFixed(1)}/10</span>
            ) : null}
            {recipe.tags.slice(0, 5).map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        <RecipeImage
          className="recipe-detail-image"
          src={recipe.imageUrl}
          title={recipe.title}
        />
      </header>

      <dl className="recipe-detail-stats" aria-label="Recipe overview">
        <div>
          <dt>Yield</dt>
          <dd>{recipe.yield?.notes ?? "Not specified"}</dd>
        </div>
        <div>
          <dt>Prep</dt>
          <dd>{prepTime || "Not specified"}</dd>
        </div>
        <div>
          <dt>Cook</dt>
          <dd>{cookTime || "Not specified"}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{totalTime || "Not specified"}</dd>
        </div>
        <div>
          <dt>Cooked</dt>
          <dd>
            {cookCount > 0 ? `${cookCount}x` : "Not yet"}
            {lastCookedDate ? (
              <span className="recipe-stat-note">Last {formatCookedDate(lastCookedDate)}</span>
            ) : null}
          </dd>
        </div>
      </dl>

      <nav className="recipe-mobile-tabs" aria-label="Recipe sections">
        <a href="#ingredients-heading">Ingredients</a>
        <a href="#directions-heading">Directions</a>
        <a href="#notes-heading">Notes</a>
      </nav>

      <div className="recipe-detail-layout">
        <aside className="ingredient-rail" aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading">Ingredients</h2>
          {recipe.ingredients.map((section) => (
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

          {recipe.directions.map((section) => (
            <section className="direction-section" key={section.id}>
              {shouldShowSectionTitle(section.title, "directions") ? (
                <h3>{section.title}</h3>
              ) : null}
              <ol>
                {getDisplayDirectionSteps(section.steps).map(({ displayOrder, displayText, step }) => {
                  const displayStep = { ...step, text: displayText };
                  const textParts = enrichDirectionStepText(displayStep, recipe.ingredients);
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

          <section className="recipe-notes" aria-labelledby="notes-heading">
            <h2 id="notes-heading">Notes</h2>
            {recipe.notes && recipe.notes.length > 0 ? (
              recipe.notes.map((note) => <p key={note}>{note}</p>)
            ) : (
              <p>No notes yet.</p>
            )}
          </section>
        </main>
      </div>
    </article>
  );
}

type CookHistoryDrawerProps = {
  onClose: () => void;
  recipe: Recipe;
};

export function CookHistoryDrawer({ onClose, recipe }: CookHistoryDrawerProps) {
  const cookCount = getCookCount(recipe);
  const lastCookedDate = getLastCookedDate(recipe);
  const recentCookedDates = recipe.cookedDates?.slice(0, 12) ?? [];
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

      {recentCookedDates.length > 0 ? (
        <div className="cook-history-dates" aria-label="Recent cooked dates">
          {recentCookedDates.map((date) => (
            <span key={date}>{formatCookedDate(date)}</span>
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

function shouldShowSectionTitle(
  title: string | undefined,
  genericTitle: string,
): title is string {
  return Boolean(title && title.trim().toLowerCase() !== genericTitle);
}
