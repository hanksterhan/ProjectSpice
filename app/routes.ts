import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("ai", "routes/ai.tsx"),
  route("api/ai/generate", "routes/api.ai.generate.ts"),
  route("api/ai/transform", "routes/api.ai.transform.ts"),
  route("api/library/recipes", "routes/api.library.recipes.ts"),
  route("cook", "routes/cook.tsx"),
  route("cookbooks", "routes/cookbooks.tsx"),
  route("cookbooks/:cookbookSlug", "routes/cookbooks.$cookbookSlug.tsx"),
  route("preferences/cookbooks", "routes/preferences.cookbooks.tsx"),
  route("recipes/new", "routes/recipes.new.tsx"),
  route("recipes/:recipeId", "routes/recipes.$recipeId.tsx"),
  route("recipes/:recipeId/edit", "routes/recipes.$recipeId.edit.tsx"),
  route(
    "recipes/:recipeId/lenses/:lensKey/edit",
    "routes/recipes.$recipeId.lenses.$lensKey.edit.tsx",
  ),
  route("techniques", "routes/techniques.tsx"),
  route("techniques/:slug", "routes/techniques.$slug.tsx"),
  route("sign-in/*", "routes/sign-in.tsx"),
  route("sign-up/*", "routes/sign-up.tsx"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
