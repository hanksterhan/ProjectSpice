export type RecipeImportCandidate = {
  id: string;
  title: string;
  sourcePath: string;
  confidence: number;
  checked: boolean;
  ingredients: string[];
  directions: string;
  notes: string | null;
  tags: string[];
};
