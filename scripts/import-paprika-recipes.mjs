import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const archiveName = process.argv[2] ?? "839_recipes.paprikarecipes";
const archivePath = join(process.cwd(), "zips", archiveName);
const outputFixturePath = join(
  process.cwd(),
  "app/modules/recipe-domain/paprika-my-recipes.fixtures.ts",
);
const outputImageDir = join(process.cwd(), "public/recipe-images/my-recipes");
const existingFixturePaths = [
  join(process.cwd(), "app/modules/recipe-domain/joshua-weissman.fixtures.ts"),
  join(
    process.cwd(),
    "app/modules/recipe-domain/paprika-chilled-desserts.fixtures.ts",
  ),
];

const imageBaseUrl = "https://spice.h6nk.dev/recipe-images/my-recipes";

const existingIds = new Set(
  existingFixturePaths.flatMap((fixturePath) =>
    Array.from(readFileSync(fixturePath, "utf8").matchAll(/"id": "([^"]+)"/g)).map(
      ([, id]) => id,
    ),
  ),
);

const extractedArchiveDir = mkdtempSync(join(tmpdir(), "projectspice-paprika-"));
execFileSync("bsdtar", ["-xf", archivePath, "-C", extractedArchiveDir], {
  maxBuffer: 50 * 1024 * 1024,
});
const entries = readdirSync(extractedArchiveDir, { recursive: true })
  .filter((entry) => String(entry).endsWith(".paprikarecipe"))
  .map((entry) => join(extractedArchiveDir, entry));

mkdirSync(outputImageDir, { recursive: true });

const recipes = [];
const skippedDuplicates = [];
const skippedInvalid = [];
const skippedImages = [];
const extractedImages = [];

for (const entryPath of entries) {
  const rawRecipe = readPaprikaRecipe(entryPath);
  const baseId = slugify(rawRecipe.name);

  if (existingIds.has(baseId)) {
    skippedDuplicates.push(rawRecipe.name);
    continue;
  }

  const id = uniqueId(baseId, recipes);
  const recipe = toProjectSpiceRecipe(rawRecipe, id);
  const image = getImage(rawRecipe);

  if (image) {
    const dimensions = readJpegSize(image);
    const imageName = `${id}.jpg`;

    writeFileSync(join(outputImageDir, imageName), image);
    recipe.imageUrl = `${imageBaseUrl}/${imageName}`;
    extractedImages.push({
      title: rawRecipe.name,
      width: dimensions.width,
      height: dimensions.height,
    });
  } else {
    skippedImages.push({
      title: rawRecipe.name,
      reason: "missing embedded Paprika photo data",
    });
  }

  try {
    validateRecipeShape(recipe);
    recipes.push(recipe);
  } catch (error) {
    skippedInvalid.push({
      title: rawRecipe.name,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

recipes.sort((left, right) => left.title.localeCompare(right.title));

writeFileSync(
  outputFixturePath,
  `import type { Recipe } from "./recipe.types";

// Converted from zips/${archiveName}; non-duplicate Paprika photos are stored as
// static image assets under public/recipe-images/my-recipes.
export const myPaprikaRecipes = ${JSON.stringify(recipes, null, 2)} satisfies Recipe[];

export const skippedMyPaprikaDuplicateRecipeTitles = ${JSON.stringify(
    skippedDuplicates.sort((left, right) => left.localeCompare(right)),
    null,
    2,
  )} as const;

export const skippedMyPaprikaImageTitles = ${JSON.stringify(
    skippedImages.sort((left, right) => left.title.localeCompare(right.title)),
    null,
    2,
  )} as const;

export const extractedMyPaprikaImageTitles = ${JSON.stringify(
    extractedImages.sort((left, right) => left.title.localeCompare(right.title)),
    null,
    2,
  )} as const;

export const skippedMyPaprikaInvalidRecipeTitles = ${JSON.stringify(
    skippedInvalid.sort((left, right) => left.title.localeCompare(right.title)),
    null,
    2,
  )} as const;
`,
);

console.log(
  JSON.stringify(
    {
      imported: recipes.length,
      duplicates: skippedDuplicates.length,
      extractedImages: extractedImages.length,
      missingImages: skippedImages.length,
      invalid: skippedInvalid.length,
      withImages: recipes.filter((recipe) => recipe.imageUrl).length,
      output: outputFixturePath,
    },
    null,
    2,
  ),
);

function readPaprikaRecipe(entryPath) {
  const compressed = readFileSync(entryPath);
  return JSON.parse(gunzipSync(compressed).toString("utf8"));
}

function toProjectSpiceRecipe(rawRecipe, id) {
  const ingredients = toIngredientSections(rawRecipe.ingredients ?? "", id);
  const directions = toDirectionSections(rawRecipe.directions ?? "", id);
  const times = toTimes(rawRecipe);
  const source = toSource(rawRecipe);
  const createdAt = toIsoDate(rawRecipe.created) ?? new Date(0).toISOString();
  const updatedAt = toIsoDate(rawRecipe.created) ?? createdAt;
  const notes = toNotes(rawRecipe);
  const tags = Array.isArray(rawRecipe.categories)
    ? rawRecipe.categories
        .map((category) => cleanText(category?.name ?? category))
        .filter(Boolean)
    : [];
  const recipe = {
    id,
    title: cleanText(rawRecipe.name) || id,
    ingredients,
    directions,
    tags,
    version: 1,
    createdAt,
    updatedAt,
  };
  const description = cleanText(rawRecipe.description);
  const recipeYield = toYield(rawRecipe.servings);

  if (description) {
    recipe.description = description;
  }

  if (recipeYield) {
    recipe.yield = recipeYield;
  }

  if (Object.keys(times).length > 0) {
    recipe.times = times;
  }

  if (notes.length > 0) {
    recipe.notes = notes;
  }

  if (source) {
    recipe.source = source;
  }

  if (typeof rawRecipe.rating === "number" && rawRecipe.rating > 0) {
    recipe.rating = Math.min(10, Math.max(0, rawRecipe.rating * 2));
  }

  return recipe;
}

function toIngredientSections(rawIngredients, recipeId) {
  const sections = splitSections(rawIngredients);

  if (sections.length === 0) {
    return [
      {
        id: `${recipeId}-ingredients`,
        title: "Ingredients",
        items: [
          {
            id: `${recipeId}-ingredient-1-1`,
            raw: "Ingredient details not provided.",
            item: "Ingredient details not provided.",
          },
        ],
      },
    ];
  }

  return sections.map((section, sectionIndex) => ({
    id: `${recipeId}-ingredients-${sectionIndex + 1}`,
    ...(section.title ? { title: section.title } : { title: "Ingredients" }),
    items: section.lines.map((line, lineIndex) => ({
      id: `${recipeId}-ingredient-${sectionIndex + 1}-${lineIndex + 1}`,
      raw: line,
      item: line,
    })),
  }));
}

function toDirectionSections(rawDirections, recipeId) {
  const sections = splitSections(rawDirections);

  if (sections.length === 0) {
    return [
      {
        id: `${recipeId}-directions`,
        title: "Directions",
        steps: [
          {
            id: `${recipeId}-step-1`,
            order: 1,
            text: "Direction details not provided.",
          },
        ],
      },
    ];
  }

  let order = 1;
  return sections.map((section, sectionIndex) => ({
    id: `${recipeId}-directions-${sectionIndex + 1}`,
    ...(section.title ? { title: section.title } : { title: "Directions" }),
    steps: section.lines.map((line) => ({
      id: `${recipeId}-step-${order}`,
      order,
      text: line.replace(/^\d+[.)]\s+/, ""),
    })).map((step) => {
      order += 1;
      return step;
    }),
  }));
}

function splitSections(text) {
  const lines = cleanText(text)
    .split(/\r?\n/)
    .map((line) => cleanText(line.replace(/^\s*[-*]\s+/, "")))
    .filter(Boolean);
  const sections = [];
  let current = { title: undefined, lines: [] };

  for (const line of lines) {
    if (isSectionHeading(line) && current.lines.length > 0) {
      sections.push(current);
      current = { title: stripHeadingPunctuation(line), lines: [] };
      continue;
    }

    if (isSectionHeading(line) && current.lines.length === 0) {
      current.title = stripHeadingPunctuation(line);
      continue;
    }

    current.lines.push(line);
  }

  if (current.lines.length > 0) {
    sections.push(current);
  }

  return sections;
}

function isSectionHeading(line) {
  if (line.length > 80 || /[.!?]$/.test(line)) {
    return false;
  }

  if (/^[A-Z][A-Z0-9 '&/(),-]+:?$/.test(line)) {
    return true;
  }

  return /:$/.test(line) && !/^\d/.test(line);
}

function stripHeadingPunctuation(line) {
  return cleanText(line.replace(/:$/, ""));
}

function toYield(servings) {
  const notes = cleanText(servings);

  if (!notes) {
    return undefined;
  }

  const quantityMatch = notes.match(/^\d+(?:\.\d+)?/);
  const quantity = quantityMatch ? Number(quantityMatch[0]) : undefined;
  const unit = cleanText(notes.replace(/^\d+(?:\.\d+)?\s*/, ""));
  const recipeYield = { notes };

  if (quantity && Number.isFinite(quantity)) {
    recipeYield.quantity = quantity;
  }

  if (unit) {
    recipeYield.unit = unit;
  }

  return recipeYield;
}

function toTimes(rawRecipe) {
  const times = {};
  const prepMinutes = parseDuration(rawRecipe.prep_time);
  const cookMinutes = parseDuration(rawRecipe.cook_time);
  const totalMinutes = parseDuration(rawRecipe.total_time);

  if (prepMinutes !== undefined) {
    times.prepMinutes = prepMinutes;
  }

  if (cookMinutes !== undefined) {
    times.cookMinutes = cookMinutes;
  }

  if (totalMinutes !== undefined) {
    times.totalMinutes = totalMinutes;
  } else if (prepMinutes !== undefined || cookMinutes !== undefined) {
    times.totalMinutes = (prepMinutes ?? 0) + (cookMinutes ?? 0);
  }

  return times;
}

function parseDuration(value) {
  const text = cleanText(value).toLowerCase();

  if (!text) {
    return undefined;
  }

  let minutes = 0;
  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:days?|d)\b/);
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\b/);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b/);

  if (dayMatch) {
    minutes += Number(dayMatch[1]) * 1440;
  }

  if (hourMatch) {
    minutes += Number(hourMatch[1]) * 60;
  }

  if (minuteMatch) {
    minutes += Number(minuteMatch[1]);
  }

  if (minutes === 0 && /^\d+$/.test(text)) {
    minutes = Number(text);
  }

  return minutes > 0 ? Math.round(minutes) : undefined;
}

function toSource(rawRecipe) {
  const name = cleanText(rawRecipe.source);
  const url = cleanText(rawRecipe.source_url);

  if (!name && !url) {
    return { type: "imported" };
  }

  const source = { type: "imported" };

  if (name) {
    source.name = name;
  }

  if (isValidUrl(url)) {
    source.url = url;
  }

  return source;
}

function toNotes(rawRecipe) {
  return [rawRecipe.notes, rawRecipe.nutritional_info ? `Nutrition: ${rawRecipe.nutritional_info}` : ""]
    .map(cleanText)
    .filter(Boolean);
}

function getImage(rawRecipe) {
  if (rawRecipe.photo_data) {
    return Buffer.from(rawRecipe.photo_data, "base64");
  }

  if (rawRecipe.photo_large) {
    return Buffer.from(rawRecipe.photo_large, "base64");
  }

  return undefined;
}

function uniqueId(baseId, existingRecipes) {
  const fallbackId = baseId || "paprika-recipe";
  let id = fallbackId;
  let suffix = 2;

  while (
    existingIds.has(id) ||
    existingRecipes.some((recipe) => recipe.id === id)
  ) {
    id = `${fallbackId}-${suffix}`;
    suffix += 1;
  }

  return id;
}

function slugify(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\uFFFD/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function toIsoDate(value) {
  const text = cleanText(value);

  if (!text) {
    return undefined;
  }

  const parsed = new Date(text.replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function validateRecipeShape(recipe) {
  for (const key of ["id", "title", "createdAt", "updatedAt"]) {
    if (!recipe[key]) {
      throw new Error(`Missing ${key}`);
    }
  }

  if (!recipe.ingredients.length || !recipe.ingredients[0].items.length) {
    throw new Error("Missing ingredients");
  }

  if (!recipe.directions.length || !recipe.directions[0].steps.length) {
    throw new Error("Missing directions");
  }
}

function readJpegSize(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("Expected JPEG image data");
  }

  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff) {
      offset += 1;
    }

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset);

    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  throw new Error("Could not read JPEG dimensions");
}
