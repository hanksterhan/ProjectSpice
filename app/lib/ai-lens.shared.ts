export type AiLensId = "lighter" | "faster" | "pantry" | "spicy" | "kids" | "double";

export type AiLensState = {
  lenses: AiLensId[];
  strength: number;
};

export type AiLensDefinition = {
  id: AiLensId;
  label: string;
  shortLabel: string;
  prompt: string;
  preview: string;
};

export const AI_LENS_STORAGE_KEY = "projectspice.aiLens";
export const DEFAULT_AI_LENS_STATE: AiLensState = { lenses: [], strength: 0.5 };

export const AI_LENSES: AiLensDefinition[] = [
  {
    id: "lighter",
    label: "Lighter",
    shortLabel: "Light",
    prompt: "Reduce calories without losing satisfying texture or flavor.",
    preview: "lower richness and calories",
  },
  {
    id: "faster",
    label: "Faster",
    shortLabel: "Fast",
    prompt: "Reduce active and total cooking time while preserving the recipe's spirit.",
    preview: "streamlined prep and timing",
  },
  {
    id: "pantry",
    label: "Pantry-only",
    shortLabel: "Pantry",
    prompt: "Prefer common pantry substitutions for harder-to-find ingredients.",
    preview: "common substitutions",
  },
  {
    id: "spicy",
    label: "Spicier",
    shortLabel: "Heat",
    prompt: "Add balanced heat without overwhelming the dish.",
    preview: "more heat",
  },
  {
    id: "kids",
    label: "Kid-friendly",
    shortLabel: "Kids",
    prompt: "Tone down assertive flavors and simplify steps for family cooking.",
    preview: "gentler flavors",
  },
  {
    id: "double",
    label: "Double it",
    shortLabel: "Double",
    prompt: "Scale to twice the servings and adjust technique where needed.",
    preview: "scaled quantities and technique",
  },
];

const LENS_IDS = new Set<AiLensId>(AI_LENSES.map((lens) => lens.id));

export function normalizeAiLensState(input: Partial<AiLensState> | null | undefined): AiLensState {
  const lenses = Array.from(
    new Set((input?.lenses ?? []).filter((lens): lens is AiLensId => LENS_IDS.has(lens as AiLensId)))
  );
  const strength = typeof input?.strength === "number" && Number.isFinite(input.strength)
    ? Math.min(1, Math.max(0, input.strength))
    : DEFAULT_AI_LENS_STATE.strength;
  return { lenses, strength };
}

export function parseAiLensSearchParams(params: URLSearchParams): AiLensState {
  return normalizeAiLensState({
    lenses: (params.get("lens") ?? "")
      .split(",")
      .map((lens) => lens.trim())
      .filter(Boolean) as AiLensId[],
    strength: parseStrengthParam(params.get("strength")),
  });
}

export function applyAiLensSearchParams(params: URLSearchParams, state: AiLensState) {
  const next = normalizeAiLensState(state);
  if (next.lenses.length > 0) {
    params.set("lens", next.lenses.join(","));
    params.set("strength", String(Math.round(next.strength * 100)));
  } else {
    params.delete("lens");
    params.delete("strength");
  }
}

export function aiLensSummary(state: AiLensState): string {
  const normalized = normalizeAiLensState(state);
  if (normalized.lenses.length === 0) return "Original recipes";
  const labels = normalized.lenses
    .map((id) => AI_LENSES.find((lens) => lens.id === id)?.shortLabel)
    .filter(Boolean)
    .join(" + ");
  return `${labels} · ${Math.round(normalized.strength * 100)}%`;
}

export function aiLensPrompt(state: AiLensState): string {
  const normalized = normalizeAiLensState(state);
  return normalized.lenses
    .map((id) => AI_LENSES.find((lens) => lens.id === id)?.prompt)
    .filter(Boolean)
    .join(" ");
}

export function isAiLensActive(state: AiLensState): boolean {
  return normalizeAiLensState(state).lenses.length > 0;
}

function parseStrengthParam(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed > 1 ? parsed / 100 : parsed;
}
