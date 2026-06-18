import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { validRecipeDraftFixture, validRecipeFixture } from "~/modules/recipe-domain";
import type { RecipeLens, RecipeLensSummary } from "~/modules/recipe-lenses";

import { RecipeLensDrawer, RecipeViewer } from "../RecipeViewer";

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

const quickLensSummary: RecipeLensSummary = {
  id: quickLens.id,
  recipeId: quickLens.recipeId,
  lensKey: quickLens.lensKey,
  notes: quickLens.notes,
  createdAt: quickLens.createdAt,
  updatedAt: quickLens.updatedAt,
};

describe("RecipeViewer recipe lenses", () => {
  it("keeps the recipe content focused when a lens is selected", () => {
    const markup = renderViewer({
      activeLensKey: "lower-cal",
      activeLens: null,
    });

    expect(markup).toContain("Viewing lens");
    expect(markup).toContain("Lower-Cal");
    expect(markup).toContain(validRecipeFixture.title);
    expect(markup).not.toContain("Recipe view");
  });

  it("renders a saved lens recipe draft", () => {
    const markup = renderViewer({
      activeLensKey: "quick",
      activeLens: quickLens,
    });

    expect(markup).toContain("Quick Sesame Chicken Bowls");
    expect(markup).toContain("Viewing lens");
  });

  it("shows lens navigation and notes in the drawer", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <RecipeLensDrawer
          activeLens={quickLens}
          activeLensKey="quick"
          lensSummaries={[quickLensSummary]}
          onClose={() => undefined}
          recipe={validRecipeFixture}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Recipe lenses");
    expect(markup).toContain("Original");
    expect(markup).toContain("Lower-Cal");
    expect(markup).toContain("Glucose");
    expect(markup).toContain("Quick");
    expect(markup).toContain("Max Flavor");
    expect(markup).toContain("Trim calories; keep flavor.");
    expect(markup).toContain("Faster prep and cook time.");
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
