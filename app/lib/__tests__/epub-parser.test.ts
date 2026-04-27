import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseEpubArchive, parseEpubHtmlDocuments } from "../epub-parser";

describe("parseEpubHtmlDocuments", () => {
  it("extracts high-confidence recipes with ingredients and directions", () => {
    const candidates = parseEpubHtmlDocuments({
      "EPUB/chocolate-cake.xhtml": `
        <html><head><title>Chocolate Cake</title></head><body>
          <h1>Chocolate Cake</h1>
          <h2>Ingredients</h2>
          <ul>
            <li>2 cups flour</li>
            <li>1 cup sugar</li>
            <li>3 eggs</li>
          </ul>
          <h2>Directions</h2>
          <p>1. Heat the oven to 350 degrees.</p>
          <p>2. Mix everything and bake.</p>
        </body></html>
      `,
      "EPUB/copyright.xhtml": "<h1>Copyright</h1><p>All rights reserved.</p>",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe("Chocolate Cake");
    expect(candidates[0].checked).toBe(true);
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(70);
    expect(candidates[0].ingredients).toEqual(["2 cups flour", "1 cup sugar", "3 eggs"]);
    expect(candidates[0].directions).toContain("Heat the oven");
  });

  it("keeps lower-confidence chapter candidates unchecked", () => {
    const candidates = parseEpubHtmlDocuments({
      "OEBPS/chapter-1.xhtml": `
        <h1>Picnic Eggs</h1>
        <p>2 eggs</p>
        <p>1 tablespoon mayonnaise</p>
        <p>Salt</p>
      `,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].checked).toBe(false);
  });

  it("uses OPF spine ordering and NCX titles when parsing full EPUB archives", () => {
    const archive = zipSync({
      "OPS/content.opf": strToU8(`
        <package>
          <manifest>
            <item id="second" href="recipes/second.xhtml" media-type="application/xhtml+xml"/>
            <item id="first" href="recipes/first.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine>
            <itemref idref="first"/>
            <itemref idref="second"/>
          </spine>
        </package>
      `),
      "OPS/toc.ncx": strToU8(`
        <ncx>
          <navMap>
            <navPoint><navLabel><text>NCX First Recipe</text></navLabel><content src="recipes/first.xhtml"/></navPoint>
          </navMap>
        </ncx>
      `),
      "OPS/recipes/second.xhtml": strToU8("<h1>Second</h1><h2>Ingredients</h2><p>1 cup rice</p><h2>Directions</h2><p>Cook.</p>"),
      "OPS/recipes/first.xhtml": strToU8("<h1>Ignored Heading</h1><h2>Ingredients</h2><p>1 cup beans</p><h2>Directions</h2><p>Cook.</p>"),
    });

    const candidates = parseEpubArchive(archive);
    expect(candidates.map((c) => c.sourcePath)).toEqual([
      "OPS/recipes/first.xhtml",
      "OPS/recipes/second.xhtml",
    ]);
    expect(candidates[0].title).toBe("NCX First Recipe");
  });
});
