import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes/:recipeId", "routes/recipes.$recipeId.tsx"),
] satisfies RouteConfig;
