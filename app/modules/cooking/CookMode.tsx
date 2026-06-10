import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCcw, Timer } from "lucide-react";
import { Form } from "react-router";

import {
  formatDisplayTime,
  formatIngredientDisplayText,
  stripDirectionStepLabel,
  type IngredientItem,
  type Recipe,
} from "~/modules/recipe-domain";
import {
  buildDirectionIngredientIndex,
  enrichDirectionStepText,
  getDirectionStepIngredientSummary,
  type DirectionIngredient,
} from "~/modules/recipe-viewer/direction-ingredients";
import { Button, EmptyState } from "~/modules/ui-shell/primitives";

import {
  createCookSessionStorageKey,
  createInitialCookSessionState,
  flattenCookSessionSteps,
  getCookRecipeProgress,
  normalizeCookSessionState,
  type CookSessionStep,
  type CookSessionState,
} from "./cook-session";

type CookModeProps = {
  recipes: Recipe[];
};

export function CookMode({ recipes }: CookModeProps) {
  const storageKey = useMemo(() => createCookSessionStorageKey(recipes), [recipes]);
  const [session, setSession] = useState<CookSessionState>(() =>
    createInitialCookSessionState(recipes),
  );
  const activeRecipe =
    recipes.find((recipe) => recipe.id === session.activeRecipeId) ?? recipes[0];
  const activeRecipeIndex = activeRecipe
    ? recipes.findIndex((recipe) => recipe.id === activeRecipe.id)
    : -1;
  const activeRecipeState = activeRecipe ? session.recipes[activeRecipe.id] : undefined;
  const completedRecipeIds = getCompletedRecipeIds(recipes, session);

  useEffect(() => {
    try {
      const savedState = window.localStorage.getItem(storageKey);
      const parsedState = savedState ? JSON.parse(savedState) as CookSessionState : undefined;

      setSession(normalizeCookSessionState(recipes, parsedState));
    } catch {
      setSession(createInitialCookSessionState(recipes));
    }
  }, [recipes, storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    } catch {
      // localStorage can be unavailable in private or constrained browser contexts.
    }
  }, [session, storageKey]);

  if (recipes.length === 0) {
    return (
      <EmptyState
        title="No recipes loaded"
        body="Choose one or more recipes from the library to start Cook Mode."
        actionLabel="Back to library"
        actionHref="/"
      />
    );
  }

  function updateRecipeState(
    recipeId: string,
    updater: (recipeState: CookSessionState["recipes"][string]) => CookSessionState["recipes"][string],
  ) {
    setSession((currentSession) => {
      const recipeState = currentSession.recipes[recipeId];

      if (!recipeState) {
        return currentSession;
      }

      return {
        ...currentSession,
        recipes: {
          ...currentSession.recipes,
          [recipeId]: updater(recipeState),
        },
      };
    });
  }

  function setActiveRecipe(recipeId: string) {
    setSession((currentSession) => ({
      ...currentSession,
      activeRecipeId: recipeId,
    }));
  }

  function switchRecipe(direction: -1 | 1) {
    if (activeRecipeIndex < 0) {
      return;
    }

    const nextIndex = (activeRecipeIndex + direction + recipes.length) % recipes.length;
    setActiveRecipe(recipes[nextIndex].id);
  }

  function toggleStepComplete(recipeId: string, stepStateId: string) {
    updateRecipeState(recipeId, (recipeState) => {
      const completedStepIds = new Set(recipeState.completedStepIds);

      if (completedStepIds.has(stepStateId)) {
        completedStepIds.delete(stepStateId);
      } else {
        completedStepIds.add(stepStateId);
      }

      return {
        ...recipeState,
        activeStepId: stepStateId,
        completedStepIds: [...completedStepIds],
      };
    });
  }

  function toggleIngredient(recipeId: string, ingredientId: string) {
    updateRecipeState(recipeId, (recipeState) => {
      const checkedIngredientIds = new Set(recipeState.checkedIngredientIds);

      if (checkedIngredientIds.has(ingredientId)) {
        checkedIngredientIds.delete(ingredientId);
      } else {
        checkedIngredientIds.add(ingredientId);
      }

      return {
        ...recipeState,
        checkedIngredientIds: [...checkedIngredientIds],
      };
    });
  }

  function resetSession() {
    setSession(createInitialCookSessionState(recipes));
  }

  return (
    <div className="cook-mode-page">
      <header className="cook-reader-bar">
        <button
          className="cook-swap-button"
          onClick={() => switchRecipe(-1)}
          type="button"
          aria-label="Previous recipe"
        >
          <ChevronLeft aria-hidden="true" size={18} strokeWidth={2.6} />
        </button>

        <label className="cook-recipe-picker">
          <span>Currently cooking</span>
          <select
            aria-label="Choose active recipe"
            onChange={(event) => setActiveRecipe(event.currentTarget.value)}
            value={activeRecipe?.id ?? ""}
          >
            {recipes.map((recipe) => {
              const progress = getCookRecipeProgress(recipe, session.recipes[recipe.id]);

              return (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.title} ({progress.completedSteps}/{progress.totalSteps})
                </option>
              );
            })}
          </select>
        </label>

        <button
          className="cook-swap-button"
          onClick={() => switchRecipe(1)}
          type="button"
          aria-label="Next recipe"
        >
          <ChevronRight aria-hidden="true" size={18} strokeWidth={2.6} />
        </button>

        <details className="cook-session-menu">
          <summary>Session</summary>
          <div>
            <Button onClick={resetSession} type="button" variant="secondary">
              <RotateCcw aria-hidden="true" size={16} strokeWidth={2.4} />
              Reset Checks
            </Button>
            <Form method="post">
              <input name="intent" type="hidden" value="finish-cooking" />
              <input name="cookedOn" type="hidden" value={getTodayDateInputValue()} />
              {completedRecipeIds.map((recipeId) => (
                <input key={recipeId} name="recipeIds" type="hidden" value={recipeId} />
              ))}
              <Button type="submit" variant="primary">
                <Check aria-hidden="true" size={16} strokeWidth={2.6} />
                Finish Cooking
              </Button>
            </Form>
          </div>
        </details>
      </header>

      {activeRecipe ? (
        <CookRecipeReader
          onToggleIngredient={(ingredientId) => toggleIngredient(activeRecipe.id, ingredientId)}
          onToggleStep={(stepId) => toggleStepComplete(activeRecipe.id, stepId)}
          recipe={activeRecipe}
          recipeState={activeRecipeState}
        />
      ) : null}
    </div>
  );
}

function CookRecipeReader({
  onToggleIngredient,
  onToggleStep,
  recipe,
  recipeState,
}: {
  onToggleIngredient: (ingredientId: string) => void;
  onToggleStep: (stepId: string) => void;
  recipe: Recipe;
  recipeState: CookSessionState["recipes"][string] | undefined;
}) {
  const completedStepIds = new Set(recipeState?.completedStepIds ?? []);
  const checkedIngredientIds = new Set(recipeState?.checkedIngredientIds ?? []);
  const directionIngredientIndex = buildDirectionIngredientIndex(recipe.ingredients);
  const cookSteps = flattenCookSessionSteps([recipe]);

  return (
    <article className="cook-reader">
      <header className="cook-reader-title">
        <div>
          <p>{recipe.source?.name ?? recipe.yield?.notes ?? "Recipe"}</p>
          <h1>{recipe.title}</h1>
        </div>
        <dl aria-label="Recipe overview">
          <div>
            <dt>Prep</dt>
            <dd>{formatDisplayTime(recipe.times?.prepMinutes) || "n/a"}</dd>
          </div>
          <div>
            <dt>Cook</dt>
            <dd>{formatDisplayTime(recipe.times?.cookMinutes) || "n/a"}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatDisplayTime(recipe.times?.totalMinutes) || "n/a"}</dd>
          </div>
        </dl>
      </header>

      <div className="cook-reader-layout">
        <aside className="cook-reader-ingredients" aria-labelledby="cook-ingredients-heading">
          <h2 id="cook-ingredients-heading">Ingredients</h2>
          {recipe.ingredients.map((section) => (
            <section key={section.id}>
              {section.title ? <h3>{section.title}</h3> : null}
              <ul>
                {section.items.map((ingredient) => (
                  <CookIngredientItem
                    checked={checkedIngredientIds.has(ingredient.id)}
                    ingredient={ingredient}
                    key={ingredient.id}
                    onToggle={() => onToggleIngredient(ingredient.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </aside>

        <main className="cook-reader-directions" aria-labelledby="cook-directions-heading">
          <h2 id="cook-directions-heading">Directions</h2>
          {recipe.directions.map((section) => (
            <section key={section.id}>
              {section.title ? <h3>{section.title}</h3> : null}
              <ol>
                {cookSteps
                  .filter((cookStep) => cookStep.sectionId === section.id)
                  .map((cookStep) => (
                  <CookDirectionStep
                    checked={completedStepIds.has(cookStep.id)}
                    cookStep={cookStep}
                    directionIngredientIndex={directionIngredientIndex}
                    key={cookStep.id}
                    onToggle={() => onToggleStep(cookStep.id)}
                    recipe={recipe}
                  />
                ))}
              </ol>
            </section>
          ))}
        </main>
      </div>
    </article>
  );
}

function CookDirectionStep({
  checked,
  cookStep,
  directionIngredientIndex,
  onToggle,
  recipe,
}: {
  checked: boolean;
  cookStep: CookSessionStep;
  directionIngredientIndex: Map<string, DirectionIngredient>;
  onToggle: () => void;
  recipe: Recipe;
}) {
  const step = {
    ...cookStep.step,
    text: stripDirectionStepLabel(cookStep.step.text),
  };
  const textParts = enrichDirectionStepText(step, recipe.ingredients);
  const mentionedIngredientIds = new Set(
    textParts
      .filter((part) => part.type === "ingredient")
      .map((part) => part.ingredientId),
  );
  const ingredientSummary = getDirectionStepIngredientSummary(
    step,
    directionIngredientIndex,
  ).filter((ingredient) => !mentionedIngredientIds.has(ingredient.id));

  return (
    <li className={checked ? "complete" : ""}>
      <button
        aria-label={`${checked ? "Mark incomplete" : "Mark complete"} step ${cookStep.stepIndex}`}
        className="cook-inline-check"
        onClick={onToggle}
        type="button"
      >
        <Check aria-hidden="true" size={14} strokeWidth={2.6} />
      </button>
      <span>{cookStep.stepIndex}</span>
      <div>
        <p>
          {textParts.map((part, index) =>
            part.type === "ingredient" ? (
              <span className="direction-ingredient-mention" key={`${part.ingredientId}-${index}`}>
                {part.text}
                <span>{part.measure}</span>
              </span>
            ) : (
              <span key={`text-${index}`}>{part.text}</span>
            ),
          )}
        </p>
        {ingredientSummary.length > 0 ? (
          <div className="cook-reader-step-ingredients" aria-label={`Step ${cookStep.stepIndex} ingredients`}>
            {ingredientSummary.map((ingredient) => (
              <span key={ingredient.id}>
                <strong>{ingredient.measure}</strong>
                {ingredient.displayText.replace(ingredient.measure, "").trim().replace(/^,?\s*/, "")}
              </span>
            ))}
          </div>
        ) : null}
        {step.timerMinutes ? (
          <small>
            <Timer aria-hidden="true" size={14} strokeWidth={2.5} />
            {formatDisplayTime(step.timerMinutes)}
          </small>
        ) : null}
      </div>
    </li>
  );
}

function CookIngredientItem({
  checked,
  ingredient,
  onToggle,
}: {
  checked: boolean;
  ingredient: IngredientItem;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className={checked ? "cook-reader-ingredient checked" : "cook-reader-ingredient"}>
        <input checked={checked} onChange={onToggle} type="checkbox" />
        <span>{formatIngredientDisplayText(ingredient)}</span>
      </label>
    </li>
  );
}

function getCompletedRecipeIds(recipes: Recipe[], session: CookSessionState): string[] {
  const recipesWithProgress = recipes.filter(
    (recipe) => (session.recipes[recipe.id]?.completedStepIds.length ?? 0) > 0,
  );
  const recipesToFinish = recipesWithProgress.length > 0 ? recipesWithProgress : recipes;

  return recipesToFinish.map((recipe) => recipe.id);
}

function getTodayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}
