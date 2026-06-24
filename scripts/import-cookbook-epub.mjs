import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const defaultDatabaseName = "projectspice-v1-staging";
const defaultBaseUrl = "http://localhost:5173";
const defaultOutputPath = "/tmp/projectspice-cookbook-import.sql";

const args = parseArgs(process.argv.slice(2));
const epubPaths = args._;

if (epubPaths.length === 0) {
  throw new Error("Provide at least one EPUB path.");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseName = args.database ?? defaultDatabaseName;
const baseUrl = (args.baseUrl ?? defaultBaseUrl).replace(/\/+$/, "");
const outputPath = resolve(args.out ?? defaultOutputPath);
const shouldApply = args.apply === true;
const shouldUseRemote = args.remote === true;

const vite = await createServer({
  root,
  appType: "custom",
  configFile: false,
  logLevel: "error",
  plugins: [tsconfigPaths()],
  server: {
    hmr: false,
    middlewareMode: true,
    watch: null,
  },
});

try {
  const domain = await vite.ssrLoadModule("/app/modules/recipe-domain/index.ts");
  const cookbook = await vite.ssrLoadModule(
    "/app/server/cookbook-epub/index.ts",
  );
  const { createRecipeSlug, getCookCount, getLastCookedDate, recipeSchema } =
    domain;
  const statements = ["PRAGMA foreign_keys = ON;"];
  const summaries = [];

  for (const epubPath of epubPaths) {
    const absoluteEpubPath = resolve(epubPath);

    if (!existsSync(absoluteEpubPath)) {
      throw new Error(`EPUB not found: ${absoluteEpubPath}`);
    }

    const buffer = readFileSync(absoluteEpubPath);
    const extraction = cookbook.extractCookbookEpub(buffer);
    const bookTitle =
      extraction.metadata.title ?? titleFromFilename(absoluteEpubPath);
    const sourceName = getCookbookSourceName(extraction.metadata, bookTitle);
    const sourceNamesToReplace = [...new Set([bookTitle, sourceName])];
    const extractedTechniques = extraction.techniques;
    const bookSlug = createRecipeSlug(bookTitle) || "cookbook";
    const imageDir = resolve(
      root,
      "public",
      "recipe-images",
      "cookbooks",
      bookSlug,
    );

    mkdirSync(imageDir, { recursive: true });

    const imageUrlByPath = new Map();
    for (const replaceSourceName of sourceNamesToReplace) {
      statements.push(
        `DELETE FROM cookbook_techniques WHERE source_name = ${toSqlLiteral(replaceSourceName)};`,
        `DELETE FROM recipe_versions WHERE recipe_id IN (SELECT id FROM recipes WHERE source_type = 'imported' AND source_name = ${toSqlLiteral(replaceSourceName)});`,
        `DELETE FROM recipes WHERE source_type = 'imported' AND source_name = ${toSqlLiteral(replaceSourceName)};`,
      );
    }

    const recipes = extraction.recipes.map((entry) => {
      const imageUrls = Array.from(
        new Set(
          entry.images.map((imageRef) =>
            writeImageAsset({
              buffer,
              bookSlug,
              baseUrl,
              imageDir,
              imageRef,
              extractor: cookbook,
              cache: imageUrlByPath,
            }),
          ),
        ),
      );
      const imageUrl = imageUrls[0];
      const now = new Date().toISOString();
      const draftRecipe = entry.draftRecipe;
      const chapter = getCookbookImportChapter(sourceName, entry.sourceDocumentPath);
      const tags = [
        ...inferRecipeTags(draftRecipe),
        ...(chapter ? [`chapter:${chapter}`] : []),
      ];
      const id = createImportedId(draftRecipe.title, `${bookSlug}:${entry.id}`);
      const recipe = recipeSchema.parse({
        ...draftRecipe,
        id,
        imageUrl,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        source: {
          type: "imported",
          name: sourceName,
        },
        tags,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      statements.push(
        toInsertStatement(recipe, {
          getCookCount,
          getLastCookedDate,
        }),
      );

      return recipe;
    });

    const techniques = extractedTechniques.map((technique) => {
      const firstImage = technique.images[0];
      const imageUrl = firstImage
        ? writeImageAsset({
            buffer,
            bookSlug,
            baseUrl,
            imageDir,
            imageRef: firstImage,
            extractor: cookbook,
            cache: imageUrlByPath,
          })
        : undefined;
      const now = new Date().toISOString();
      const slug = createImportedId(technique.title, `${bookSlug}:${technique.id}`);
      const row = {
        id: `${bookSlug}:${technique.id}`,
        slug,
        title: technique.title,
        summary: technique.summary,
        techniqueType: technique.type,
        sourceName,
        sourceDocumentPath: technique.sourceDocumentPath,
        pageNumber: technique.pageNumber,
        imageUrl,
        blocks: technique.blocks,
        tags: Array.from(
          new Set([
            "technique",
            technique.type,
            ...getCookbookImportChapterTags(sourceName, technique.sourceDocumentPath),
          ]),
        ),
        createdAt: now,
        updatedAt: now,
      };

      statements.push(toTechniqueInsertStatement(row));

      return row;
    });

    summaries.push({
      epubPath: absoluteEpubPath,
      title: bookTitle,
      sourceName,
      bookSlug,
      recipes: extraction.recipes.length,
      techniques: extractedTechniques.length,
      importedRows: recipes.length,
      importedTechniques: techniques.length,
      imageFiles: imageUrlByPath.size,
      warnings: extraction.warnings,
    });
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${statements.join("\n")}\n`);

  const result = {
    outputPath,
    databaseName,
    remote: shouldUseRemote,
    applied: shouldApply,
    baseUrl,
    books: summaries,
  };

  console.log(JSON.stringify(result, null, 2));

  if (shouldApply) {
    const wranglerArgs = [
      "wrangler",
      "d1",
      "execute",
      databaseName,
      "--file",
      outputPath,
    ];

    wranglerArgs.push(shouldUseRemote ? "--remote" : "--local");

    execFileSync("pnpm", wranglerArgs, {
      cwd: root,
      stdio: "inherit",
    });
  }
} finally {
  await vite.close();
}

function writeImageAsset({
  buffer,
  bookSlug,
  baseUrl,
  imageDir,
  imageRef,
  extractor,
  cache,
}) {
  const cachedUrl = cache.get(imageRef.epubPath);

  if (cachedUrl) {
    return cachedUrl;
  }

  const asset = extractor.extractCookbookEpubImageAsset(buffer, imageRef.epubPath);
  const extension = normalizedImageExtension(imageRef.epubPath, asset.mediaType);
  const imageSlug = createFilesystemSlug(imageRef.epubPath);
  const filename = `${imageSlug}${extension}`;
  const outputPath = resolve(imageDir, filename);

  writeFileSync(outputPath, asset.data);

  const imageUrl = `${baseUrl}/recipe-images/cookbooks/${bookSlug}/${filename}`;
  cache.set(imageRef.epubPath, imageUrl);

  return imageUrl;
}

function getCookbookSourceName(metadata, fallbackTitle) {
  const title = normalizeCookbookText(metadata.title) || fallbackTitle;
  const creator = normalizeCookbookCreator(metadata.creator);

  if (!creator || title.toLowerCase().includes(creator.toLowerCase())) {
    return title;
  }

  return `${creator} - ${title}`;
}

function normalizeCookbookCreator(value) {
  const creator = normalizeCookbookText(value);

  if (!creator) {
    return "";
  }

  return creator
    .replace(/\s*\(Firm\)\s*/gi, "")
    .replace(/^America's Test Kitchen.*$/i, "America's Test Kitchen")
    .trim();
}

function normalizeCookbookText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferRecipeTags(recipe) {
  const titleText = String(recipe.title ?? "").toLowerCase();
  const ingredientText = getRecipeIngredientTagText(recipe);
  const text = [
    titleText,
    String(recipe.description ?? "").toLowerCase(),
    ingredientText,
  ].join(" ");
  const tags = [];

  addTagIf(tags, "Beverage", /\b(kombucha|kefir|lassi|smoothie|juice|soda|shrub|tea|coffee|lemonade|drink|cocktail|mocktail|hot chocolate|horchata|agua fresca)\b/.test(titleText));
  addTagIf(tags, "Fermented", /\b(kombucha|kefir|ferment|fermented|pickle|pickled|kimchi|sauerkraut|sourdough)\b/.test(text));
  addTagIf(tags, "Dessert", /\b(cake|pie|tart|cookie|brownie|pudding|custard|ice cream|gelato|sorbet|mousse|babka|chocolate|caramel|fudge|banana split|sweet roll|dessert|pastry|doughnut|donut|muffin)\b/.test(titleText));
  addTagIf(tags, "Bread", /\b(bread|loaf|brioche|pita|naan|focaccia|bagel|bun|roll|tortilla|pizza dough|pie dough|puff pastry|flatbread)\b/.test(titleText));
  addTagIf(tags, "Sauce", /\b(sauce|salsa|gravy|dressing|aioli|mayo|mayonnaise|chutney|glaze|syrup|dip|broth|stock|tare|remoulade|rémoulade|tzatziki|tahini)\b/.test(titleText));
  addTagIf(tags, "Salad", /\b(salad|slaw|coleslaw|tabbouleh)\b/.test(titleText));
  addTagIf(tags, "Curry", /\b(curry|masala|korma|vindaloo)\b/.test(titleText));
  addTagIf(tags, "Snacks", /\b(popcorn|chips|crackers|nuggets?|fries|fritos|snack)\b/.test(titleText));
  addTagIf(tags, "Fish", /\b(fish|salmon|tuna|cod|halibut|trout|yellowtail|shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|sardine|seafood)\b/.test(titleText));
  addTagIf(tags, "Protein", hasProtein(`${titleText} ${ingredientText}`));
  addTagIf(tags, "Vegetarian", !hasAnimalProtein(text) && hasVegetableFocus(text));

  return tags.slice(0, 5);
}

function getCookbookImportChapterTags(sourceName, documentPath) {
  const chapter = getCookbookImportChapter(sourceName, documentPath);

  return chapter ? [`chapter:${chapter}`] : [];
}

function getCookbookImportChapter(sourceName, documentPath) {
  if (sourceName === "Andrew Rea - Binging with Babish") {
    return "The Recipes";
  }

  if (sourceName === "America's Test Kitchen - The Complete Guide to Healthy Drinks") {
    if (/c01/i.test(documentPath)) {
      return "Smoothies";
    }

    if (/c02/i.test(documentPath)) {
      return "Juices";
    }

    if (/c03/i.test(documentPath)) {
      return "Teas, Tisanes & More";
    }

    if (/c04/i.test(documentPath)) {
      return "Flavored Waters";
    }

    if (/c05/i.test(documentPath)) {
      return "Fermented, Soaked & Simmered";
    }
  }

  if (sourceName === "Darlene Schrijver - The Salad Lab: Recipes for Making Fabulous Salads Every Day") {
    const splitIndex = Number(/index_split_(\d+)\.html/i.exec(documentPath)?.[1]);

    if (splitIndex >= 18 && splitIndex <= 39) {
      return "Start Out with the Basics";
    }

    if (splitIndex >= 42 && splitIndex <= 50) {
      return "Celebrity-Inspired Favorites";
    }

    if (splitIndex >= 53 && splitIndex <= 96) {
      return "Let's Travel: Destination-Inspired Recipes";
    }

    if (splitIndex >= 99 && splitIndex <= 131) {
      return "Seasonal and Holiday Favorites";
    }

    if (splitIndex >= 134 && splitIndex <= 151) {
      return "Everything Is a Salad";
    }

    if (splitIndex >= 154 && splitIndex <= 177) {
      return "Salad Lab Elements";
    }

    if (splitIndex >= 179 && splitIndex <= 186) {
      return "A Few More Salad Lab Elements";
    }
  }

  if (sourceName === "Tieghan Gerard - Half Baked Harvest Every Day: Recipes for Balanced, Flexible, Feel-Good Meals") {
    const splitIndex = Number(/index_split_(\d+)\.html/i.exec(documentPath)?.[1]);

    if (splitIndex >= 8 && splitIndex <= 34) {
      return "Breakfast";
    }

    if (splitIndex >= 35 && splitIndex <= 67) {
      return "Appetizers & Sides";
    }

    if (splitIndex >= 68 && splitIndex <= 92) {
      return "Soup & Salad";
    }

    if (splitIndex >= 93 && splitIndex <= 125) {
      return "Pasta & Pizza";
    }

    if (splitIndex >= 126 && splitIndex <= 154) {
      return "Vegetarian";
    }

    if (splitIndex >= 155 && splitIndex <= 179) {
      return "Chicken";
    }

    if (splitIndex >= 180 && splitIndex <= 204) {
      return "Beef";
    }

    if (splitIndex >= 205 && splitIndex <= 231) {
      return "Fish & Seafood";
    }

    if (splitIndex >= 232 && splitIndex <= 263) {
      return "Dessert";
    }
  }

  if (sourceName === "Tieghan Gerard - Half Baked Harvest Super Simple") {
    if (/c01\.xhtml/i.test(documentPath)) {
      return "The Basics";
    }

    if (/c02\.xhtml/i.test(documentPath)) {
      return "Breakfast & Brunch";
    }

    if (/c03\.xhtml/i.test(documentPath)) {
      return "Appetizers & Sides";
    }

    if (/c04\.xhtml/i.test(documentPath)) {
      return "Salad & Soup";
    }

    if (/c05\.xhtml/i.test(documentPath)) {
      return "Pizza & Pasta";
    }

    if (/c06\.xhtml/i.test(documentPath)) {
      return "Vegetarian";
    }

    if (/c07\.xhtml/i.test(documentPath)) {
      return "Poultry & Pork";
    }

    if (/c08\.xhtml/i.test(documentPath)) {
      return "Beef & Lamb";
    }

    if (/c09\.xhtml/i.test(documentPath)) {
      return "Seafood & Fish";
    }

    if (/c10\.xhtml/i.test(documentPath)) {
      return "Dessert";
    }
  }

  if (sourceName === "Masaharu Morimoto - Mastering the Art of Japanese Home Cooking") {
    const chapterIndex = Number(/Chapter_(\d+)/i.exec(documentPath)?.[1]);

    if (chapterIndex === 1) {
      return "Dashi: The Easy, Essential Japanese Stock";
    }

    if (chapterIndex === 2) {
      return "Gohan: Rice";
    }

    if (chapterIndex === 3) {
      return "Supu: Soups";
    }

    if (chapterIndex === 4) {
      return "Yaku: To Grill, Broil, and Sear";
    }

    if (chapterIndex === 5) {
      return "Musu: To Steam";
    }

    if (chapterIndex === 6) {
      return "Niru: To Simmer";
    }

    if (chapterIndex === 7) {
      return "Itame Ru: To Stir-Fry";
    }

    if (chapterIndex === 8) {
      return "Men: Noodles";
    }

    if (chapterIndex === 9) {
      return "Ageru: To Fry";
    }

    if (chapterIndex === 10) {
      return "Ae Ru: To Dress";
    }

    if (chapterIndex === 11) {
      return "Tsukeru: To Pickle";
    }
  }

  if (sourceName === "Molly Moon-Neitzel - Molly Moon's Homemade Ice Cream") {
    const recipeIndex = Number(/Neit_9781570617973_epub_c(\d+)_r1\.htm/i.exec(documentPath)?.[1]);
    const columnIndex = Number(/Neit_9781570617973_epub_col(\d+)_r1\.htm/i.exec(documentPath)?.[1]);

    if ((recipeIndex >= 1 && recipeIndex <= 13) || columnIndex === 9) {
      return "Spring";
    }

    if ((recipeIndex >= 14 && recipeIndex <= 27) || [11, 12, 13, 14, 16].includes(columnIndex)) {
      return "Summer";
    }

    if ((recipeIndex >= 28 && recipeIndex <= 40) || [17, 18].includes(columnIndex)) {
      return "Fall";
    }

    if ((recipeIndex >= 41 && recipeIndex <= 55) || [20, 22].includes(columnIndex)) {
      return "Winter";
    }

    if (recipeIndex >= 56 && recipeIndex <= 59) {
      return "Always";
    }
  }

  return "";
}

function getRecipeIngredientTagText(recipe) {
  return (recipe.ingredients ?? [])
    .flatMap((section) =>
      (section.items ?? []).map((item) => `${item.raw ?? ""} ${item.item ?? ""}`),
    )
    .join(" ")
    .toLowerCase();
}

function hasProtein(text) {
  return /\b(beef|steak|pork|bacon|ham|sausage|chicken|turkey|duck|lamb|goat|veal|meatball|burger|rib|brisket|chorizo|salami|pepperoni|egg|tofu|tempeh|fish|salmon|tuna|cod|halibut|trout|yellowtail|shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop)\b/.test(text);
}

function hasAnimalProtein(text) {
  return /\b(beef|steak|pork|bacon|ham|sausage|chicken|turkey|duck|lamb|goat|veal|meatball|burger|rib|brisket|chorizo|salami|pepperoni|fish|salmon|tuna|cod|halibut|trout|yellowtail|shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|anchovy|gelatin)\b/.test(text);
}

function hasVegetableFocus(text) {
  return /\b(vegetable|eggplant|mushroom|spinach|kale|cabbage|cauliflower|broccoli|carrot|squash|zucchini|pepper|tomato|tomatillo|potato|bean|lentil|chickpea|pea|corn|tofu|tempeh|greens?|herbs?)\b/.test(text);
}

function addTagIf(tags, tag, condition) {
  if (condition && !tags.includes(tag)) {
    tags.push(tag);
  }
}

function toInsertStatement(recipe, { getCookCount, getLastCookedDate }) {
  const row = [
    recipe.id,
    recipe.id,
    recipe.title,
    recipe.description ?? null,
    recipe.imageUrl ?? null,
    recipe.source?.type ?? null,
    recipe.source?.name ?? null,
    recipe.source?.url ?? null,
    JSON.stringify(recipe.tags),
    recipe.yield?.quantity ?? null,
    recipe.yield?.unit ?? null,
    recipe.yield?.notes ?? null,
    recipe.times?.prepMinutes ?? null,
    recipe.times?.cookMinutes ?? null,
    recipe.times?.totalMinutes ?? null,
    recipe.favorite === true ? 1 : 0,
    recipe.rating ?? null,
    getCookCount(recipe),
    getLastCookedDate(recipe) ?? null,
    JSON.stringify(recipe),
    recipe.version,
    recipe.createdAt,
    recipe.updatedAt,
    null,
  ];

  return `INSERT INTO recipes (
  id,
  slug,
  title,
  description,
  image_url,
  source_type,
  source_name,
  source_url,
  tags_json,
  yield_quantity,
  yield_unit,
  yield_notes,
  prep_minutes,
  cook_minutes,
  total_minutes,
  favorite,
  rating,
  cook_count,
  last_cooked_on,
  recipe_json,
  version,
  created_at,
  updated_at,
  deleted_at
) VALUES (${row.map(toSqlLiteral).join(", ")});`;
}

function toTechniqueInsertStatement(technique) {
  const row = [
    technique.id,
    technique.slug,
    technique.title,
    technique.summary ?? null,
    technique.techniqueType,
    technique.sourceName,
    technique.sourceDocumentPath,
    technique.pageNumber ?? null,
    technique.imageUrl ?? null,
    JSON.stringify(technique.blocks),
    JSON.stringify(technique.tags),
    technique.createdAt,
    technique.updatedAt,
    null,
  ];

  return `INSERT INTO cookbook_techniques (
  id,
  slug,
  title,
  summary,
  technique_type,
  source_name,
  source_document_path,
  page_number,
  image_url,
  blocks_json,
  tags_json,
  created_at,
  updated_at,
  deleted_at
) VALUES (${row.map(toSqlLiteral).join(", ")});`;
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizedImageExtension(epubPath, mediaType) {
  const extension = extname(epubPath).toLowerCase();

  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) {
    return extension === ".jpeg" ? ".jpg" : extension;
  }

  if (mediaType === "image/png") {
    return ".png";
  }

  if (mediaType === "image/webp") {
    return ".webp";
  }

  if (mediaType === "image/gif") {
    return ".gif";
  }

  return ".jpg";
}

function createFilesystemSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);
}

function createImportedId(title, stableKey) {
  const slug = createFilesystemSlug(title) || "entry";

  return `${slug}-${shortHash(stableKey)}`;
}

function shortHash(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36).slice(0, 6).padStart(6, "0");
}

function titleFromFilename(filePath) {
  return filePath
    .split("/")
    .at(-1)
    .replace(/\.epub$/i, "")
    .replace(/\s+--\s+.*$/, "")
    .trim();
}

function parseArgs(rawArgs) {
  const parsed = { _: [] };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--") {
      continue;
    } else if (arg === "--apply") {
      parsed.apply = true;
    } else if (arg === "--local") {
      parsed.remote = false;
    } else if (arg === "--remote") {
      parsed.remote = true;
    } else if (arg === "--database") {
      parsed.database = requireValue(rawArgs, (index += 1), arg);
    } else if (arg === "--base-url") {
      parsed.baseUrl = requireValue(rawArgs, (index += 1), arg);
    } else if (arg === "--out") {
      parsed.out = requireValue(rawArgs, (index += 1), arg);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      parsed._.push(arg);
    }
  }

  return parsed;
}

function requireValue(rawArgs, index, flag) {
  const value = rawArgs[index];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}
