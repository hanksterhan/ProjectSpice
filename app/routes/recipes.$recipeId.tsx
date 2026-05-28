import { Link } from "react-router";

import type { Route } from "./+types/recipes.$recipeId";
import { RecipeViewer } from "~/modules/recipe-viewer/RecipeViewer";
import { getSeedRecipeById } from "~/modules/recipe-viewer/recipe-detail";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.recipe.title ?? "Recipe"} | ProjectSpice` }];
}

export function loader({ params }: Route.LoaderArgs) {
  const recipe = getSeedRecipeById(params.recipeId);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  return { recipe };
}

export default function RecipeDetail({ loaderData }: Route.ComponentProps) {
  return (
    <div className="recipe-detail-route">
      <Link className="back-link" to="/">
        Back to library
      </Link>
      <Link className="button button-secondary edit-recipe-link" to="edit">
        Edit Recipe
      </Link>
      <RecipeViewer recipe={loaderData.recipe} />
    </div>
  );
}
