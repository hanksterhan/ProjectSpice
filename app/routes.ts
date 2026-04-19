import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("change-password", "routes/change-password.tsx"),
  route("recipes/new", "routes/recipes.new.tsx"),
  route("recipes/:id", "routes/recipes.$id.tsx"),
  route("recipes/:id/edit", "routes/recipes.$id.edit.tsx"),
] satisfies RouteConfig;
