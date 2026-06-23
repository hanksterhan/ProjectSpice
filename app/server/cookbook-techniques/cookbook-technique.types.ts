import type {
  CookbookTechniqueBlock,
  CookbookTechniqueType,
} from "~/server/cookbook-epub";

export type CookbookTechnique = {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  type: CookbookTechniqueType;
  sourceName: string;
  sourceDocumentPath: string;
  pageNumber?: number;
  imageUrl?: string;
  blocks: CookbookTechniqueBlock[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type CookbookTechniqueSummary = Omit<CookbookTechnique, "blocks">;
