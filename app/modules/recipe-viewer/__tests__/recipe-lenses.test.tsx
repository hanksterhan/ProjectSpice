import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { validRecipeDraftFixture, validRecipeFixture } from "~/modules/recipe-domain";
import type { RecipeLens } from "~/modules/recipe-lenses";

import { RecipeViewer } from "../RecipeViewer";

const quickLens: RecipeLens = {
  id: "weeknight-sesame-chicken-bowls:quick",
  recipeId: validRecipeFixture.id,
  lensKey: "quick",
  notes: "Uses one pan and prepped vegetables to cut total time.",
  recipeDraft: {
    ...validRecipeDraftFixture,
    title: "Quick Sesame Chicken Bowls",
    tags: ["quick", "chicken"],
  },
  createdAt: "2026-06-18T08:00:00.000Z",
  updatedAt: "2026-06-18T08:00:00.000Z",
};

describe("RecipeViewer recipe lenses", () => {
  it("shows lens tabs and an empty state for unsaved lenses", () => {
    const markup = renderViewer({
      activeLensKey: "lower-cal",
      activeLens: null,
      savedLensKeys: [],
    });

    expect(markup).toContain("Original");
    expect(markup).toContain("Lower-Cal");
    expect(markup).toContain("Glucose");
    expect(markup).toContain("Quick");
    expect(markup).toContain("Max Flavor");
    expect(markup).toContain("No lower-cal lens saved yet.");
    expect(markup).toContain("Create lens");
    expect(markup).toContain(validRecipeFixture.title);
  });

  it("renders a saved lens recipe draft and notes", () => {
    const markup = renderViewer({
      activeLensKey: "quick",
      activeLens: quickLens,
      savedLensKeys: ["quick"],
    });

    expect(markup).toContain("Quick Sesame Chicken Bowls");
    expect(markup).toContain("Uses one pan and prepped vegetables");
    expect(markup).toContain("Edit lens");
  });
});

function renderViewer(
  props: Omit<Parameters<typeof RecipeViewer>[0], "recipe">,
): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RecipeViewer recipe={validRecipeFixture} {...props} />
    </MemoryRouter>,
  );
}
