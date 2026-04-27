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
  route("recipes/:id/cook", "routes/recipes.$id.cook.tsx"),
  route("recipes/:id/improve", "routes/recipes.$id.improve.tsx"),
  route("logs/new", "routes/logs.new.tsx"),
  route("logs/:id", "routes/logs.$id.tsx"),
  // CDN image serving (R2 → browser with immutable cache headers)
  route("cdn/images/*", "routes/cdn.images.$.ts"),
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
  route("settings", "routes/settings.tsx"),
  route("settings/tags", "routes/settings.tags.tsx"),
  route("settings/cookbooks", "routes/settings.cookbooks.tsx"),
  route("settings/collections", "routes/settings.collections.tsx"),
  route("settings/ai-profiles", "routes/settings.ai-profiles.tsx"),
  // Cookbooks
  route("cookbooks/:id", "routes/cookbooks.$id.tsx"),
  // Collections
  route("collections/:id", "routes/collections.$id.tsx"),
  // Shopping Lists
  route("shopping-lists", "routes/shopping-lists.tsx"),
  route("shopping-lists/:id", "routes/shopping-lists.$id.tsx"),
  // Import API resource routes
  route("api/imports/paprika", "routes/api.imports.paprika.ts"),
  route("api/imports/paprika-html", "routes/api.imports.paprika-html.ts"),
  route("api/imports/paprika/photos", "routes/api.imports.paprika.photos.ts"),
  route("api/imports/:id", "routes/api.imports.$id.ts"),
  // Export
  route("api/export", "routes/api.export.ts"),
  // AI improvement SSE endpoint
  route("api/recipes/:id/improve", "routes/api.recipes.$id.improve.ts"),
] satisfies RouteConfig;
