import type { RecipeDraft } from "~/modules/recipe-domain";

export type CookbookEpubImageRole = "caption-linked" | "inline" | "nearby";

export type CookbookEpubImageRef = {
  id: string;
  epubPath: string;
  mediaType: string;
  byteLength: number;
  pageNumber?: number;
  role: CookbookEpubImageRole;
  alt?: string;
};

export type ExtractedCookbookRecipe = {
  id: string;
  draftRecipe: RecipeDraft;
  sourceDocumentPath: string;
  pageNumber?: number;
  images: CookbookEpubImageRef[];
  confidence: number;
  warnings: string[];
};

export type ExtractedCookbookTechnique = {
  id: string;
  title: string;
  type: CookbookTechniqueType;
  summary?: string;
  blocks: CookbookTechniqueBlock[];
  body: string[];
  sourceDocumentPath: string;
  pageNumber?: number;
  images: CookbookEpubImageRef[];
  confidence: number;
};

export type CookbookTechniqueType =
  | "checklist"
  | "formula"
  | "guide"
  | "table"
  | "troubleshooting";

export type CookbookTechniqueBlock =
  | {
      type: "callout";
      title?: string;
      body: string[];
    }
  | {
      type: "heading";
      text: string;
    }
  | {
      type: "list";
      items: string[];
    }
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
    };

export type CookbookEpubMetadata = {
  title?: string;
  creator?: string;
  publisher?: string;
  language?: string;
};

export type CookbookEpubExtraction = {
  metadata: CookbookEpubMetadata;
  recipes: ExtractedCookbookRecipe[];
  techniques: ExtractedCookbookTechnique[];
  images: CookbookEpubImageRef[];
  warnings: string[];
};

export type CookbookEpubContentDocument = {
  path: string;
  html: string;
  spineIndex: number;
};

export type CookbookEpubImageAsset = {
  path: string;
  mediaType: string;
  data: Uint8Array;
};
