import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";

const HENRY_EMAIL = "henry@spice.local";
const HENRY_PASSWORD = "change-me-henry";
const LOCAL_BASE_URL = "http://127.0.0.1:5173";
const CHICKEN_RECIPE = "Classic Roast Chicken";

function resetLocalSmokeData() {
  if (process.env.PROJECTSPICE_SMOKE_BASE_URL) return;
  execFileSync("pnpm", ["smoke:setup"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
}

test.beforeEach(() => {
  resetLocalSmokeData();
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(HENRY_EMAIL);
  await page.getByLabel("Password").fill(HENRY_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  const onboardingHeading = page.getByRole("heading", { name: /Welcome, Henry/ });
  if (await onboardingHeading.isVisible()) {
    await page.getByRole("button", { name: "Add manually" }).click();
    await expect(page).toHaveURL(/\/recipes\/new$/);
  }
}

async function openChickenRecipe(page: Page) {
  await page.goto("/recipes");
  await page.getByPlaceholder("Search title, ingredient, or note").fill("chicken");
  await expect(page).toHaveURL(/q=chicken/);
  await page.getByRole("link", { name: new RegExp(CHICKEN_RECIPE) }).click();
  await expect(page.getByRole("heading", { name: CHICKEN_RECIPE })).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop() ?? "";
}

async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string
) {
  await page.evaluate(() => document.fonts.ready);
  await testInfo.attach(`${testInfo.project.name}-${name}`, {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  });
}

test("P1 readiness path works for seeded family account", async ({ page, request, baseURL }, testInfo) => {
  const shoppingListName = `Smoke Dinner List ${testInfo.project.name} ${Date.now()}`;

  await signIn(page);

  await page.goto("/recipes");
  await expect(page.getByRole("heading", { name: "Recipes" })).toBeVisible();

  await page.getByPlaceholder("Search title, ingredient, or note").fill("chicken");
  await expect(page).toHaveURL(/q=chicken/);
  await expect(page.getByRole("link", { name: /Classic Roast Chicken/ })).toBeVisible();
  await page.getByRole("link", { name: /Classic Roast Chicken/ }).click();

  await expect(page.getByRole("heading", { name: CHICKEN_RECIPE })).toBeVisible();
  const recipeUrl = new URL(page.url());
  const recipeId = recipeUrl.pathname.split("/").pop();
  expect(recipeId).toBeTruthy();

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Description").fill("Simple weeknight roast chicken with crispy skin. Smoke verified.");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Smoke verified.")).toBeVisible();

  await page.getByRole("link", { name: "Cook" }).click();
  await expect(page.getByText(/Step 1 of \d+:/)).toBeAttached();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(/Step 2 of \d+:/)).toBeAttached();
  await page.getByRole("button", { name: "Exit cooking mode" }).click();
  await expect(page.getByRole("dialog", { name: "How did it go?" })).toBeVisible();
  await page.getByRole("button", { name: "5 stars" }).click();
  await page.getByRole("button", { name: "Save Log" }).click();
  await expect(page.getByRole("heading", { name: CHICKEN_RECIPE })).toBeVisible();
  await expect(page.getByText(/Cooked [1-9]\d*x/)).toBeVisible();

  await page.goto("/meal-planner");
  await expect(page.getByRole("heading", { name: "Meal Planner" })).toBeVisible();
  await page.getByRole("button", { name: /Add meal on/ }).first().click();
  await page.getByRole("combobox").first().selectOption({ label: "Classic Roast Chicken" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Classic Roast Chicken").first()).toBeVisible();

  await page.goto(`/shopping-lists?recipeId=${recipeId}`);
  await page.getByPlaceholder("New list name...").fill(shoppingListName);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(shoppingListName)).toBeVisible();
  await page.getByRole("button", { name: "+ Manual" }).click();
  await page.getByPlaceholder("Item name (e.g. olive oil, flour)").fill("lemons");
  await page.getByPlaceholder("Qty").fill("2");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("2 lemons")).toBeVisible();

  const imageBaseURL = baseURL ?? process.env.PROJECTSPICE_SMOKE_BASE_URL ?? LOCAL_BASE_URL;
  const exportResponse = await page.context().request.get(`${imageBaseURL}/api/export`);
  expect(exportResponse?.ok()).toBe(true);
  expect(exportResponse?.headers()["content-type"]).toContain("application/zip");

  const imageResponse = await request.get(`${imageBaseURL}/cdn/images/smoke/readiness.png`);
  expect(imageResponse.status()).toBe(200);
  expect(imageResponse.headers()["content-type"]).toContain("image/png");
});

test("captures responsive visual baselines for home, library, and recipe detail", async ({
  page,
}, testInfo) => {
  await signIn(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Cook from the family shelf|Family recipes/i })).toBeVisible();
  await attachScreenshot(page, testInfo, "home");

  await page.goto("/recipes?view=list&density=compact&scope=mine");
  await expect(page.getByRole("heading", { name: "Recipes" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
  await attachScreenshot(page, testInfo, "library-list-compact");

  await openChickenRecipe(page);
  await attachScreenshot(page, testInfo, "recipe-detail");
});

test("preserves library URL state across filters, view, density, and incremental loading", async ({
  page,
}) => {
  await signIn(page);

  await page.goto("/recipes?q=chicken&view=list&density=compact&scope=mine");
  await expect(page.getByPlaceholder("Search title, ingredient, or note")).toHaveValue("chicken");
  await expect(page.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Compact" })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("radio", { name: "Comfy" }).click();
  await expect(page).toHaveURL(/density=comfy/);
  await expect(page).toHaveURL(/q=chicken/);
  await expect(page).toHaveURL(/view=list/);

  await page.getByRole("radio", { name: "A-Z" }).click();
  await expect(page).toHaveURL(/sort=alpha/);
  await expect(page).toHaveURL(/q=chicken/);

  await page.goto("/recipes?limit=30&view=list&density=comfy&scope=mine");
  await expect(page.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Comfy" })).toHaveAttribute("aria-checked", "true");
});

test("renders dark and high-contrast visual modes without losing core controls", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("spice_contrast_mode", "high");
  });
  await signIn(page);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.contrast = "high";
  });

  await page.goto("/recipes");
  await expect(page.getByRole("heading", { name: "Recipes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New recipe" })).toBeVisible();

  const colors = await page.locator("body").evaluate((body) => {
    const styles = getComputedStyle(body);
    return {
      background: styles.backgroundColor,
      color: styles.color,
    };
  });
  expect(colors.background).not.toBe(colors.color);
  await attachScreenshot(page, testInfo, "dark-high-contrast-library");
});

test("covers cooking-mode interactions plus AI and import smoke surfaces", async ({ page }) => {
  await signIn(page);
  await openChickenRecipe(page);

  await page.getByRole("button", { name: "Lighter" }).click();
  await expect(page.getByText("Viewing through AI Lens")).toBeVisible();
  await expect(page).toHaveURL(/lens=lighter/);

  await page.getByRole("link", { name: "Improve" }).click();
  await expect(page.getByRole("heading", { name: CHICKEN_RECIPE })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI Lens" })).toBeVisible();
  await expect(page.getByText("No AI profiles yet.")).toBeVisible();

  await openChickenRecipe(page);
  await page.getByRole("link", { name: "Start cooking" }).click();
  const addTimerButton = page.getByRole("button", { name: "Add timer" });
  if (await addTimerButton.isVisible()) {
    await addTimerButton.click();
  } else {
    await page
      .getByRole("button", { name: "Add", exact: true })
      .evaluate((button: HTMLElement) => button.click());
  }
  await expect(page.getByRole("dialog", { name: "New timer" })).toBeVisible();
  await page.getByPlaceholder("Simmer sauce").fill("Smoke timer");
  await page.getByLabel("Minutes").fill("0");
  await page.getByLabel("Seconds").fill("5");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Smoke timer")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/Step 2 of \d+:/)).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Exit cooking mode?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep cooking" }).click();

  await page.goto("/imports/paprika");
  await expect(page.getByRole("heading", { name: "Import Review" })).toBeVisible();
  await expect(page.getByLabel("Select .paprikarecipes file")).toBeVisible();
  await expect(page.getByText("How to export from Paprika 3")).toBeVisible();
});
