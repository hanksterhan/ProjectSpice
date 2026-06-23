import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { validRecipeDraftFixture, validRecipeFixture } from "~/modules/recipe-domain";
import type { RecipeLens, RecipeLensSummary } from "~/modules/recipe-lenses";

import { CookHistoryDrawer, RecipeLensDrawer, RecipeViewer } from "../RecipeViewer";

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
    expect(markup).toContain(
      "Reduce estimated calories while keeping the recipe satisfying.",
    );
    expect(markup).toContain("Faster prep and cook time.");
    expect(markup).toContain("Uses one pan and prepped vegetables");
    expect(markup).toContain("Edit lens");
  });

  it("offers saved recipe versions when recording cook history", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <CookHistoryDrawer
            activeLensKey="quick"
            lensSummaries={[quickLensSummary]}
            onClose={() => undefined}
            recipe={validRecipeFixture}
          />
        ),
      },
    ]);
    const markup = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(markup).toContain("Cook History");
    expect(markup).toContain("Recipe version");
    expect(markup).toContain('<option value="original">Original</option>');
    expect(markup).toContain('<option value="quick" selected="">Quick</option>');
    expect(markup).not.toContain('<option value="lower-cal">Lower-Cal</option>');
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
