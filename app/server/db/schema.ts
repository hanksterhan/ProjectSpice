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
import type { RecipeLensKey } from "~/modules/recipe-lenses";

export const aiRunOperations = ["generate", "transform"] as const;
export const aiRunStatuses = ["succeeded", "failed"] as const;
export const cookbookTechniqueTypes = [
  "checklist",
  "formula",
  "guide",
  "table",
  "troubleshooting",
] as const;
export const recipeLensKeys = [
  "lower-cal",
  "glucose-conscious",
  "quick",
  "max-flavor",
] as const;

export type AiRunOperation = (typeof aiRunOperations)[number];
export type AiRunStatus = (typeof aiRunStatuses)[number];
export type CookbookTechniqueType = (typeof cookbookTechniqueTypes)[number];

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
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    rating: real("rating"),
    cookCount: integer("cook_count").notNull().default(0),
    lastCookedOn: text("last_cooked_on"),
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
    index("recipes_favorite_idx").on(table.favorite),
    index("recipes_rating_idx").on(table.rating),
    index("recipes_cook_count_idx").on(table.cookCount),
    index("recipes_last_cooked_on_idx").on(table.lastCookedOn),
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

export const recipeLenses = sqliteTable(
  "recipe_lenses",
  {
    id: text("id").primaryKey(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    lensKey: text("lens_key").$type<RecipeLensKey>().notNull(),
    notes: text("notes").notNull(),
    recipeDraftJson: text("recipe_draft_json", { mode: "json" })
      .$type<RecipeDraft>()
      .notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("recipe_lenses_recipe_id_lens_key_unique").on(
      table.recipeId,
      table.lensKey,
    ),
    index("recipe_lenses_recipe_id_idx").on(table.recipeId),
    index("recipe_lenses_lens_key_idx").on(table.lensKey),
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

export const cookbookTechniques = sqliteTable(
  "cookbook_techniques",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    techniqueType: text("technique_type").$type<CookbookTechniqueType>().notNull(),
    sourceName: text("source_name").notNull(),
    sourceDocumentPath: text("source_document_path").notNull(),
    pageNumber: integer("page_number"),
    imageUrl: text("image_url"),
    blocksJson: text("blocks_json", { mode: "json" })
      .$type<Array<Record<string, unknown>>>()
      .notNull(),
    tagsJson: text("tags_json", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("cookbook_techniques_slug_unique").on(table.slug),
    index("cookbook_techniques_source_name_idx").on(table.sourceName),
    index("cookbook_techniques_technique_type_idx").on(table.techniqueType),
    index("cookbook_techniques_deleted_at_idx").on(table.deletedAt),
  ],
);

export const recipesRelations = relations(recipes, ({ many }) => ({
  versions: many(recipeVersions),
  lenses: many(recipeLenses),
  aiRuns: many(aiRuns),
}));

export const recipeVersionsRelations = relations(recipeVersions, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeVersions.recipeId],
    references: [recipes.id],
  }),
}));

export const recipeLensesRelations = relations(recipeLenses, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeLenses.recipeId],
    references: [recipes.id],
  }),
}));

export const aiRunsRelations = relations(aiRuns, ({ one }) => ({
  recipe: one(recipes, {
    fields: [aiRuns.recipeId],
    references: [recipes.id],
  }),
}));
