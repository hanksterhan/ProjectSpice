import type { Route } from "./+types/api.library.recipes";
import { parseRecipeLibraryQuery } from "~/modules/library/recipe-library";
import { requireAuthenticatedUser } from "~/server/auth";
import { getRecipeService } from "~/server/recipes/recipe.runtime";
import { getUserPreferenceService } from "~/server/user-preferences";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireAuthenticatedUser({ request, context, params: {} });

  const query = parseRecipeLibraryQuery(request.url);
  const libraryPreferences = await getUserPreferenceService(context).getLibraryPreferences(
    user.userId,
  );
  const recipePage = await getRecipeService(context).getLibrarySlice(
    query,
    libraryPreferences,
  );

  return json(recipePage);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
