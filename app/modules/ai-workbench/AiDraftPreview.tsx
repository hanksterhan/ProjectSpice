import type { RecipeDraft } from "~/modules/recipe-domain";
import { RecipeImage } from "~/modules/ui-shell/primitives";

type AiDraftPreviewProps = {
  recipe: RecipeDraft;
  changeSummary: string[];
};

export function AiDraftPreview({ recipe, changeSummary }: AiDraftPreviewProps) {
  return (
    <section className="ai-draft-preview" aria-labelledby="ai-draft-heading">
      <div className="ai-draft-hero">
        <div>
          <p className="eyebrow">Draft</p>
          <h2 id="ai-draft-heading">{recipe.title}</h2>
          {recipe.description ? <p>{recipe.description}</p> : null}
          <div className="recipe-meta">
            {recipe.tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <RecipeImage
          className="ai-draft-image"
          src={recipe.imageUrl}
          title={recipe.title}
        />
      </div>

      <div className="ai-draft-grid">
        <section className="ai-draft-panel" aria-labelledby="change-summary-heading">
          <h3 id="change-summary-heading">Change Summary</h3>
          <ul>
            {changeSummary.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </section>

        <section className="ai-draft-panel" aria-labelledby="draft-ingredients-heading">
          <h3 id="draft-ingredients-heading">Ingredients</h3>
          {recipe.ingredients.map((section) => (
            <div className="ai-draft-section" key={section.id}>
              {section.title ? <h4>{section.title}</h4> : null}
              <ul>
                {section.items.map((item) => (
                  <li key={item.id}>{item.raw}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="ai-draft-panel" aria-labelledby="draft-directions-heading">
          <h3 id="draft-directions-heading">Directions</h3>
          {recipe.directions.map((section) => (
            <div className="ai-draft-section" key={section.id}>
              {section.title ? <h4>{section.title}</h4> : null}
              <ol>
                {section.steps.map((step) => (
                  <li key={step.id}>{step.text}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}
