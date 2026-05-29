import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("ai", "routes/ai.tsx"),
  route("api/ai/generate", "routes/api.ai.generate.ts"),
  route("api/ai/transform", "routes/api.ai.transform.ts"),
  route("recipes/new", "routes/recipes.new.tsx"),
  route("recipes/:recipeId", "routes/recipes.$recipeId.tsx"),
  route("recipes/:recipeId/edit", "routes/recipes.$recipeId.edit.tsx"),
] satisfies RouteConfig;
