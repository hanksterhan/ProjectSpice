import type { Route } from "./+types/home";
import { seedRecipes } from "~/modules/recipe-domain";
import {
  Button,
  EmptyState,
  RecipeImage,
  Tabs,
  TextInput,
} from "~/modules/ui-shell/primitives";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "ProjectSpice V1" }];
}

const previewRecipes = seedRecipes.slice(0, 3);
const featuredRecipe = seedRecipes[0];

export default function Home() {
  return (
    <div className="workbench-page">
      <section className="page-toolbar" aria-labelledby="library-heading">
        <div>
          <p className="eyebrow">Recipe Library</p>
          <h1 id="library-heading">Chilled Desserts</h1>
        </div>

        <div className="toolbar-actions">
          <TextInput
            label="Search"
            name="search"
            placeholder="Find a recipe"
            defaultValue="semifreddo"
          />
          <Button type="button" variant="primary">
            New Recipe
          </Button>
        </div>
      </section>

      <section className="shell-grid">
        <aside className="recipe-list-panel" aria-label="Recipe list">
          <Tabs
            tabs={[
              { id: "all", label: "All", selected: true },
              { id: "recent", label: "Recent" },
              { id: "favorites", label: "Saved" },
            ]}
          />

          <div className="recipe-list">
            {previewRecipes.map((recipe) => (
              <article className="recipe-row" key={recipe.id}>
                <RecipeImage src={recipe.imageUrl} title={recipe.title} />
                <div>
                  <h2>{recipe.title}</h2>
                  <p>{recipe.yield?.notes ?? "Recipe"}</p>
                </div>
              </article>
            ))}
          </div>
        </aside>

        <section className="recipe-preview" aria-labelledby="preview-heading">
          <div className="preview-image-wrap">
            <RecipeImage
              className="preview-image"
              src={featuredRecipe.imageUrl}
              title={featuredRecipe.title}
            />
          </div>
          <div className="preview-copy">
            <p className="eyebrow">Selected Recipe</p>
            <h2 id="preview-heading">{featuredRecipe.title}</h2>
            <p>{featuredRecipe.description}</p>
            <dl className="recipe-stats">
              <div>
                <dt>Total</dt>
                <dd>{featuredRecipe.times?.totalMinutes} min</dd>
              </div>
              <div>
                <dt>Yield</dt>
                <dd>{featuredRecipe.yield?.notes}</dd>
              </div>
              <div>
                <dt>Tags</dt>
                <dd>{featuredRecipe.tags.slice(0, 2).join(", ")}</dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="side-panel">
          <EmptyState
            title="Drafts"
            body="Recipe drafts will appear here once editing and AI flows are connected."
            actionLabel="Open Workbench"
          />
        </div>
      </section>
    </div>
  );
}
