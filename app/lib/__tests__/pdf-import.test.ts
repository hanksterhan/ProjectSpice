import { describe, expect, it } from "vitest";
import { extractPdfText, structurePdfCandidates } from "../pdf-import.server";

describe("PDF import structuring", () => {
  it("extracts embedded PDF text objects for local/dev OCR fallback", async () => {
    const bytes = new TextEncoder().encode(
      "%PDF-1.7\nBT\n(Chocolate Cake) Tj\n(Ingredients) Tj\n(2 cups flour) Tj\n(Directions) Tj\n(Bake until done.) Tj\nET"
    );

    const text = await extractPdfText({} as Env, bytes);

    expect(text).toContain("Chocolate Cake");
    expect(text).toContain("2 cups flour");
  });

  it("creates review candidates from OCR text without Workers AI", async () => {
    const candidates = await structurePdfCandidates(
      {} as Env,
      `Chocolate Cake
Ingredients
2 cups flour
1 cup sugar
Directions
Bake until done.

Picnic Eggs
Ingredients
2 eggs
1 tablespoon mayonnaise
Directions
Mix and serve.`,
      "imports/pdf/demo.pdf"
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      title: "Chocolate Cake",
      checked: true,
      ingredients: ["2 cups flour", "1 cup sugar"],
    });
    expect(candidates[1].sourcePath).toBe("imports/pdf/demo.pdf");
  });
});
