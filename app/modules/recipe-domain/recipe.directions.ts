import type { DirectionStep } from "./recipe.types";

export type DisplayDirectionStep = {
  displayOrder: number;
  displayText: string;
  step: DirectionStep;
};

export function getDisplayDirectionSteps(
  steps: readonly DirectionStep[],
): DisplayDirectionStep[] {
  return steps.map((step, index) => ({
    displayOrder: index + 1,
    displayText: stripDirectionStepLabel(step.text),
    step,
  }));
}

export function stripDirectionStepLabel(text: string): string {
  return text
    .trim()
    .replace(
      /^(?:step\s*)?(?:\d+|[ivxlcdm]+|[a-z])\s*(?:[.)\]:;]|[-–—])+\s*/i,
      "",
    )
    .replace(/^(?:[.)\]:;]|[-–—])+\s*/, "")
    .trim();
}
