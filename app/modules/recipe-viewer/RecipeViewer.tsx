import {
  formatDisplayTime,
  formatIngredientDisplayText,
  type Recipe,
} from "~/modules/recipe-domain";
import { RecipeImage } from "~/modules/ui-shell/primitives";

type RecipeViewerProps = {
  recipe: Recipe;
};

export function RecipeViewer({ recipe }: RecipeViewerProps) {
  const prepTime = formatDisplayTime(recipe.times?.prepMinutes);
  const cookTime = formatDisplayTime(recipe.times?.cookMinutes);
  const totalTime = formatDisplayTime(recipe.times?.totalMinutes);

  return (
    <article className="recipe-detail-page">
      <header className="recipe-detail-hero">
        <div>
          <p className="eyebrow">Recipe</p>
          <h1>{recipe.title}</h1>
          {recipe.description ? <p>{recipe.description}</p> : null}
          <div className="recipe-meta large" aria-label="Recipe tags">
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
      </dl>

      <div className="recipe-detail-layout">
        <aside className="ingredient-rail" aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading">Ingredients</h2>
          {recipe.ingredients.map((section) => (
            <section className="ingredient-section" key={section.id}>
              <h3>{section.title ?? "Ingredients"}</h3>
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
              <p className="eyebrow">Method</p>
              <h2 id="directions-heading">Directions</h2>
            </div>
            {recipe.source?.name ? <p>{recipe.source.name}</p> : null}
          </div>

          {recipe.directions.map((section) => (
            <section className="direction-section" key={section.id}>
              <h3>{section.title ?? "Directions"}</h3>
              <ol>
                {section.steps.map((step) => (
                  <li key={step.id}>
                    <span>{step.order}</span>
                    <div>
                      <p>{step.text}</p>
                      {step.timerMinutes ? (
                        <small>{formatDisplayTime(step.timerMinutes)}</small>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          {recipe.notes && recipe.notes.length > 0 ? (
            <section className="recipe-notes">
              <h2>Notes</h2>
              {recipe.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </section>
          ) : null}
        </main>
      </div>
    </article>
  );
}
