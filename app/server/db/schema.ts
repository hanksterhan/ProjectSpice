import { relations } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { Recipe, RecipeDraft } from "~/modules/recipe-domain";

export const aiRunOperations = ["generate", "transform"] as const;
export const aiRunStatuses = ["succeeded", "failed"] as const;

export type AiRunOperation = (typeof aiRunOperations)[number];
export type AiRunStatus = (typeof aiRunStatuses)[number];

export const recipes = sqliteTable(
  "recipes",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    sourceType: text("source_type"),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    tagsJson: text("tags_json", { mode: "json" }).$type<string[]>().notNull(),
    yieldQuantity: real("yield_quantity"),
    yieldUnit: text("yield_unit"),
    yieldNotes: text("yield_notes"),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    totalMinutes: integer("total_minutes"),
    recipeJson: text("recipe_json", { mode: "json" }).$type<Recipe>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("recipes_slug_unique").on(table.slug),
    index("recipes_title_idx").on(table.title),
    index("recipes_source_type_idx").on(table.sourceType),
    index("recipes_deleted_at_idx").on(table.deletedAt),
    index("recipes_updated_at_idx").on(table.updatedAt),
  ],
);

export const recipeVersions = sqliteTable(
  "recipe_versions",
  {
    id: text("id").primaryKey(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    recipeJson: text("recipe_json", { mode: "json" }).$type<Recipe>().notNull(),
    changeSummary: text("change_summary"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("recipe_versions_recipe_id_version_unique").on(
      table.recipeId,
      table.version,
    ),
    index("recipe_versions_recipe_id_idx").on(table.recipeId),
  ],
);

export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    recipeId: text("recipe_id").references(() => recipes.id, {
      onDelete: "set null",
    }),
    operation: text("operation").$type<AiRunOperation>().notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptJson: text("prompt_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    responseJson: text("response_json", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    draftRecipeJson: text("draft_recipe_json", { mode: "json" }).$type<RecipeDraft>(),
    status: text("status").$type<AiRunStatus>().notNull(),
    error: text("error"),
    changeSummary: text("change_summary"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("ai_runs_recipe_id_idx").on(table.recipeId),
    index("ai_runs_operation_idx").on(table.operation),
    index("ai_runs_status_idx").on(table.status),
    index("ai_runs_created_at_idx").on(table.createdAt),
  ],
);

export const recipesRelations = relations(recipes, ({ many }) => ({
  versions: many(recipeVersions),
  aiRuns: many(aiRuns),
}));

export const recipeVersionsRelations = relations(recipeVersions, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeVersions.recipeId],
    references: [recipes.id],
  }),
}));

export const aiRunsRelations = relations(aiRuns, ({ one }) => ({
  recipe: one(recipes, {
    fields: [aiRuns.recipeId],
    references: [recipes.id],
  }),
}));
