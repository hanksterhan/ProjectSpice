import { posix as path } from "node:path";

import {
  createRecipeSlug,
  recipeDraftSchema,
  type DirectionSection,
  type IngredientSection,
  type RecipeVariation,
} from "~/modules/recipe-domain";

import type {
  CookbookEpubContentDocument,
  CookbookEpubExtraction,
  CookbookEpubImageAsset,
  CookbookEpubImageRef,
  CookbookEpubImageRole,
  CookbookEpubMetadata,
  CookbookTechniqueBlock,
  CookbookTechniqueType,
  ExtractedCookbookRecipe,
  ExtractedCookbookTechnique,
} from "./cookbook-epub.types";
import { readEpubZip, type EpubZipEntry } from "./epub-zip";

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
  fullPath: string;
};

type ParsedEpub = {
  entries: Map<string, EpubZipEntry>;
  metadata: CookbookEpubMetadata;
  manifestItems: ManifestItem[];
  documents: CookbookEpubContentDocument[];
  images: ImageCatalogEntry[];
};

type ImageCatalogEntry = {
  epubPath: string;
  mediaType: string;
  byteLength: number;
  index: number;
  pageNumber?: number;
};

type RankedImageCandidate = {
  image: ImageCatalogEntry;
  role: CookbookEpubImageRole;
  alt?: string;
  score: number;
};

type BlockType = "heading" | "paragraph" | "listItem" | "image" | "pagebreak" | "table";

type ContentBlock = {
  type: BlockType;
  text: string;
  html: string;
  tagName: string;
  className?: string;
  id?: string;
  hrefs: string[];
  imagePath?: string;
  imageAlt?: string;
  tableRows?: string[][];
  headingLevel?: number;
  listValue?: number;
  pageNumber?: number;
  blockIndex: number;
  documentPath: string;
  spineIndex: number;
};

type RecipeSegment = {
  heading: ContentBlock;
  blocks: ContentBlock[];
  nextHeading?: ContentBlock;
};

export function extractCookbookEpub(buffer: Uint8Array): CookbookEpubExtraction {
  const parsed = parseCookbookEpub(buffer);

  return extractCookbookContentFromDocuments({
    metadata: parsed.metadata,
    documents: parsed.documents,
    images: parsed.images,
  });
}

export function extractCookbookEpubImageAsset(
  buffer: Uint8Array,
  epubPath: string,
): CookbookEpubImageAsset {
  const entries = readEpubZip(buffer);
  const entry = entries.get(epubPath);

  if (!entry) {
    throw new Error(`Could not find image ${epubPath} in EPUB.`);
  }

  return {
    path: epubPath,
    mediaType: mediaTypeFromPath(epubPath),
    data: entry.data,
  };
}

export function extractCookbookContentFromDocuments({
  metadata = {},
  documents,
  images = [],
}: {
  metadata?: CookbookEpubMetadata;
  documents: CookbookEpubContentDocument[];
  images?: Array<Omit<ImageCatalogEntry, "index"> & { index?: number }>;
}): CookbookEpubExtraction {
  const imageCatalog = images.map((image, index) => ({
    ...image,
    index: image.index ?? index,
  }));
  const blocks = documents.flatMap((document) => parseContentBlocks(document));
  const captionImageMap = buildCaptionImageMap(blocks, imageCatalog);
  const recipeSegments = findRecipeSegments(blocks);
  const recipes = dedupeRecipeImages(
    recipeSegments
    .flatMap((segment, index) =>
      toExtractedRecipes(segment, {
        index,
        metadata,
        imageCatalog,
        captionImageMap,
      }),
    )
    .filter((recipe): recipe is ExtractedCookbookRecipe => recipe !== undefined),
  );
  const recipeHeadingKeys = new Set(
    recipeSegments.map((segment) => blockKey(segment.heading)),
  );
  const techniques = findTechniqueSegments(blocks, recipeHeadingKeys)
    .map((segment, index) =>
      toExtractedTechnique(segment, {
        index,
        imageCatalog,
        captionImageMap,
      }),
    )
    .filter((technique): technique is ExtractedCookbookTechnique =>
      technique !== undefined,
    );

  return {
    metadata,
    recipes,
    techniques,
    images: imageCatalog.map((image) => toImageRef(image, "inline")),
    warnings: recipes.length === 0 ? ["No recipes were detected in the EPUB."] : [],
  };
}

function parseCookbookEpub(buffer: Uint8Array): ParsedEpub {
  const entries = readEpubZip(buffer);
  const opfPath = findOpfPath(entries);
  const opf = readTextEntry(entries, opfPath);
  const basePath = path.dirname(opfPath);
  const manifestItems = parseManifestItems(opf, basePath);
  const metadata = parseMetadata(opf);
  const documents = parseSpineDocuments(opf, manifestItems, entries);
  const imageManifestItems = manifestItems.filter((item) =>
    item.mediaType.startsWith("image/"),
  );
  const images = imageManifestItems
    .flatMap((item, index) => {
      const entry = entries.get(item.fullPath);

      return entry
        ? [
            removeUndefined({
              epubPath: item.fullPath,
              mediaType: item.mediaType,
              byteLength: entry.uncompressedSize,
              index,
              pageNumber: parsePageNumber(item.fullPath),
            }),
          ]
        : [];
    });

  return {
    entries,
    metadata,
    manifestItems,
    documents,
    images,
  };
}

function findOpfPath(entries: Map<string, EpubZipEntry>): string {
  const container = readTextEntry(entries, "META-INF/container.xml");
  const match = /full-path=["']([^"']+\.opf)["']/i.exec(container);

  if (match?.[1]) {
    return match[1];
  }

  const opfPath = Array.from(entries.keys()).find((entryPath) =>
    entryPath.endsWith(".opf"),
  );

  if (!opfPath) {
    throw new Error("Could not find EPUB package document.");
  }

  return opfPath;
}

function parseManifestItems(opf: string, basePath: string): ManifestItem[] {
  return Array.from(opf.matchAll(/<item\b([^>]*)\/?>/gi)).flatMap((match) => {
    const attributes = parseAttributes(match[1]);
    const id = attributes.id;
    const href = attributes.href;
    const mediaType = attributes["media-type"];

    if (!id || !href || !mediaType) {
      return [];
    }

    return [
      {
        id,
        href,
        mediaType,
        properties: attributes.properties,
        fullPath: normalizeEpubPath(basePath, href),
      },
    ];
  });
}

function parseMetadata(opf: string): CookbookEpubMetadata {
  return removeUndefined({
    title: firstXmlText(opf, "dc:title") ?? firstMetaContent(opf, "title"),
    creator: firstXmlText(opf, "dc:creator"),
    publisher: firstXmlText(opf, "dc:publisher"),
    language: firstXmlText(opf, "dc:language"),
  });
}

function parseSpineDocuments(
  opf: string,
  manifestItems: ManifestItem[],
  entries: Map<string, EpubZipEntry>,
): CookbookEpubContentDocument[] {
  const manifestById = new Map(manifestItems.map((item) => [item.id, item]));
  const spineIds = Array.from(opf.matchAll(/<itemref\b([^>]*)\/?>/gi))
    .map((match) => parseAttributes(match[1]).idref)
    .filter(isText);
  const spineItems = spineIds
    .map((id) => manifestById.get(id))
    .filter((item): item is ManifestItem => item !== undefined);
  const contentItems = spineItems.length
    ? spineItems
    : manifestItems.filter((item) => item.mediaType === "application/xhtml+xml");

  return contentItems.flatMap((item, index) => {
    const entry = entries.get(item.fullPath);

    if (!entry) {
      return [];
    }

    return [
      {
        path: item.fullPath,
        html: bufferToText(entry.data),
        spineIndex: index,
      },
    ];
  });
}

function parseContentBlocks(document: CookbookEpubContentDocument): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let currentPage: number | undefined;
  const pattern =
    /<table\b([^>]*)>([\s\S]*?)<\/table>|<(h[1-6]|p|li|img|span|blockquote)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\3>)/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(document.html)) !== null) {
    if (match[0].toLowerCase().startsWith("<table")) {
      const attributes = parseAttributes(match[1]);
      const tableRows = parseHtmlTableRows(match[2] ?? "");

      if (tableRows.length === 0) {
        continue;
      }

      blocks.push({
        type: "table",
        text: tableRows.map((row) => row.join(" | ")).join("\n"),
        html: match[0],
        tagName: "table",
        className: attributes.class,
        id: attributes.id,
        hrefs: extractHrefs(match[0], document.path),
        tableRows,
        pageNumber: currentPage,
        blockIndex: blocks.length,
        documentPath: document.path,
        spineIndex: document.spineIndex,
      });
      continue;
    }

    const tagName = match[3].toLowerCase();
    const attributes = parseAttributes(match[4]);
    const innerHtml = match[5] ?? "";
    const blockIndex = blocks.length;

    if (tagName === "span" && attributes["epub:type"]?.includes("pagebreak")) {
      currentPage = parsePageNumber(attributes.title ?? attributes.id);
      blocks.push({
        type: "pagebreak",
        text: "",
        html: match[0],
        tagName,
        className: attributes.class,
        id: attributes.id,
        hrefs: [],
        pageNumber: currentPage,
        blockIndex,
        documentPath: document.path,
        spineIndex: document.spineIndex,
      });
      continue;
    }

    if (tagName === "img") {
      const src = attributes.src;

      if (!src) {
        continue;
      }

      blocks.push({
        type: "image",
        text: normalizeText(attributes.alt ?? ""),
        html: match[0],
        tagName,
        className: attributes.class,
        id: attributes.id,
        hrefs: [],
        imagePath: normalizeEpubPath(path.dirname(document.path), src),
        imageAlt: normalizeText(attributes.alt ?? "") || undefined,
        pageNumber: currentPage,
        blockIndex,
        documentPath: document.path,
        spineIndex: document.spineIndex,
      });
      continue;
    }

    if (tagName === "span") {
      continue;
    }

    const text = normalizeHtmlText(innerHtml);
    const nestedImages = extractImageAttributes(innerHtml);
    const inlinePageNumber = extractPageBreakPageNumber(innerHtml);
    const blockPageNumber = inlinePageNumber ?? currentPage;

    if (inlinePageNumber !== undefined) {
      currentPage = inlinePageNumber;
    }

    if (nestedImages.length > 0) {
      for (const imageAttributes of nestedImages) {
        if (!imageAttributes.src) {
          continue;
        }

        blocks.push({
          type: "image",
          text: normalizeText(imageAttributes.alt ?? ""),
          html: match[0],
          tagName: "img",
          className: imageAttributes.class ?? attributes.class,
          id: imageAttributes.id ?? attributes.id,
          hrefs: [],
          imagePath: normalizeEpubPath(path.dirname(document.path), imageAttributes.src),
          imageAlt: normalizeText(imageAttributes.alt ?? "") || undefined,
          pageNumber: blockPageNumber,
          blockIndex: blocks.length,
          documentPath: document.path,
          spineIndex: document.spineIndex,
        });
      }
    }

    if (!text) {
      continue;
    }

    blocks.push({
      type: tagName.startsWith("h") || looksLikeFormattedTitle(innerHtml) || looksLikeRecipeTitleClass(attributes.class)
        ? "heading"
        : tagName === "li"
          ? "listItem"
          : "paragraph",
      text,
      html: match[0],
      tagName,
      className: attributes.class,
      id: attributes.id,
      hrefs: extractHrefs(innerHtml, document.path),
      headingLevel: tagName.startsWith("h") ? Number(tagName.slice(1)) : undefined,
      listValue: tagName === "li" ? parseListValue(attributes.value) : undefined,
      pageNumber: blockPageNumber,
      blockIndex,
      documentPath: document.path,
      spineIndex: document.spineIndex,
    });
  }

  return blocks;
}

function buildCaptionImageMap(
  blocks: ContentBlock[],
  imageCatalog: ImageCatalogEntry[],
): Map<string, ImageCatalogEntry[]> {
  const imagesByPath = new Map(imageCatalog.map((image) => [image.epubPath, image]));
  const map = new Map<string, ImageCatalogEntry[]>();

  blocks.forEach((block, index) => {
    if (block.hrefs.length === 0) {
      return;
    }

    const nearbyImage = findNearbyImageBlock(blocks, index, -6, imagesByPath);

    if (!nearbyImage) {
      return;
    }

    for (const href of block.hrefs) {
      const current = map.get(href) ?? [];
      current.push(nearbyImage);
      map.set(href, current);
    }
  });

  return map;
}

function findRecipeSegments(blocks: ContentBlock[]): RecipeSegment[] {
  const headings = blocks.filter(
    (block) => block.type === "heading" && looksLikeRecipeHeading(block, blocks),
  );

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    const leadingImage = findLeadingImageBeforeHeading(blocks, heading);
    const startBlock = leadingImage ?? heading;
    const nextBoundary = findNextSegmentBoundary(blocks, heading);
    const nextLeadingImage = nextBoundary
      ? findLeadingImageBeforeHeading(blocks, nextBoundary)
      : undefined;
    const endBlock = nextLeadingImage ?? nextBoundary;

    return {
      heading,
      nextHeading,
      blocks: blocks.filter(
        (block) =>
          compareBlockPosition(block, startBlock) >= 0 &&
          (!endBlock || compareBlockPosition(block, endBlock) < 0),
      ),
    };
  });
}

function findNextSegmentBoundary(
  blocks: ContentBlock[],
  heading: ContentBlock,
): ContentBlock | undefined {
  return blocks.find(
    (block) =>
      compareBlockPosition(block, heading) > 0 &&
      block.type === "heading" &&
      blockKey(block) !== blockKey(heading),
  );
}

function findLeadingImageBeforeHeading(
  blocks: ContentBlock[],
  heading: ContentBlock,
): ContentBlock | undefined {
  const headingPosition = blocks.findIndex((block) => blockKey(block) === blockKey(heading));

  for (let index = headingPosition - 1; index >= Math.max(0, headingPosition - 3); index -= 1) {
    const block = blocks[index];

    if (!block || block.type === "pagebreak" || isNavigationBlock(block)) {
      continue;
    }

    if (block.type !== "image") {
      return undefined;
    }

    if (
      block.documentPath === heading.documentPath ||
      (looksLikeCalibreSplitTitle(heading) &&
        isStandaloneImageDocument(blocks, block.documentPath))
    ) {
      return block;
    }

    return undefined;
  }

  return undefined;
}

function isStandaloneImageDocument(blocks: ContentBlock[], documentPath: string): boolean {
  const documentBlocks = blocks.filter((block) => block.documentPath === documentPath);
  const meaningfulBlocks = documentBlocks.filter(
    (block) => block.type !== "pagebreak" && !isNavigationBlock(block),
  );

  return meaningfulBlocks.length > 0 && meaningfulBlocks.every((block) => block.type === "image");
}

function looksLikeCalibreSplitTitle(block: ContentBlock): boolean {
  return /class=["'][^"']*\bcalibre2\b/i.test(block.html);
}

function looksLikeRecipeHeading(
  heading: ContentBlock,
  blocks: ContentBlock[],
): boolean {
  const className = heading.className ?? "";

  if (/h3b|h3ca/i.test(className)) {
    return false;
  }

  if (/recipe[_-]?title|recipetitle|subrecipetitle/i.test(className)) {
    return true;
  }

  if (/mini_toc|toc|chapter|section|copyright|index/i.test(className)) {
    return false;
  }

  const following = followingBlocks(blocks, heading, 18);
  const extendedFollowing = followingBlocks(blocks, heading, 120);
  const hasYield = following.some((block) => isYieldBlock(block));
  const ingredientLines = following.filter((block) => isIngredientBlock(block));
  const methodLines = following.filter((block) => isDirectionBlock(block));
  const hasSaladLabStructure =
    extendedFollowing.some((block) => isYieldBlock(block)) &&
    extendedFollowing.some(isSaladLabIngredientSectionHeading) &&
    extendedFollowing.some(
      (block) => block.type === "listItem" && looksLikeSaladLabDirectionLine(block.text),
    );
  const hasTwoListRecipeStructure =
    extendedFollowing.some((block) => isYieldBlock(block)) &&
    looksLikeTwoListRecipeStructure(extendedFollowing);
  const hasMorimotoStructure =
    looksLikeRecipeTitleClass(className) &&
    extendedFollowing.some((block) => isYieldBlock(block)) &&
    extendedFollowing.some((block) => isIngredientBlock(block)) &&
    extendedFollowing.some((block) => isDirectionBlock(block));

  return (
    (hasYield && ingredientLines.length >= 2 && methodLines.length >= 1) ||
    (hasYield && ingredientLines.length >= 1 && methodLines.length >= 2) ||
    hasMorimotoStructure ||
    hasSaladLabStructure ||
    hasTwoListRecipeStructure
  );
}

function findTechniqueSegments(
  blocks: ContentBlock[],
  recipeHeadingKeys: Set<string>,
): RecipeSegment[] {
  const headings = blocks.filter(
    (block) =>
      block.type === "heading" &&
      !recipeHeadingKeys.has(blockKey(block)) &&
      looksLikeTechniqueHeading(block),
  );

  return headings.map((heading) => {
    const nextHeading = blocks.find(
      (block) =>
        compareBlockPosition(block, heading) > 0 &&
        block.type === "heading" &&
        (looksLikeTechniqueHeading(block) || looksLikeRecipeHeading(block, blocks)) &&
        (block.headingLevel ?? 6) <= (heading.headingLevel ?? 6),
    );

    return {
      heading,
      nextHeading,
      blocks: blocks.filter(
        (block) =>
          compareBlockPosition(block, heading) >= 0 &&
          (!nextHeading || compareBlockPosition(block, nextHeading) < 0),
      ),
    };
  });
}

function looksLikeTechniqueHeading(block: ContentBlock): boolean {
  const text = block.text.toLowerCase();
  const className = block.className ?? "";

  if (/mini_toc|toc|copyright|index/i.test(className) || isExcludedTechniqueHeading(text)) {
    return false;
  }

  return (
    /technique|how to|times? & temperatures?|temperatures?|tips? for|best practices|making |brew|brewing|ferment|steep|soak|simmer|cream|syrup|base|batch|perfect matcha|troubleshoot/i.test(
      text,
    ) || (/box_head/i.test(className) && !isExcludedTechniqueHeading(text))
  );
}

function isExcludedTechniqueHeading(text: string): boolean {
  return /^(?:blenders?|juicers?|tea drinker.s toolkit|water infuser.s toolkit|what.s the difference|the role of different ingredients|smoothies 101|juicing 101|teas 101|flavored waters 101|fermenting 101|soaking & simmering 101|broths|garnishing|which juicer type is right for you\?)$/i.test(
    text.trim(),
  );
}

function toExtractedRecipes(
  segment: RecipeSegment,
  {
    index,
    metadata,
    imageCatalog,
    captionImageMap,
  }: {
    index: number;
    metadata: CookbookEpubMetadata;
    imageCatalog: ImageCatalogEntry[];
    captionImageMap: Map<string, ImageCatalogEntry[]>;
  },
): ExtractedCookbookRecipe[] {
  const title = getRecipeTitle(segment);
  const ingredients = toIngredientSections(segment.blocks);
  const directions = toDirectionSections(segment.blocks);

  if (ingredients.length === 0 || directions.length === 0) {
    return [];
  }

  const notes = extractNotes(segment.blocks);
  const variations = toRecipeVariations(extractVariationRecipes(segment.blocks));
  const images = findImagesForSegment(segment, {
    imageCatalog,
    captionImageMap,
    allowNearbyFallback: false,
  });
  const warnings = images.length === 0 ? ["No matching recipe image was found."] : [];
  return [{
    id: createStableId("cookbook-recipe", title, index),
    draftRecipe: recipeDraftSchema.parse(
      createDraftInput({
        title,
        description: extractDescription(segment.blocks),
        yieldText: segment.blocks.find(isYieldBlock)?.text,
        ingredients,
        directions,
        variations,
        notes,
        metadata,
      }),
    ),
    sourceDocumentPath: segment.heading.documentPath,
    pageNumber: segment.heading.pageNumber,
    images,
    confidence: Math.min(1, 0.62 + ingredients.length * 0.08 + directions.length * 0.06 + images.length * 0.08),
    warnings,
  }];
}

function createDraftInput({
  title,
  description,
  yieldText,
  ingredients,
  directions,
  variations,
  notes,
  metadata,
}: {
  title: string;
  description?: string;
  yieldText?: string;
  ingredients: IngredientSection[];
  directions: DirectionSection[];
  variations: RecipeVariation[];
  notes: string[];
  metadata: CookbookEpubMetadata;
}) {
  return removeUndefined({
    title,
    description,
    yield: parseYield(yieldText),
    ingredients,
    directions,
    variations: variations.length > 0 ? variations : undefined,
    notes: notes.length > 0 ? notes : undefined,
    source: {
      type: "imported",
      name: metadata.title,
    },
    tags: [],
  });
}

function dedupeRecipeImages(
  recipes: ExtractedCookbookRecipe[],
): ExtractedCookbookRecipe[] {
  const owners = new Map<string, { recipeIndex: number; imageIndex: number; score: number }>();

  recipes.forEach((recipe, recipeIndex) => {
    recipe.images.forEach((image, imageIndex) => {
      const score = scoreAssignedImage(recipe, image, imageIndex);
      const current = owners.get(image.epubPath);

      if (
        !current ||
        score > current.score ||
        (score === current.score && recipeIndex < current.recipeIndex)
      ) {
        owners.set(image.epubPath, { recipeIndex, imageIndex, score });
      }
    });
  });

  return recipes.map((recipe, recipeIndex) => {
    const images = recipe.images.filter((image, imageIndex) => {
      const owner = owners.get(image.epubPath);

      return owner?.recipeIndex === recipeIndex && owner.imageIndex === imageIndex;
    });

    if (images.length === recipe.images.length) {
      return recipe;
    }

    return {
      ...recipe,
      images,
      warnings: images.length === 0
        ? Array.from(new Set([...recipe.warnings, "No matching recipe image was found."]))
        : recipe.warnings,
    };
  });
}

function scoreAssignedImage(
  recipe: ExtractedCookbookRecipe,
  image: CookbookEpubImageRef,
  imageIndex: number,
): number {
  const roleScore =
    image.role === "inline" ? 40 : image.role === "caption-linked" ? 30 : 10;
  const pageDistance =
    recipe.pageNumber !== undefined && image.pageNumber !== undefined
      ? Math.abs(image.pageNumber - recipe.pageNumber)
      : 8;
  const pageScore = Math.max(0, 24 - pageDistance * 8);
  const positionScore = Math.max(0, 4 - imageIndex);

  return roleScore + pageScore + positionScore;
}

function getRecipeTitle(segment: RecipeSegment): string {
  const subtitle = getMorimotoSubtitle(segment);

  return cleanTitle([segment.heading.text, subtitle].filter(isText).join(": "));
}

function getMorimotoSubtitle(segment: RecipeSegment): string | undefined {
  const headingPosition = segment.blocks.findIndex(
    (block) => blockKey(block) === blockKey(segment.heading),
  );
  const nextBlock = segment.blocks[headingPosition + 1];

  if (!nextBlock || nextBlock.type !== "paragraph") {
    return undefined;
  }

  if (!/h3b|h3ca/i.test(nextBlock.className ?? "")) {
    return undefined;
  }

  return nextBlock.text;
}

function toExtractedTechnique(
  segment: RecipeSegment,
  {
    index,
    imageCatalog,
    captionImageMap,
  }: {
    index: number;
    imageCatalog: ImageCatalogEntry[];
    captionImageMap: Map<string, ImageCatalogEntry[]>;
  },
): ExtractedCookbookTechnique | undefined {
  const blocks = toTechniqueBlocks(segment.blocks);
  const body = segment.blocks
    .filter((block) => block.type === "paragraph" || block.type === "listItem")
    .filter((block) => !isNavigationBlock(block))
    .map((block) => block.text)
    .filter((line) => line.length > 20)
    .slice(0, 24);

  if (body.length === 0 && blocks.length === 0) {
    return undefined;
  }

  const images = findImagesForSegment(segment, {
    imageCatalog,
    captionImageMap,
    allowNearbyFallback: true,
  });
  const techniqueType = getTechniqueType(segment.heading, blocks);
  const title = createTechniqueTitle(segment.heading.text, body, blocks);

  return {
    id: createStableId("cookbook-technique", title, index),
    title,
    type: techniqueType,
    summary: body[0],
    blocks,
    body,
    sourceDocumentPath: segment.heading.documentPath,
    pageNumber: segment.heading.pageNumber,
    images,
    confidence: Math.min(
      1,
      0.5 + body.length * 0.04 + blocks.length * 0.03 + images.length * 0.05,
    ),
  };
}

function createTechniqueTitle(
  headingText: string,
  body: string[],
  blocks: CookbookTechniqueBlock[],
): string {
  const title = cleanTitle(headingText);
  const normalizedTitle = title.toLowerCase();
  const contextText = [
    ...body,
    ...blocks.flatMap((block) => {
      if (block.type === "paragraph" || block.type === "heading") {
        return [block.text];
      }

      if (block.type === "callout") {
        return [block.title, ...block.body].filter(isText);
      }

      if (block.type === "list") {
        return block.items;
      }

      return [block.headers.join(" "), ...block.rows.map((row) => row.join(" "))];
    }),
  ]
    .join(" ")
    .toLowerCase();
  const context = inferTechniqueTitleContext(contextText);

  if (normalizedTitle === "best practices" && context) {
    return `${context} best practices`;
  }

  if (normalizedTitle === "brewing" && context === "tea") {
    return "tea brewing";
  }

  if (normalizedTitle === "making your first batch" && context === "kombucha") {
    return "making your first batch of kombucha";
  }

  if (normalizedTitle === "tips for juice making") {
    return "juice-making tips";
  }

  return title;
}

function inferTechniqueTitleContext(text: string): string | undefined {
  if (/\bkombucha\b|pellicle|scoby/.test(text)) {
    return "kombucha";
  }

  if (/\btea\b|earl grey|matcha|steep/.test(text)) {
    return "tea";
  }

  if (/\bjuice\b|juicing|juicer/.test(text)) {
    return "juice";
  }

  if (/\bkefir\b/.test(text)) {
    return "kefir";
  }

  return undefined;
}

function toTechniqueBlocks(blocks: ContentBlock[]): CookbookTechniqueBlock[] {
  const techniqueBlocks: CookbookTechniqueBlock[] = [];
  let currentList: string[] = [];

  function flushList() {
    if (currentList.length > 0) {
      techniqueBlocks.push({ type: "list", items: currentList });
      currentList = [];
    }
  }

  for (const block of blocks) {
    if (block.type === "heading" || block.type === "pagebreak" || block.type === "image") {
      continue;
    }

    if (isNavigationBlock(block)) {
      continue;
    }

    if (block.type === "table" && block.tableRows?.length) {
      flushList();
      techniqueBlocks.push(toTechniqueTableBlock(block.tableRows));
      continue;
    }

    if (block.type === "listItem") {
      currentList.push(block.text.replace(/^•\s*/, ""));
      continue;
    }

    flushList();

    const calloutTitle = parseRunInTitle(block.text);

    if (calloutTitle) {
      techniqueBlocks.push({
        type: "callout",
        title: calloutTitle.title,
        body: [calloutTitle.body],
      });
    } else {
      techniqueBlocks.push({ type: "paragraph", text: block.text });
    }
  }

  flushList();

  return techniqueBlocks.slice(0, 32);
}

function toTechniqueTableBlock(rows: string[][]): CookbookTechniqueBlock {
  const [headerRow, ...bodyRows] = rows;
  const hasHeader = headerRow?.some((cell) => /^[A-Z][A-Z\s&-]+$/.test(cell));

  return {
    type: "table",
    headers: hasHeader ? headerRow : [],
    rows: hasHeader ? bodyRows : rows,
  };
}

function getTechniqueType(
  heading: ContentBlock,
  blocks: CookbookTechniqueBlock[],
): CookbookTechniqueType {
  const text = heading.text.toLowerCase();

  if (blocks.some((block) => block.type === "table")) {
    return "table";
  }

  if (/troubleshoot|underfermented|overfermented/.test(text)) {
    return "troubleshooting";
  }

  if (/syrup|base|formula|mixes/.test(text)) {
    return "formula";
  }

  if (/best practices|tips?|techniques/.test(text)) {
    return "checklist";
  }

  return "guide";
}

function parseRunInTitle(text: string): { title: string; body: string } | undefined {
  const match = /^([^:]{2,80}):\s+(.+)$/.exec(text);

  if (!match) {
    return undefined;
  }

  return {
    title: match[1].trim(),
    body: match[2].trim(),
  };
}

function toIngredientSections(blocks: ContentBlock[]): IngredientSection[] {
  const saladLabSections = toSaladLabIngredientSections(blocks);

  if (saladLabSections.length > 0) {
    return saladLabSections;
  }

  const firstListSections = toFirstListIngredientSections(blocks);

  if (firstListSections.length > 0) {
    return firstListSections;
  }

  const ingredientBlocks = blocks.filter(
    (block) => isIngredientBlock(block) && !isMorimotoSpecialEquipmentItem(block, blocks),
  );
  const lines = ingredientBlocks
    .map((block) => block.text)
    .map(cleanIngredientLine)
    .filter(isText);

  if (lines.length === 0) {
    return [];
  }

  return [
    {
      id: "ingredients",
      items: lines.map((line, index) => ({
        id: createStableId("ingredient", line, index),
        raw: line,
        item: parseIngredientItemName(line),
        optional: /\boptional\b/i.test(line) ? true : undefined,
      })),
    },
  ];
}

function toDirectionSections(blocks: ContentBlock[]): DirectionSection[] {
  const saladLabDirections = toSaladLabDirectionLines(blocks);
  const lines = saladLabDirections.length > 0
    ? saladLabDirections
    : blocks
        .filter(isDirectionBlock)
        .flatMap((block) => splitDirectionText(block.text))
        .map(normalizeText)
        .filter(isText);

  if (lines.length === 0) {
    return [];
  }

  return [
    {
      id: "directions",
      steps: lines.map((line, index) => ({
        id: createStableId("step", line, index),
        order: index + 1,
        text: line,
        timerMinutes: parseTimerMinutes(line),
      })),
    },
  ];
}

function toSaladLabIngredientSections(blocks: ContentBlock[]): IngredientSection[] {
  const sections: IngredientSection[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (!isSaladLabIngredientSectionHeading(block)) {
      continue;
    }

    const title = normalizeSaladLabSectionTitle(block.text);
    const lines: string[] = [];

    for (let nextIndex = index + 1; nextIndex < blocks.length; nextIndex += 1) {
      const nextBlock = blocks[nextIndex];

      if (isSaladLabIngredientSectionHeading(nextBlock)) {
        break;
      }

      if (nextBlock.type === "listItem") {
        if (looksLikeSaladLabDirectionLine(nextBlock.text)) {
          break;
        }

        lines.push(cleanIngredientLine(nextBlock.text));
        continue;
      }

      if (nextBlock.type !== "image" && nextBlock.type !== "pagebreak") {
        break;
      }
    }

    if (lines.length > 0) {
      sections.push(toIngredientSection(title, lines));
    }
  }

  return sections;
}

function toFirstListIngredientSections(blocks: ContentBlock[]): IngredientSection[] {
  const firstList = firstListItemGroup(blocks);

  if (
    firstList.length < 1 ||
    firstList.some((block) => looksLikeSaladLabDirectionLine(block.text)) ||
    firstList.some((block) => !looksLikeIngredientOrReferenceLine(block.text))
  ) {
    return [];
  }

  return [toIngredientSection("Ingredients", firstList.map((block) => cleanIngredientLine(block.text)))];
}

function firstListItemGroup(blocks: ContentBlock[]): ContentBlock[] {
  const firstListStart = blocks.findIndex((block) => block.type === "listItem");

  if (firstListStart < 0) {
    return [];
  }

  const group: ContentBlock[] = [];

  for (let index = firstListStart; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (block.type !== "listItem") {
      if (group.length > 0) {
        break;
      }

      continue;
    }

    if (group.length > 0 && block.listValue === 1) {
      break;
    }

    group.push(block);
  }

  return group;
}

function toIngredientSection(title: string, lines: string[]): IngredientSection {
  return {
    id: createRecipeSlug(title) || "ingredients",
    title,
    items: lines.map((line, index) => ({
      id: createStableId("ingredient", line, index),
      raw: line,
      item: parseIngredientItemName(line),
      optional: /\boptional\b/i.test(line) ? true : undefined,
    })),
  };
}

function toSaladLabDirectionLines(blocks: ContentBlock[]): string[] {
  const directionStart = blocks.findIndex(
    (block) => block.type === "listItem" && looksLikeSaladLabDirectionLine(block.text),
  );

  if (directionStart >= 0) {
    return blocks
      .slice(directionStart)
      .filter((block) => block.type === "listItem")
      .map((block) => normalizeText(block.text))
      .filter(isText);
  }

  const firstList = firstListItemGroup(blocks);

  if (firstList.length === 0) {
    return [];
  }

  const firstListKeys = new Set(firstList.map(blockKey));
  const secondListStart = blocks.findIndex(
    (block) => block.type === "listItem" && !firstListKeys.has(blockKey(block)),
  );

  if (secondListStart < 0) {
    return [];
  }

  return blocks
    .slice(secondListStart)
    .filter((block) => block.type === "listItem")
    .map((block) => normalizeText(block.text))
    .filter(isText);
}

function isSaladLabIngredientSectionHeading(block: ContentBlock): boolean {
  if (block.type !== "paragraph") {
    return false;
  }

  return /^(?:START OUT|WHISK|TOSS)(?:\s*\([^)]+\))?$/i.test(block.text);
}

function normalizeSaladLabSectionTitle(text: string): string {
  return cleanTitle(text)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function looksLikeSaladLabDirectionLine(text: string): boolean {
  return /^(?:START OUT|WHISK|TOSS|ENJOY)\s*:/i.test(text);
}

function looksLikeIngredientOrReferenceLine(text: string): boolean {
  return looksLikeIngredientLine(text) || /^[A-Z][\w\s-]+$/i.test(text);
}

function looksLikeTwoListRecipeStructure(blocks: ContentBlock[]): boolean {
  const firstList = firstListItemGroup(blocks);

  if (
    firstList.length === 0 ||
    firstList.some((block) => looksLikeSaladLabDirectionLine(block.text)) ||
    firstList.some((block) => !looksLikeIngredientOrReferenceLine(block.text))
  ) {
    return false;
  }

  const firstListKeys = new Set(firstList.map(blockKey));
  const secondList = blocks
    .filter((block) => block.type === "listItem" && !firstListKeys.has(blockKey(block)))
    .slice(0, 12);

  return (
    secondList.length > 0 &&
    secondList.some((block) => looksLikeInstructionLine(block.text))
  );
}

function looksLikeInstructionLine(text: string): boolean {
  return /\b(preheat|cut|combine|whisk|stir|cook|bake|roast|toast|blend|slice|chop|place|add|serve|store|heat|bring|drain|rinse|season)\b/i.test(
    text,
  );
}

function toRecipeVariations(
  variations: Array<{ title: string; instructions: string }>,
): RecipeVariation[] {
  return variations.map((variation, variationIndex) => {
    const title = cleanTitle(variation.title);
    const instructions = splitDirectionText(variation.instructions)
      .map(normalizeText)
      .filter(isText);

    return removeUndefined({
      id: createStableId("variation", title, variationIndex),
      title,
      directions:
        instructions.length > 0
          ? [
              {
                id: createStableId("variation-directions", title, variationIndex),
                steps: instructions.map((instruction, instructionIndex) => ({
                  id: createStableId("variation-step", `${title}-${instruction}`, instructionIndex),
                  order: instructionIndex + 1,
                  text: instruction,
                  timerMinutes: parseTimerMinutes(instruction),
                })),
              },
            ]
          : undefined,
    });
  });
}

function findImagesForSegment(
  segment: RecipeSegment,
  {
    imageCatalog,
    captionImageMap,
    allowNearbyFallback,
  }: {
    imageCatalog: ImageCatalogEntry[];
    captionImageMap: Map<string, ImageCatalogEntry[]>;
    allowNearbyFallback: boolean;
  },
): CookbookEpubImageRef[] {
  const imagesByPath = new Map(imageCatalog.map((image) => [image.epubPath, image]));
  const candidates: RankedImageCandidate[] = [];
  const captionKeys = getHeadingHrefKeys(segment.heading);

  for (const key of captionKeys) {
    for (const image of captionImageMap.get(key) ?? []) {
      pushImageCandidate(candidates, segment, image, "caption-linked");
    }
  }

  for (const block of segment.blocks) {
    if (block.type === "image" && block.imagePath) {
      const image = imagesByPath.get(block.imagePath);

      if (image) {
        pushImageCandidate(candidates, segment, image, "inline", block.imageAlt);
      }
    }
  }

  if (allowNearbyFallback && candidates.length === 0) {
    const nearby = findNearbyCatalogImages(segment, imageCatalog);

    for (const image of nearby) {
      pushImageCandidate(candidates, segment, image, "nearby");
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || left.image.index - right.image.index)
    .map((candidate) => toImageRef(candidate.image, candidate.role, candidate.alt))
    .slice(0, 3);
}

function findNearbyCatalogImages(
  segment: RecipeSegment,
  imageCatalog: ImageCatalogEntry[],
): ImageCatalogEntry[] {
  const pageNumber = segment.heading.pageNumber;
  const sameBookPageImages =
    pageNumber === undefined
      ? []
      : imageCatalog
          .filter(
            (image) =>
              image.pageNumber !== undefined &&
              Math.abs(image.pageNumber - pageNumber) <= 3 &&
              isLikelyRecipeImage(image),
          )
          .sort(
            (a, b) =>
              Math.abs((a.pageNumber ?? 0) - pageNumber) -
              Math.abs((b.pageNumber ?? 0) - pageNumber),
          );

  if (sameBookPageImages.length > 0) {
    return sameBookPageImages.slice(0, 2);
  }

  return imageCatalog
    .filter(
      (image) =>
        image.epubPath.startsWith(path.dirname(segment.heading.documentPath)) &&
        isLikelyRecipeImage(image),
    )
    .slice(0, 1);
}

function pushImageCandidate(
  candidates: RankedImageCandidate[],
  segment: RecipeSegment,
  image: ImageCatalogEntry,
  role: CookbookEpubImageRole,
  alt?: string,
): void {
  if (!isLikelyRecipeImage(image)) {
    return;
  }

  if (
    role === "caption-linked" &&
    segment.heading.pageNumber === undefined &&
    image.pageNumber === undefined
  ) {
    return;
  }

  const score = scoreImageCandidate(segment, image, role);
  const existing = candidates.find((candidate) => candidate.image.epubPath === image.epubPath);

  if (existing) {
    if (score > existing.score) {
      existing.role = role;
      existing.alt = alt;
      existing.score = score;
    }

    return;
  }

  candidates.push({ image, role, alt, score });
}

function scoreImageCandidate(
  segment: RecipeSegment,
  image: ImageCatalogEntry,
  role: CookbookEpubImageRole,
): number {
  const pageNumber = segment.heading.pageNumber;
  const pageDistance =
    pageNumber !== undefined && image.pageNumber !== undefined
      ? Math.abs(image.pageNumber - pageNumber)
      : 8;
  const roleScore =
    role === "inline" ? 18 : role === "caption-linked" ? 14 : role === "nearby" ? 10 : 0;
  const pageScore = Math.max(0, 30 - pageDistance * 9);
  const imageSizeScore = Math.min(12, image.byteLength / 90_000);

  return pageScore + roleScore + imageSizeScore;
}

function isLikelyRecipeImage(image: ImageCatalogEntry): boolean {
  if (/reference[_-]page[_-](?:vi|iv|ix|x|v)\b/i.test(image.epubPath)) {
    return false;
  }

  return image.byteLength >= 180_000;
}

function toImageRef(
  image: ImageCatalogEntry,
  role: CookbookEpubImageRole,
  alt?: string,
): CookbookEpubImageRef {
  return removeUndefined({
    id: createStableId("image", image.epubPath, image.index),
    epubPath: image.epubPath,
    mediaType: image.mediaType,
    byteLength: image.byteLength,
    pageNumber: image.pageNumber,
    role,
    alt,
  });
}

function isIngredientBlock(block: ContentBlock): boolean {
  const className = block.className ?? "";

  if (/ingredient|Il_item/i.test(className)) {
    return true;
  }

  if (looksLikeMorimotoIngredientClass(className)) {
    return true;
  }

  if (block.type !== "listItem") {
    return false;
  }

  return looksLikeIngredientLine(block.text);
}

function isDirectionBlock(block: ContentBlock): boolean {
  const className = block.className ?? "";

  return /step|method|direction|instruction|procedure/i.test(className) ||
    looksLikeMorimotoDirectionClass(className);
}

function isYieldBlock(block: ContentBlock): boolean {
  const className = block.className ?? "";

  return /yield|serves?|makes?/i.test(className) ||
    looksLikeMorimotoYieldClass(className) ||
    /^(serves|makes|yields)\b/i.test(block.text);
}

function looksLikeRecipeTitleClass(className: string | undefined): boolean {
  return /^(?:h3a|h3c|h3|h3tb|h4|h4p)$/i.test(className ?? "");
}

function looksLikeMorimotoYieldClass(className: string): boolean {
  return /^(?:hangm|hangmp5|hangmi|hangmip5)$/i.test(className);
}

function looksLikeMorimotoIngredientClass(className: string): boolean {
  return /^(?:hang|hang1|hang1a|hangb|hangb1|hangi|hangi1)$/i.test(className);
}

function looksLikeMorimotoDirectionClass(className: string): boolean {
  return /^(?:noindenta1|noindenta1a|noindenta3|noindenta3a|noindentb1|noindenti1)$/i.test(className);
}

function isMorimotoSpecialEquipmentItem(block: ContentBlock, blocks: ContentBlock[]): boolean {
  if (!/^(?:hang|hangi|hangb)$/i.test(block.className ?? "")) {
    return false;
  }

  const blockIndex = blocks.findIndex((candidate) => blockKey(candidate) === blockKey(block));

  for (let index = blockIndex - 1; index >= 0; index -= 1) {
    const previous = blocks[index];
    const className = previous?.className ?? "";

    if (!previous || previous.type === "heading" || isYieldBlock(previous) || isDirectionBlock(previous)) {
      return false;
    }

    if (/^(?:hang1|hang1a|hangb1|hangi1)$/i.test(className)) {
      return false;
    }

    if (/^hangst$/i.test(className)) {
      return /special equipment/i.test(previous.text);
    }
  }

  return false;
}

function isNavigationBlock(block: ContentBlock): boolean {
  return /mini_toc|toc|caption|figcaption/i.test(block.className ?? "");
}

function looksLikeIngredientLine(text: string): boolean {
  return /^(?:\d|[¼½¾⅓⅔⅛⅜⅝⅞]|one |two |three |four |five |six |seven |eight |nine |ten )/i.test(
    text,
  );
}

function extractDescription(blocks: ContentBlock[]): string | undefined {
  const description = blocks
    .filter(
      (block) =>
        block.type === "paragraph" &&
        !isYieldBlock(block) &&
        !isIngredientBlock(block) &&
        !isDirectionBlock(block) &&
        !/border|caption|var_|if_sidebar/i.test(block.className ?? ""),
    )
    .map((block) => block.text)
    .find((text) => text.length > 40);

  return description?.slice(0, 1200);
}

function extractNotes(blocks: ContentBlock[]): string[] {
  return blocks
    .filter((block) => /note|sidebar/i.test(block.className ?? ""))
    .map((block) => block.text)
    .filter((text) => text.length > 0)
    .slice(0, 12);
}

function extractVariationRecipes(
  blocks: ContentBlock[],
): Array<{ title: string; instructions: string }> {
  const variationBlocks = blocks.filter((block) => /var_text/i.test(block.className ?? ""));
  const variations: Array<{ title: string; instructions: string }> = [];

  for (let index = 0; index < variationBlocks.length; index += 1) {
    const block = variationBlocks[index];
    const nextBlock = variationBlocks[index + 1];

    if (/^variations?$/i.test(block.text) || !nextBlock) {
      continue;
    }

    const looksLikeTitle =
      block.id !== undefined ||
      (/^[a-z]/.test(block.text) && !/[.!?]$/.test(block.text));

    if (looksLikeTitle && /[.!?]$/.test(nextBlock.text)) {
      variations.push({
        title: block.text,
        instructions: nextBlock.text,
      });
      index += 1;
    }
  }

  return variations;
}

function parseYield(text: string | undefined) {
  if (!text) {
    return undefined;
  }

  const cleaned = text.replace(/^(serves|makes|yields)\s+/i, "").trim();
  const quantityMatch = /^(\d+(?:\.\d+)?)/.exec(cleaned);
  const unit = quantityMatch ? cleaned.slice(quantityMatch[0].length).trim() : undefined;

  return removeUndefined({
    quantity: quantityMatch ? Number(quantityMatch[1]) : undefined,
    unit: unit || undefined,
    notes: text,
  });
}

function parseIngredientItemName(line: string): string {
  const withoutLeadingQuantity = line
    .replace(/^\s*(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*/, "")
    .replace(/^\s*(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lb|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|ripe|medium|large|small)\b\.?\s*/i, "")
    .trim();

  return withoutLeadingQuantity || line;
}

function splitDirectionText(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim());
}

function parseTimerMinutes(text: string): number | undefined {
  const match = /(?:for|about|until)[^\d]*(\d+)(?:\s*to\s*(\d+))?\s*(?:minutes?|mins?)\b/i.exec(
    text,
  );

  return match ? Number(match[2] ?? match[1]) : undefined;
}

function cleanIngredientLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cleanTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function findNearbyImageBlock(
  blocks: ContentBlock[],
  fromIndex: number,
  searchWindow: number,
  imagesByPath: Map<string, ImageCatalogEntry>,
): ImageCatalogEntry | undefined {
  const direction = Math.sign(searchWindow);
  const limit = Math.abs(searchWindow);

  for (let step = 1; step <= limit; step += 1) {
    const block = blocks[fromIndex + step * direction];

    if (block?.type === "image" && block.imagePath) {
      return imagesByPath.get(block.imagePath);
    }
  }

  return undefined;
}

function getHeadingHrefKeys(heading: ContentBlock): string[] {
  if (!heading.id) {
    return [];
  }

  return [
    `${heading.documentPath}#${heading.id}`,
    `${path.basename(heading.documentPath)}#${heading.id}`,
    `#${heading.id}`,
  ];
}

function extractHrefs(html: string, documentPath: string): string[] {
  return Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)).map(
    (match) => {
      const href = decodeHtmlEntities(match[1]);

      if (href.startsWith("#")) {
        return href;
      }

      const [hrefPath, hash] = href.split("#");
      const normalizedPath = normalizeEpubPath(path.dirname(documentPath), hrefPath);

      return hash ? `${normalizedPath}#${hash}` : normalizedPath;
    },
  );
}

function followingBlocks(
  blocks: ContentBlock[],
  heading: ContentBlock,
  count: number,
): ContentBlock[] {
  const headingPosition = blocks.findIndex((block) => blockKey(block) === blockKey(heading));

  return headingPosition >= 0 ? blocks.slice(headingPosition + 1, headingPosition + 1 + count) : [];
}

function compareBlockPosition(a: ContentBlock, b: ContentBlock): number {
  if (a.spineIndex !== b.spineIndex) {
    return a.spineIndex - b.spineIndex;
  }

  return a.blockIndex - b.blockIndex;
}

function blockKey(block: ContentBlock): string {
  return `${block.documentPath}:${block.blockIndex}`;
}

function createStableId(prefix: string, text: string, index: number): string {
  return createRecipeSlug(`${prefix}-${text}`).slice(0, 72) || `${prefix}-${index + 1}`;
}

function normalizeEpubPath(basePath: string, value: string): string {
  return path.normalize(path.join(basePath === "." ? "" : basePath, decodeURIComponent(value))).replace(/^\.\//, "");
}

function readTextEntry(entries: Map<string, EpubZipEntry>, entryPath: string): string {
  const entry = entries.get(entryPath);

  if (!entry) {
    throw new Error(`Could not find ${entryPath} in EPUB.`);
  }

  return bufferToText(entry.data);
}

function bufferToText(value: Uint8Array): string {
  return Buffer.from(value).toString("utf8");
}

function firstXmlText(xml: string, tagName: string): string | undefined {
  const escaped = tagName.replace(":", "\\:");
  const match = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i").exec(xml);

  return match ? normalizeHtmlText(match[1]) : undefined;
}

function firstMetaContent(xml: string, name: string): string | undefined {
  const match = new RegExp(`<meta\\b[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i").exec(xml);

  return match ? normalizeHtmlText(match[1]) : undefined;
}

function parseAttributes(value: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const match of value.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1]] = decodeHtmlEntities(match[2] ?? match[3] ?? "");
  }

  return attributes;
}

function extractImageAttributes(html: string): Array<Record<string, string>> {
  return Array.from(html.matchAll(/<img\b([^>]*)\/?>/gi)).map((match) =>
    parseAttributes(match[1]),
  );
}

function looksLikeFormattedTitle(html: string): boolean {
  return /\bclass=["'][^"']*\bcalibre[23]\b/i.test(html);
}

function parseListValue(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseHtmlTableRows(html: string): string[][] {
  return Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((rowMatch) =>
      Array.from(rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
        .map((cellMatch) => normalizeHtmlText(cellMatch[1]))
        .filter(Boolean),
    )
    .filter((row) => row.length > 0);
}

function parsePageNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const referencePageMatch = /reference[_\s-]?page[_\s-]?(\d{1,4})/i.exec(value);

  if (referencePageMatch) {
    return Number(referencePageMatch[1]);
  }

  const figurePageMatch = /(?:^|[/_-])f(\d{4})(?:[-_.]|$)/i.exec(value);

  if (figurePageMatch) {
    return Number(figurePageMatch[1]);
  }

  if (/^\d{1,4}$/.test(value.trim())) {
    return Number(value.trim());
  }

  const match = /(?:page[_\s-]?|p)(\d{1,4})/i.exec(value);

  return match ? Number(match[1]) : undefined;
}

function extractPageBreakPageNumber(html: string): number | undefined {
  for (const match of html.matchAll(/<span\b([^>]*)>/gi)) {
    const attributes = parseAttributes(match[1]);

    if (!attributes["epub:type"]?.includes("pagebreak")) {
      continue;
    }

    const pageNumber = parsePageNumber(attributes.title ?? attributes.id);

    if (pageNumber !== undefined) {
      return pageNumber;
    }
  }

  return undefined;
}

function mediaTypeFromPath(epubPath: string): string {
  if (/\.png$/i.test(epubPath)) {
    return "image/png";
  }

  if (/\.webp$/i.test(epubPath)) {
    return "image/webp";
  }

  if (/\.gif$/i.test(epubPath)) {
    return "image/gif";
  }

  return "image/jpeg";
}

function normalizeHtmlText(value: string): string {
  return normalizeText(
    decodeHtmlEntities(
      value
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&#x22;/gi, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function removeUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(removeUndefined).filter((entry) => entry !== undefined) as T;
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, removeUndefined(entryValue)]),
  ) as T;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
