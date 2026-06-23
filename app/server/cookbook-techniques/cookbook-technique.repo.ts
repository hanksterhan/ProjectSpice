import type {
  CookbookTechnique,
  CookbookTechniqueSummary,
} from "./cookbook-technique.types";

export type CookbookTechniqueRepositoryStatement = {
  bind(...values: unknown[]): CookbookTechniqueRepositoryStatement;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};

export type CookbookTechniqueRepositoryDatabase = {
  prepare(query: string): CookbookTechniqueRepositoryStatement;
};

type CookbookTechniqueRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  technique_type: CookbookTechnique["type"];
  source_name: string;
  source_document_path: string;
  page_number: number | null;
  image_url: string | null;
  blocks_json?: string | CookbookTechnique["blocks"];
  tags_json: string | string[];
  created_at: string;
  updated_at: string;
};

export class CookbookTechniqueRepository {
  constructor(private readonly database: CookbookTechniqueRepositoryDatabase) {}

  async listSummaries(): Promise<CookbookTechniqueSummary[]> {
    const result = await this.database
      .prepare(
        `SELECT
          id,
          slug,
          title,
          summary,
          technique_type,
          source_name,
          source_document_path,
          page_number,
          image_url,
          tags_json,
          created_at,
          updated_at
        FROM cookbook_techniques
        WHERE deleted_at IS NULL
        ORDER BY title COLLATE NOCASE ASC`,
      )
      .all<CookbookTechniqueRow>();

    return result.results.map(rowToTechniqueSummary);
  }

  async getBySlug(slug: string): Promise<CookbookTechnique | null> {
    const row = await this.database
      .prepare(
        `SELECT
          id,
          slug,
          title,
          summary,
          technique_type,
          source_name,
          source_document_path,
          page_number,
          image_url,
          blocks_json,
          tags_json,
          created_at,
          updated_at
        FROM cookbook_techniques
        WHERE slug = ? AND deleted_at IS NULL
        LIMIT 1`,
      )
      .bind(slug)
      .first<CookbookTechniqueRow>();

    return row ? rowToTechnique(row) : null;
  }
}

function rowToTechniqueSummary(row: CookbookTechniqueRow): CookbookTechniqueSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    ...(row.summary ? { summary: row.summary } : {}),
    type: row.technique_type,
    sourceName: row.source_name,
    sourceDocumentPath: row.source_document_path,
    ...(row.page_number ? { pageNumber: row.page_number } : {}),
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    tags: parseTags(row.tags_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTechnique(row: CookbookTechniqueRow): CookbookTechnique {
  return {
    ...rowToTechniqueSummary(row),
    blocks: parseBlocks(row.blocks_json),
  };
}

function parseTags(value: string | string[]): string[] {
  return typeof value === "string" ? (JSON.parse(value) as string[]) : value;
}

function parseBlocks(
  value: string | CookbookTechnique["blocks"] | undefined,
): CookbookTechnique["blocks"] {
  if (!value) {
    return [];
  }

  return typeof value === "string"
    ? (JSON.parse(value) as CookbookTechnique["blocks"])
    : value;
}
