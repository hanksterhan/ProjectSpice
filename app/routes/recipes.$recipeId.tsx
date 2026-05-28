import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/recipes.$recipeId";
import { RecipeViewer } from "~/modules/recipe-viewer/RecipeViewer";
import { getRecipeService } from "~/server/recipes/recipe.runtime";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.recipe.title ?? "Recipe"} | ProjectSpice` }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const recipe = await getRecipeService(context).getById(params.recipeId);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  return { recipe };
}

export async function action({ params, context }: Route.ActionArgs) {
  const deletedAt = new Date().toISOString();
  await getRecipeService(context).softDelete(params.recipeId, deletedAt);

  return redirect("/");
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
      <Form method="post">
        <button className="button button-quiet delete-recipe-button" type="submit">
          Delete Recipe
        </button>
      </Form>
      <RecipeViewer recipe={loaderData.recipe} />
    </div>
  );
}
