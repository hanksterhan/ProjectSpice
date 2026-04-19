import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("change-password", "routes/change-password.tsx"),
  route("recipes", "routes/recipes.tsx"),
  route("recipes/new", "routes/recipes.new.tsx"),
  route("recipes/:id", "routes/recipes.$id.tsx"),
  route("recipes/:id/edit", "routes/recipes.$id.edit.tsx"),
  // Paprika import
  route("imports/paprika", "routes/imports.paprika.tsx"),
  route("imports/paprika-html", "routes/imports.paprika-html.tsx"),
  // Import API resource routes
  route("api/imports/paprika", "routes/api.imports.paprika.ts"),
  route("api/imports/paprika-html", "routes/api.imports.paprika-html.ts"),
  route("api/imports/paprika/photos", "routes/api.imports.paprika.photos.ts"),
  route("api/imports/:id", "routes/api.imports.$id.ts"),
] satisfies RouteConfig;
