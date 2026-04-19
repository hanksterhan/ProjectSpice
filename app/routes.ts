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
  // Onboarding
  route("onboarding", "routes/onboarding.tsx"),
  route("onboarding/cookbook-review", "routes/onboarding.cookbook-review.tsx"),
  // Paprika import
  route("imports/paprika", "routes/imports.paprika.tsx"),
  route("imports/paprika-html", "routes/imports.paprika-html.tsx"),
  // GPT / AI import
  route("imports/gpt", "routes/imports.gpt.tsx"),
  // URL scraper import
  route("imports/url", "routes/imports.url.tsx"),
  // Settings
  route("settings/tags", "routes/settings.tags.tsx"),
  // Import API resource routes
  route("api/imports/paprika", "routes/api.imports.paprika.ts"),
  route("api/imports/paprika-html", "routes/api.imports.paprika-html.ts"),
  route("api/imports/paprika/photos", "routes/api.imports.paprika.photos.ts"),
  route("api/imports/:id", "routes/api.imports.$id.ts"),
] satisfies RouteConfig;
