import { useMemo } from "react";
import { Link, redirect } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/cook";
import { CookMode, getCookSessionHref, parseCookRecipeIds } from "~/modules/cooking";
import { addCookedDate } from "~/modules/recipe-domain";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import { requireAuthenticatedUser } from "~/server/auth";
import { getRecipeService } from "~/server/recipes/recipe.runtime";

const finishCookingSchema = z.object({
  cookedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
  recipeIds: z.array(z.string().trim().min(1)).min(1, "Choose at least one recipe."),
});

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Cook Mode | ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAuthenticatedUser({ request, context, params: {} });

  const recipeIds = parseCookRecipeIds(request.url);
  const recipes = await getRecipesInQueryOrder(recipeIds, context);

  return {
    recipeIds,
    recipes,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireAuthenticatedUser({ request, context, params: {} });

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "finish-cooking") {
    return redirect("/");
  }

  const parsed = finishCookingSchema.safeParse({
    cookedOn: formData.get("cookedOn"),
    recipeIds: formData
      .getAll("recipeIds")
      .filter((value): value is string => typeof value === "string"),
  });

  if (!parsed.success) {
    return redirect(getCookSessionHref(parseCookRecipeIds(request.url)));
  }

  const service = getRecipeService(context);
  const now = new Date().toISOString();
  const uniqueRecipeIds = [...new Set(parsed.data.recipeIds)];

  for (const recipeId of uniqueRecipeIds) {
    const recipe = await service.getById(recipeId);

    if (!recipe) {
      continue;
    }

    await service.update(
      {
        ...addCookedDate(recipe, parsed.data.cookedOn),
        updatedAt: now,
        version: recipe.version + 1,
      },
      recipe.version,
      `Recorded cooked from Cook Mode: ${parsed.data.cookedOn}`,
    );
  }

  return redirect(getCookSessionHref(parseCookRecipeIds(request.url)));
}

export default function CookRoute({ loaderData }: Route.ComponentProps) {
  const recipes = loaderData.recipes;
  const recipeCount = recipes.length;
  const title = recipeCount === 1 ? "Cook Mode" : `Cook Mode (${recipeCount})`;
  const actions = useMemo(
    () => (
      <Link className="button button-secondary" to="/">
        Back to Library
      </Link>
    ),
    [],
  );

  useShellCommand({
    actions,
    backHref: "/",
    backLabel: "Back to library",
    title,
  });

  return <CookMode recipes={recipes} />;
}

async function getRecipesInQueryOrder(
  recipeIds: string[],
  context: Route.LoaderArgs["context"],
) {
  if (recipeIds.length === 0) {
    return [];
  }

  const recipes = await getRecipeService(context).list();
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  return recipeIds
    .map((recipeId) => recipeById.get(recipeId))
    .filter((recipe) => recipe !== undefined);
}
