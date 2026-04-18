import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// ai_profiles (defined before recipes due to FK)
// ---------------------------------------------------------------------------
export const aiProfiles = sqliteTable("ai_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  preferences: text("preferences", { mode: "json" }),
});

// ---------------------------------------------------------------------------
// ai_prompts (defined before ai_runs; no user FK)
// ---------------------------------------------------------------------------
export const aiPrompts = sqliteTable("ai_prompts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  template: text("template").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// import_jobs (defined before recipes due to FK)
// ---------------------------------------------------------------------------
export const importJobs = sqliteTable("import_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed"],
  }).notNull(),
  sourceType: text("source_type").notNull(),
  fileR2Key: text("file_r2_key"),
  recipeCountExpected: integer("recipe_count_expected"),
  recipeCountImported: integer("recipe_count_imported").notNull().default(0),
  errorLogJson: text("error_log_json", { mode: "json" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

// ---------------------------------------------------------------------------
// recipes
// ---------------------------------------------------------------------------
export const recipes = sqliteTable(
  "recipes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    sourceUrl: text("source_url"),
    sourceType: text("source_type", {
      enum: ["url", "gpt", "paprika_html", "paprika_binary", "pdf", "epub", "manual"],
    }).notNull(),
    prepTimeMin: integer("prep_time_min"),
    activeTimeMin: integer("active_time_min"),
    totalTimeMin: integer("total_time_min"),
    timeNotes: text("time_notes"),
    servings: real("servings"),
    servingsUnit: text("servings_unit"),
    difficulty: text("difficulty"),
    directionsText: text("directions_text").notNull().default(""),
    notes: text("notes"),
    imageKey: text("image_key"),
    imageSourceUrl: text("image_source_url"),
    imageAttribution: text("image_attribution"),
    imageAlt: text("image_alt"),
    rating: integer("rating"), // 0–5
    // Self-referential FK for AI variants / forks / scaled copies
    parentRecipeId: text("parent_recipe_id").references(
      (): AnySQLiteColumn => recipes.id,
      { onDelete: "set null" }
    ),
    variantType: text("variant_type", {
      enum: ["original", "ai_improved", "user_fork", "scaled"],
    }),
    variantProfileId: text("variant_profile_id").references(
      () => aiProfiles.id,
      { onDelete: "set null" }
    ),
    contentHash: text("content_hash"), // SHA-256 of normalized title+ingredients
    sourceHash: text("source_hash"), // URL or import file GUID for dedup
    paprikaOriginalId: text("paprika_original_id"),
    importedAt: integer("imported_at", { mode: "timestamp_ms" }),
    importJobId: text("import_job_id").references(() => importJobs.id, {
      onDelete: "set null",
    }),
    visibility: text("visibility", {
      enum: ["private", "family", "link", "public"],
    })
      .notNull()
      .default("private"),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("recipes_user_id_idx").on(t.userId),
    index("recipes_slug_idx").on(t.userId, t.slug),
    index("recipes_content_hash_idx").on(t.contentHash),
    index("recipes_paprika_id_idx").on(t.paprikaOriginalId),
    // Partial-style: most queries filter deleted_at IS NULL
    index("recipes_deleted_at_idx").on(t.deletedAt),
  ]
);

// ---------------------------------------------------------------------------
// ingredients
// ---------------------------------------------------------------------------
export const ingredients = sqliteTable(
  "ingredients",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    groupName: text("group_name"),
    quantityRaw: text("quantity_raw"),
    quantityDecimal: real("quantity_decimal"),
    unitRaw: text("unit_raw"),
    // Canonical unit: g, ml, tsp, tbsp, cup, oz, lb, count, etc.
    unitCanonical: text("unit_canonical"),
    name: text("name").notNull(),
    notes: text("notes"),
    weightG: real("weight_g"),
    footnoteRef: text("footnote_ref"),
    isGroupHeader: integer("is_group_header", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [index("ingredients_recipe_id_idx").on(t.recipeId)]
);

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("tags_user_name_idx").on(t.userId, t.name)]
);

// ---------------------------------------------------------------------------
// recipe_tags
// ---------------------------------------------------------------------------
export const recipeTags = sqliteTable(
  "recipe_tags",
  {
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.tagId] }),
    index("recipe_tags_tag_id_idx").on(t.tagId),
  ]
);

// ---------------------------------------------------------------------------
// cookbooks
// ---------------------------------------------------------------------------
export const cookbooks = sqliteTable("cookbooks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// cookbook_recipes
// ---------------------------------------------------------------------------
export const cookbookRecipes = sqliteTable(
  "cookbook_recipes",
  {
    cookbookId: text("cookbook_id")
      .notNull()
      .references(() => cookbooks.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.cookbookId, t.recipeId] })]
);

// ---------------------------------------------------------------------------
// collections  (curated lists, e.g. "Thanksgiving 2026"; distinct from cookbooks)
// ---------------------------------------------------------------------------
export const collections = sqliteTable("collections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// collection_recipes
// ---------------------------------------------------------------------------
export const collectionRecipes = sqliteTable(
  "collection_recipes",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.recipeId] })]
);

// ---------------------------------------------------------------------------
// cooking_log  (recipe_id is nullable for free-form log entries)
// ---------------------------------------------------------------------------
export const cookingLog = sqliteTable(
  "cooking_log",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id").references(() => recipes.id, {
      onDelete: "set null",
    }),
    cookedAt: integer("cooked_at", { mode: "timestamp_ms" }).notNull(),
    rating: integer("rating"), // 1–5
    notes: text("notes"),
    modifications: text("modifications"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("cooking_log_user_id_idx").on(t.userId),
    index("cooking_log_recipe_id_idx").on(t.recipeId),
  ]
);

// ---------------------------------------------------------------------------
// cooking_log_photos
// ---------------------------------------------------------------------------
export const cookingLogPhotos = sqliteTable("cooking_log_photos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  logId: text("log_id")
    .notNull()
    .references(() => cookingLog.id, { onDelete: "cascade" }),
  imageKey: text("image_key").notNull(),
  caption: text("caption"),
});

// ---------------------------------------------------------------------------
// shopping_lists
// ---------------------------------------------------------------------------
export const shoppingLists = sqliteTable("shopping_lists", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

// ---------------------------------------------------------------------------
// shopping_list_items
// ---------------------------------------------------------------------------
export const shoppingListItems = sqliteTable("shopping_list_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  shoppingListId: text("shopping_list_id")
    .notNull()
    .references(() => shoppingLists.id, { onDelete: "cascade" }),
  recipeId: text("recipe_id").references(() => recipes.id, {
    onDelete: "set null",
  }),
  ingredientId: text("ingredient_id").references(() => ingredients.id, {
    onDelete: "set null",
  }),
  manualText: text("manual_text"),
  quantity: text("quantity"),
  unit: text("unit"),
  aisle: text("aisle"),
  checkedAt: integer("checked_at", { mode: "timestamp_ms" }),
});

// ---------------------------------------------------------------------------
// ai_runs
// ---------------------------------------------------------------------------
export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id").references(() => recipes.id, {
      onDelete: "set null",
    }),
    profileId: text("profile_id").references(() => aiProfiles.id, {
      onDelete: "set null",
    }),
    promptId: text("prompt_id").references(() => aiPrompts.id, {
      onDelete: "set null",
    }),
    requestHash: text("request_hash").notNull(),
    responseJson: text("response_json", { mode: "json" }).notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    neuronCount: integer("neuron_count").notNull().default(0),
    usdCents: integer("usd_cents").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("ai_runs_user_id_idx").on(t.userId)]
);

// ---------------------------------------------------------------------------
// ai_usage_daily  (rate-limit tracking; composite PK on user_id + day)
// ---------------------------------------------------------------------------
export const aiUsageDaily = sqliteTable(
  "ai_usage_daily",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // YYYY-MM-DD
    neuronCount: integer("neuron_count").notNull().default(0),
    usdCents: integer("usd_cents").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })]
);

// ---------------------------------------------------------------------------
// P2 stubs — land early to avoid future migrations
// ---------------------------------------------------------------------------

export const mealPlanEntries = sqliteTable("meal_plan_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  mealSlot: text("meal_slot"), // breakfast | lunch | dinner | snack
  recipeId: text("recipe_id").references(() => recipes.id, {
    onDelete: "set null",
  }),
  servingsOverride: real("servings_override"),
  notes: text("notes"),
});

export const pantryItems = sqliteTable("pantry_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: real("quantity"),
  unit: text("unit"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
});

export const shares = sqliteTable("shares", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // 'recipe' | 'cookbook' | 'collection' | 'shopping_list'
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  sharedByUserId: text("shared_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sharedWithUserId: text("shared_with_user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  signedToken: text("signed_token"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
});
