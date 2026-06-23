import type {
  CookbookTechnique,
  CookbookTechniqueSummary,
} from "./cookbook-technique.types";
import type { CookbookTechniqueRepository } from "./cookbook-technique.repo";

export type CookbookTechniqueServiceRepository = Pick<
  CookbookTechniqueRepository,
  "listSummaries" | "getBySlug"
>;

export class CookbookTechniqueService {
  constructor(private readonly repository: CookbookTechniqueServiceRepository) {}

  listSummaries(): Promise<CookbookTechniqueSummary[]> {
    return this.repository.listSummaries();
  }

  getBySlug(slug: string): Promise<CookbookTechnique | null> {
    return this.repository.getBySlug(slug);
  }
}
