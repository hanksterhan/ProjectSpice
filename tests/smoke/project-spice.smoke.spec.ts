import { expect, test } from "@playwright/test";

test("recipe loop covers library, CRUD, responsive detail, and mocked AI transform", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chilled Desserts" })).toBeVisible();
  await expect(
    page.locator(".recipe-card-copy").getByRole("link", {
      name: "Classic Sundae Bombe",
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "New Recipe" }).click();
  await expect(page.getByRole("heading", { name: "Create Recipe" })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Smoke Test Lemon Cream");
  await page
    .getByLabel("Description")
    .fill("A browser-smoked manual recipe for the v1 loop.");
  await page.getByLabel("Tags").fill("smoke, chilled");
  await page.getByLabel("Yield notes").fill("Serves 2");
  await page.getByLabel("Raw text").fill("1 cup chilled cream");
  await page.getByLabel("Item").fill("chilled cream");
  await page.getByLabel("Step 1").fill("Whip the cream and chill before serving.");
  await page.locator(".editor-header").getByRole("button", { name: "Save Recipe" }).click();

  await expect(page.getByRole("heading", { name: "Smoke Test Lemon Cream" })).toBeVisible();
  await expect(page.getByText("A browser-smoked manual recipe")).toBeVisible();

  await page.getByRole("link", { name: "Edit Recipe" }).click();
  await expect(page.getByRole("heading", { name: "Edit Recipe" })).toBeVisible();
  await page
    .getByLabel("Description")
    .fill("Updated through the smoke edit path.");
  await page.locator(".editor-header").getByRole("button", { name: "Save Recipe" }).click();
  await expect(page.getByText("Updated through the smoke edit path.")).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/recipes/classic-sundae-bombe");
  await expect(page.getByRole("heading", { name: "Classic Sundae Bombe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Directions" }),
  ).toBeVisible();
  await expect(page.getByText("Nabisco Famous Chocolate Wafers")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 820 });
  await page.goto("/recipes/classic-sundae-bombe");
  await expect(page.getByRole("navigation", { name: "Recipe sections" })).toBeVisible();
  await page.getByRole("button", { name: "Chat with assistant" }).click();

  await page.getByLabel("Transform request").fill("Make it lighter and easier.");
  await page.getByLabel("Preferences").fill("less sugar");
  await page.getByRole("button", { name: "Transform Recipe" }).click();
  await expect(
    page.getByRole("heading", { name: "Classic Sundae Bombe, Lightened" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change Summary" })).toBeVisible();
  await expect(page.getByText("Lightened the current recipe for smoke testing.")).toBeVisible();

  await page.getByRole("button", { name: "Save Update" }).click();
  await expect(
    page.getByRole("heading", { name: "Classic Sundae Bombe, Lightened" }),
  ).toBeVisible();
  await expect(page.getByText("v2")).toBeVisible();
});
