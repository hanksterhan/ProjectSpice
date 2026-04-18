// Seed script for local D1 dev database.
// Usage: pnpm seed
//
// Hashes passwords with PBKDF2 (same algorithm as auth.server.ts) then
// inserts 5 family accounts + 10 sample recipes via `wrangler d1 execute`.

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WRANGLER = join(ROOT, "node_modules", ".bin", "wrangler");

export const FAMILY_ACCOUNTS = [
  { email: "henry@spice.local", name: "Henry", passwordPlain: "change-me-henry" },
  { email: "mom@spice.local", name: "Mom", passwordPlain: "change-me-mom" },
  { email: "dad@spice.local", name: "Dad", passwordPlain: "change-me-dad" },
  { email: "kayla@spice.local", name: "Kayla", passwordPlain: "change-me-kayla" },
  { email: "amy@spice.local", name: "Amy", passwordPlain: "change-me-amy" },
];

export const SAMPLE_RECIPES = [
  {
    title: "Classic Roast Chicken",
    source_type: "manual" as const,
    prep_time_min: 15,
    active_time_min: 10,
    total_time_min: 75,
    servings: 4,
    description: "Simple weeknight roast chicken with crispy skin.",
    directions_text:
      "1. Preheat oven to 425°F.\n2. Pat chicken dry.\n3. Season generously with salt and pepper inside and out.\n4. Roast 60 minutes or until juices run clear.",
    ingredients: [
      { quantity_raw: "1", unit_raw: "whole", name: "chicken (3–4 lbs)" },
      { quantity_raw: "2", unit_raw: "tbsp", name: "olive oil" },
      { quantity_raw: "1", unit_raw: "tsp", name: "kosher salt" },
      { quantity_raw: "1/2", unit_raw: "tsp", name: "black pepper" },
    ],
    tags: ["chicken", "weeknight", "oven"],
  },
  {
    title: "Pasta Aglio e Olio",
    source_type: "manual" as const,
    prep_time_min: 5,
    active_time_min: 20,
    total_time_min: 25,
    servings: 2,
    description: "Garlic and olive oil pasta — pantry perfection.",
    directions_text:
      "1. Cook spaghetti al dente.\n2. Sauté thinly sliced garlic in olive oil over low heat until golden.\n3. Add red pepper flakes.\n4. Toss pasta with garlic oil and a splash of pasta water.",
    ingredients: [
      { quantity_raw: "200", unit_raw: "g", name: "spaghetti" },
      { quantity_raw: "6", unit_raw: "cloves", name: "garlic, thinly sliced" },
      { quantity_raw: "4", unit_raw: "tbsp", name: "extra virgin olive oil" },
      { quantity_raw: "1/4", unit_raw: "tsp", name: "red pepper flakes" },
    ],
    tags: ["pasta", "vegetarian", "quick", "pantry"],
  },
  {
    title: "Chocolate Chip Cookies",
    source_type: "manual" as const,
    prep_time_min: 15,
    active_time_min: 12,
    total_time_min: 45,
    servings: 24,
    description: "Classic chewy chocolate chip cookies.",
    directions_text:
      "1. Cream butter and sugars until light and fluffy.\n2. Beat in eggs and vanilla.\n3. Mix in flour, baking soda, and salt.\n4. Fold in chocolate chips.\n5. Bake at 375°F for 10–12 minutes.",
    ingredients: [
      { quantity_raw: "2 1/4", unit_raw: "cups", name: "all-purpose flour" },
      { quantity_raw: "1", unit_raw: "cup", name: "butter, softened" },
      { quantity_raw: "3/4", unit_raw: "cup", name: "granulated sugar" },
      { quantity_raw: "3/4", unit_raw: "cup", name: "packed brown sugar" },
      { quantity_raw: "2", unit_raw: "large", name: "eggs" },
      { quantity_raw: "2", unit_raw: "cups", name: "chocolate chips" },
    ],
    tags: ["baking", "dessert", "cookies"],
  },
  {
    title: "Caesar Salad",
    source_type: "manual" as const,
    prep_time_min: 20,
    active_time_min: 5,
    total_time_min: 25,
    servings: 4,
    description: "Classic Caesar with homemade dressing.",
    directions_text:
      "1. Whisk together garlic, lemon juice, Worcestershire, anchovies, egg yolk, and Parmesan.\n2. Drizzle in olive oil while whisking.\n3. Season with salt and pepper.\n4. Toss with romaine and croutons.",
    ingredients: [
      { quantity_raw: "2", unit_raw: "heads", name: "romaine lettuce" },
      { quantity_raw: "2", unit_raw: "cloves", name: "garlic" },
      { quantity_raw: "2", unit_raw: "tbsp", name: "lemon juice" },
      { quantity_raw: "1/2", unit_raw: "cup", name: "Parmesan, grated" },
    ],
    tags: ["salad", "lunch", "classic"],
  },
  {
    title: "French Onion Soup",
    source_type: "manual" as const,
    prep_time_min: 15,
    active_time_min: 60,
    total_time_min: 90,
    servings: 4,
    description: "Deeply caramelized onion soup with Gruyère crouton.",
    directions_text:
      "1. Caramelize onions in butter over low heat, 45–60 minutes.\n2. Deglaze with white wine.\n3. Add beef broth, thyme, and bay leaf; simmer 20 minutes.\n4. Top with toasted baguette slices and Gruyère.\n5. Broil until cheese is bubbly and golden.",
    ingredients: [
      { quantity_raw: "4", unit_raw: "large", name: "yellow onions, sliced" },
      { quantity_raw: "3", unit_raw: "tbsp", name: "unsalted butter" },
      { quantity_raw: "1/2", unit_raw: "cup", name: "dry white wine" },
      { quantity_raw: "6", unit_raw: "cups", name: "beef broth" },
      { quantity_raw: "1", unit_raw: "cup", name: "Gruyère, shredded" },
    ],
    tags: ["soup", "french", "winter", "comfort"],
  },
  {
    title: "Shakshuka",
    source_type: "manual" as const,
    prep_time_min: 5,
    active_time_min: 25,
    total_time_min: 30,
    servings: 2,
    description: "Eggs poached in spiced tomato sauce.",
    directions_text:
      "1. Sauté onion and peppers until softened.\n2. Add garlic, cumin, paprika, and cayenne; cook 1 minute.\n3. Add crushed tomatoes; simmer 10 minutes.\n4. Make 4 wells; crack in eggs.\n5. Cover and cook until whites are set, about 8 minutes.\n6. Top with crumbled feta and fresh herbs.",
    ingredients: [
      { quantity_raw: "1", unit_raw: "can (28 oz)", name: "crushed tomatoes" },
      { quantity_raw: "4", unit_raw: "large", name: "eggs" },
      { quantity_raw: "1", unit_raw: "tsp", name: "ground cumin" },
      { quantity_raw: "1", unit_raw: "tsp", name: "sweet paprika" },
    ],
    tags: ["eggs", "breakfast", "vegetarian", "middle-eastern"],
  },
  {
    title: "Soy-Glazed Salmon",
    source_type: "manual" as const,
    prep_time_min: 5,
    active_time_min: 15,
    total_time_min: 20,
    servings: 2,
    description: "Quick glazed salmon with ginger and soy.",
    directions_text:
      "1. Whisk together soy sauce, honey, ginger, and garlic.\n2. Marinate salmon for 10 minutes.\n3. Sear skin-down in a hot skillet, 4 minutes.\n4. Flip and cook 2 minutes more, spooning glaze over the fish.",
    ingredients: [
      { quantity_raw: "2", unit_raw: "fillets (6 oz each)", name: "salmon" },
      { quantity_raw: "3", unit_raw: "tbsp", name: "soy sauce" },
      { quantity_raw: "2", unit_raw: "tbsp", name: "honey" },
      { quantity_raw: "1", unit_raw: "tsp", name: "fresh ginger, grated" },
    ],
    tags: ["fish", "quick", "asian-inspired", "weeknight"],
  },
  {
    title: "Banana Bread",
    source_type: "manual" as const,
    prep_time_min: 10,
    active_time_min: 10,
    total_time_min: 75,
    servings: 10,
    description: "Moist banana bread using overripe bananas.",
    directions_text:
      "1. Preheat oven to 350°F; grease a loaf pan.\n2. Mash bananas with a fork.\n3. Mix with melted butter, sugar, egg, and vanilla.\n4. Stir in flour, baking soda, and salt.\n5. Pour into pan and bake 60–65 minutes.",
    ingredients: [
      { quantity_raw: "3", unit_raw: "large", name: "overripe bananas" },
      { quantity_raw: "1/3", unit_raw: "cup", name: "unsalted butter, melted" },
      { quantity_raw: "3/4", unit_raw: "cup", name: "sugar" },
      { quantity_raw: "1 1/2", unit_raw: "cups", name: "all-purpose flour" },
    ],
    tags: ["baking", "bread", "breakfast", "banana"],
  },
  {
    title: "Chicken Tikka Masala",
    source_type: "manual" as const,
    prep_time_min: 20,
    active_time_min: 30,
    total_time_min: 50,
    servings: 4,
    description: "Creamy tomato-based curry with tender chicken.",
    directions_text:
      "1. Marinate chicken in yogurt, garlic, ginger, and spices for 30 minutes.\n2. Broil chicken until slightly charred at edges.\n3. Sauté onion, garlic, and tomatoes; add cream and garam masala.\n4. Add chicken to sauce and simmer 15 minutes.",
    ingredients: [
      { quantity_raw: "2", unit_raw: "lbs", name: "chicken thighs, cubed" },
      { quantity_raw: "1", unit_raw: "cup", name: "full-fat yogurt" },
      { quantity_raw: "1", unit_raw: "can (14 oz)", name: "crushed tomatoes" },
      { quantity_raw: "1/2", unit_raw: "cup", name: "heavy cream" },
      { quantity_raw: "2", unit_raw: "tsp", name: "garam masala" },
    ],
    tags: ["chicken", "indian", "curry", "dinner"],
  },
  {
    title: "Avocado Toast",
    source_type: "manual" as const,
    prep_time_min: 5,
    active_time_min: 5,
    total_time_min: 10,
    servings: 2,
    description: "Simple avocado toast with everything bagel seasoning.",
    directions_text:
      "1. Toast sourdough slices until golden.\n2. Mash avocado with lemon juice and a pinch of salt.\n3. Spread on toast.\n4. Top with everything bagel seasoning and red pepper flakes.",
    ingredients: [
      { quantity_raw: "2", unit_raw: "slices", name: "sourdough bread" },
      { quantity_raw: "1", unit_raw: "large", name: "ripe avocado" },
      { quantity_raw: "1", unit_raw: "tsp", name: "lemon juice" },
      { quantity_raw: "1", unit_raw: "tsp", name: "everything bagel seasoning" },
    ],
    tags: ["breakfast", "quick", "vegetarian", "avocado"],
  },
];

const PBKDF2_ITERATIONS = 100_000;

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256
  );
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hashHex = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
}

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  console.log("ProjectSpice seed script\n");

  // 1. Hash passwords (PBKDF2, same algo as auth.server.ts)
  console.log("Hashing passwords...");
  const now = Date.now();
  const users = await Promise.all(
    FAMILY_ACCOUNTS.map(async (a) => ({
      id: globalThis.crypto.randomUUID(),
      email: a.email,
      name: a.name,
      passwordHash: await hashPassword(a.passwordPlain),
    }))
  );
  const henry = users[0];

  // 2. Build tag set (deduped) for Henry's sample recipes
  const allTags = [...new Set(SAMPLE_RECIPES.flatMap((r) => r.tags))];
  const tagRows = allTags.map((name) => ({
    id: globalThis.crypto.randomUUID(),
    name,
  }));
  const tagIdByName = Object.fromEntries(tagRows.map((t) => [t.name, t.id]));

  // 3. Build recipe rows
  const recipeRows = SAMPLE_RECIPES.map((r) => ({
    id: globalThis.crypto.randomUUID(),
    title: r.title,
    slug: slug(r.title),
    sourceType: r.source_type,
    prepTimeMin: r.prep_time_min,
    activeTimeMin: r.active_time_min,
    totalTimeMin: r.total_time_min,
    servings: r.servings,
    description: r.description,
    directionsText: r.directions_text,
    ingredients: r.ingredients,
    tags: r.tags,
  }));

  // 4. Build SQL
  const lines: string[] = [];

  // Clear existing seed data (idempotent)
  lines.push("DELETE FROM users;");

  // Users
  for (const u of users) {
    lines.push(
      `INSERT INTO users (id, email, password_hash, name, created_at) VALUES ('${u.id}', '${esc(u.email)}', '${esc(u.passwordHash)}', '${esc(u.name)}', ${now});`
    );
  }

  // Tags (Henry's)
  for (const t of tagRows) {
    lines.push(
      `INSERT INTO tags (id, user_id, name, created_at) VALUES ('${t.id}', '${henry.id}', '${esc(t.name)}', ${now});`
    );
  }

  // Recipes + ingredients + recipe_tags (all under Henry)
  for (const r of recipeRows) {
    lines.push(
      `INSERT INTO recipes (id, user_id, title, slug, source_type, description, prep_time_min, active_time_min, total_time_min, servings, directions_text, visibility, created_at, updated_at) VALUES ('${r.id}', '${henry.id}', '${esc(r.title)}', '${esc(r.slug)}', '${esc(r.sourceType)}', '${esc(r.description ?? "")}', ${r.prepTimeMin ?? "NULL"}, ${r.activeTimeMin ?? "NULL"}, ${r.totalTimeMin ?? "NULL"}, ${r.servings ?? "NULL"}, '${esc(r.directionsText)}', 'private', ${now}, ${now});`
    );

    r.ingredients.forEach((ing, i) => {
      const ingId = globalThis.crypto.randomUUID();
      lines.push(
        `INSERT INTO ingredients (id, recipe_id, sort_order, quantity_raw, unit_raw, name) VALUES ('${ingId}', '${r.id}', ${i}, '${esc(ing.quantity_raw ?? "")}', '${esc(ing.unit_raw ?? "")}', '${esc(ing.name)}');`
      );
    });

    for (const tagName of r.tags) {
      const tagId = tagIdByName[tagName];
      if (tagId) {
        lines.push(
          `INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ('${r.id}', '${tagId}');`
        );
      }
    }
  }

  // 5. Write temp SQL file and execute
  const sqlFile = join(tmpdir(), `projectspice-seed-${Date.now()}.sql`);
  writeFileSync(sqlFile, lines.join("\n") + "\n");

  console.log(
    `Executing ${lines.length} SQL statements against local D1...\n`
  );
  try {
    execFileSync(WRANGLER, ["d1", "execute", "DB", "--local", `--file=${sqlFile}`], {
      stdio: "inherit",
      cwd: ROOT,
    });
  } finally {
    unlinkSync(sqlFile);
  }

  console.log("\nSeed complete!");
  console.log(`  ${users.length} family accounts created:`);
  FAMILY_ACCOUNTS.forEach((a) =>
    console.log(`    ${a.name} <${a.email}> / ${a.passwordPlain}`)
  );
  console.log(`  ${recipeRows.length} sample recipes seeded under Henry`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
