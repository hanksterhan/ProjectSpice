import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const HENRY_EMAIL = "henry@spice.local";
const HENRY_PASSWORD = "change-me-henry";
const LOCAL_BASE_URL = "http://127.0.0.1:5173";

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

test("P1 readiness path works for seeded family account", async ({ page, request, baseURL }, testInfo) => {
  const shoppingListName = `Smoke Dinner List ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(HENRY_EMAIL);
  await page.getByLabel("Password").fill(HENRY_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  const onboardingHeading = page.getByRole("heading", { name: /Welcome, Henry!/ });
  if (await onboardingHeading.isVisible()) {
    await expect(onboardingHeading).toBeVisible();
    await page.getByRole("button", { name: "Add a Recipe Manually" }).click();
    await expect(page).toHaveURL(/\/recipes\/new$/);
  }

  await page.goto("/recipes");
  await expect(page.getByText("My Recipes").first()).toBeVisible();

  await page.getByPlaceholder("Search recipes…").fill("chicken");
  await expect(page).toHaveURL(/q=chicken/);
  await expect(page.getByRole("link", { name: /Classic Roast Chicken/ })).toBeVisible();
  await page.getByRole("link", { name: /Classic Roast Chicken/ }).click();

  await expect(page.getByRole("heading", { name: "Classic Roast Chicken" })).toBeVisible();
  const recipeUrl = new URL(page.url());
  const recipeId = recipeUrl.pathname.split("/").pop();
  expect(recipeId).toBeTruthy();

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Description").fill("Simple weeknight roast chicken with crispy skin. Smoke verified.");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Smoke verified.")).toBeVisible();

  await page.getByRole("link", { name: "Cook" }).click();
  await expect(page.locator("main").getByText(/^Step 1 of \d+$/)).toBeVisible();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.locator("main").getByText(/^Step 2 of \d+$/)).toBeVisible();
  await page.getByRole("button", { name: "Exit cooking mode" }).click();
  await expect(page.getByRole("dialog", { name: "How did it go?" })).toBeVisible();
  await page.getByRole("button", { name: "5 stars" }).click();
  await page.getByRole("button", { name: "Save Log" }).click();
  await expect(page.getByRole("heading", { name: "Classic Roast Chicken" })).toBeVisible();
  await expect(page.getByText(/Cooked [1-9]\d*×/)).toBeVisible();

  await page.goto("/meal-planner");
  await expect(page.getByRole("heading", { name: "Meal Planner" })).toBeVisible();
  await page.getByRole("button", { name: /Add meal on/ }).first().click();
  await page.getByRole("combobox").first().selectOption({ label: "Classic Roast Chicken" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Classic Roast Chicken").first()).toBeVisible();

  await page.goto(`/shopping-lists?recipeId=${recipeId}`);
  await page.getByPlaceholder("New list name…").fill(shoppingListName);
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
