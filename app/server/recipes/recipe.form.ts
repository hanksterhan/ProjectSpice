import {
  createRecipeSlug,
  type Recipe,
  type RecipeDraft,
} from "~/modules/recipe-domain";
import {
  recipeEditorFormSchema,
  validateRecipeEditorDraft,
  type RecipeEditorFormValues,
} from "~/modules/recipe-editor";

type RecipeEditorActionResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; errors: string[] };

type RecipeDraftEditorActionResult =
  | { ok: true; draft: RecipeDraft }
  | { ok: false; errors: string[] };

export function parseRecipeEditorFormData(
  formData: FormData,
): RecipeEditorFormValues {
  const values: RecipeEditorFormValues = {
    title: getFormString(formData, "title"),
    description: getFormString(formData, "description"),
    imageUrl: getFormString(formData, "imageUrl"),
    tagsText: getFormString(formData, "tagsText"),
    favorite: formData.get("favorite") === "on",
    rating: getFormString(formData, "rating"),
    prepMinutes: getFormString(formData, "prepMinutes"),
    cookMinutes: getFormString(formData, "cookMinutes"),
    totalMinutes: getFormString(formData, "totalMinutes"),
    yieldQuantity: getFormString(formData, "yieldQuantity"),
    yieldUnit: getFormString(formData, "yieldUnit"),
    yieldNotes: getFormString(formData, "yieldNotes"),
    notesText: getFormString(formData, "notesText"),
    sourceType: parseSourceType(getFormString(formData, "sourceType")),
    sourceName: getFormString(formData, "sourceName"),
    sourceUrl: getFormString(formData, "sourceUrl"),
    ingredientSections: [],
    directionSections: [],
  };

  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") {
      continue;
    }

    applyIngredientValue(values, name, value);
    applyDirectionValue(values, name, value);
  }

  return values;
}

export function buildRecipeFromEditorFormData({
  formData,
  baseDraft,
  existingRecipe,
  now,
}: {
  formData: FormData;
  baseDraft: RecipeDraft;
  existingRecipe?: Recipe;
  now: string;
}): RecipeEditorActionResult {
  const parsedValues = recipeEditorFormSchema.safeParse(
    parseRecipeEditorFormData(formData),
  );

  if (!parsedValues.success) {
    return {
      ok: false,
      errors: parsedValues.error.issues.map((issue) => issue.message),
    };
  }

  const draft = validateRecipeEditorDraft(
    parsedValues.data,
    toRecipeDraft(baseDraft),
  );
  const recipeId = existingRecipe?.id ?? createRecipeId(draft.title);

  return {
    ok: true,
    recipe: {
      ...draft,
      id: recipeId,
      version: existingRecipe ? existingRecipe.version + 1 : 1,
      createdAt: existingRecipe?.createdAt ?? now,
      updatedAt: now,
    },
  };
}

export function buildRecipeDraftFromEditorFormData({
  formData,
  baseDraft,
}: {
  formData: FormData;
  baseDraft: RecipeDraft;
}): RecipeDraftEditorActionResult {
  const parsedValues = recipeEditorFormSchema.safeParse(
    parseRecipeEditorFormData(formData),
  );

  if (!parsedValues.success) {
    return {
      ok: false,
      errors: parsedValues.error.issues.map((issue) => issue.message),
    };
  }

  return {
    ok: true,
    draft: validateRecipeEditorDraft(parsedValues.data, toRecipeDraft(baseDraft)),
  };
}

function toRecipeDraft(recipe: RecipeDraft): RecipeDraft {
  return {
    title: recipe.title,
    description: recipe.description,
    yield: recipe.yield,
    times: recipe.times,
    imageUrl: recipe.imageUrl,
    imageUrls: recipe.imageUrls,
    ingredients: recipe.ingredients,
    directions: recipe.directions,
    variations: recipe.variations,
    notes: recipe.notes,
    source: recipe.source,
    tags: recipe.tags,
    favorite: recipe.favorite,
    rating: recipe.rating,
    cookedDates: recipe.cookedDates,
    cookHistory: recipe.cookHistory,
  };
}

export function getExpectedRecipeVersion(formData: FormData): number | undefined {
  const expectedVersion = Number(getFormString(formData, "expectedVersion"));

  return Number.isInteger(expectedVersion) && expectedVersion > 0
    ? expectedVersion
    : undefined;
}

function createRecipeId(title: string): string {
  const slug = createRecipeSlug(title) || "recipe";
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Date.now().toString(36);

  return `${slug}-${suffix}`;
}

function getFormString(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function parseSourceType(value: string): RecipeEditorFormValues["sourceType"] {
  return value === "ai" || value === "imported" || value === "scraped"
    ? value
    : "manual";
}

function applyIngredientValue(
  values: RecipeEditorFormValues,
  name: string,
  value: string,
) {
  const match = /^ingredientSections\.(\d+)\.(?:items\.(\d+)\.)?(\w+)$/.exec(
    name,
  );

  if (!match) {
    return;
  }

  const sectionIndex = Number(match[1]);
  const itemIndex = match[2] === undefined ? undefined : Number(match[2]);
  const field = match[3];
  const section = (values.ingredientSections[sectionIndex] ??= {
    id: "",
    title: "",
    itemsText: "",
    items: [],
  });

  if (itemIndex === undefined) {
    if (field === "id" || field === "title" || field === "itemsText") {
      section[field] = value;
    }

    return;
  }

  const items = (section.items ??= []);
  const item = (items[itemIndex] ??= {
    id: "",
    raw: "",
    quantity: "",
    unit: "",
    item: "",
    preparation: "",
    optional: false,
  });

  if (field === "optional") {
    item.optional = value === "on";
    return;
  }

  if (
    field === "id" ||
    field === "raw" ||
    field === "quantity" ||
    field === "unit" ||
    field === "item" ||
    field === "preparation"
  ) {
    item[field] = value;
  }
}

function applyDirectionValue(
  values: RecipeEditorFormValues,
  name: string,
  value: string,
) {
  const match = /^directionSections\.(\d+)\.(?:steps\.(\d+)\.)?(\w+)$/.exec(
    name,
  );

  if (!match) {
    return;
  }

  const sectionIndex = Number(match[1]);
  const stepIndex = match[2] === undefined ? undefined : Number(match[2]);
  const field = match[3];
  const section = (values.directionSections[sectionIndex] ??= {
    id: "",
    title: "",
    stepsText: "",
    steps: [],
  });

  if (stepIndex === undefined) {
    if (field === "id" || field === "title" || field === "stepsText") {
      section[field] = value;
    }

    return;
  }

  const steps = (section.steps ??= []);
  const step = (steps[stepIndex] ??= {
    id: "",
    text: "",
    timerMinutes: "",
    ingredientRefsText: "",
  });

  if (
    field === "id" ||
    field === "text" ||
    field === "timerMinutes" ||
    field === "ingredientRefsText"
  ) {
    step[field] = value;
  }
}
