import {
  formatIngredientDisplayText,
  formatIngredientMeasure,
  type DirectionStep,
  type IngredientItem,
  type IngredientSection,
} from "~/modules/recipe-domain";

export type DirectionIngredientMention =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "ingredient";
      ingredientId: string;
      measure: string;
      text: string;
    };

export type DirectionIngredient = {
  id: string;
  displayText: string;
  measure: string;
};

type IngredientMatch = DirectionIngredient & {
  aliases: string[];
};

export function buildDirectionIngredientIndex(
  sections: IngredientSection[],
): Map<string, DirectionIngredient> {
  return new Map(
    sections
      .flatMap((section) => section.items)
      .map((ingredient) => [
        ingredient.id,
        {
          id: ingredient.id,
          displayText: formatIngredientDisplayText(ingredient),
          measure: formatIngredientMeasure(ingredient),
        },
      ]),
  );
}

export function getDirectionStepIngredientSummary(
  step: DirectionStep,
  index: Map<string, DirectionIngredient>,
): DirectionIngredient[] {
  return getReferencedIngredientIds(step, index)
    .map((ingredientId) => index.get(ingredientId))
    .filter((ingredient): ingredient is DirectionIngredient => Boolean(ingredient))
    .filter((ingredient) => ingredient.measure.length > 0);
}

export function enrichDirectionStepText(
  step: DirectionStep,
  ingredientSections: IngredientSection[],
): DirectionIngredientMention[] {
  const allIngredients = ingredientSections.flatMap((section) => section.items);
  const index = new Map(allIngredients.map((ingredient) => [ingredient.id, ingredient]));
  const referencedIds = getReferencedIngredientIds(
    step,
    buildDirectionIngredientIndex(ingredientSections),
  );
  const shouldUseLooseAliases = referencedIds.length > 0;
  const ingredientsToMatch = (
    shouldUseLooseAliases
      ? referencedIds.map((ingredientId) => index.get(ingredientId))
      : allIngredients
  ).filter((ingredient): ingredient is IngredientItem => Boolean(ingredient));
  const matches = removeAmbiguousAliases(
    ingredientsToMatch.map((ingredient) =>
      toIngredientMatch(ingredient, shouldUseLooseAliases),
    ),
    shouldUseLooseAliases,
  )
    .filter((match) => match.measure.length > 0 && match.aliases.length > 0)
    .sort((a, b) => b.aliases[0].length - a.aliases[0].length);

  return matches.reduce<DirectionIngredientMention[]>(
    (parts, ingredient) =>
      parts.flatMap((part) =>
        part.type === "text" ? injectIngredientMention(part.text, ingredient) : [part],
      ),
    [{ type: "text", text: step.text }],
  );
}

function getReferencedIngredientIds(
  step: DirectionStep,
  index: Map<string, unknown>,
): string[] {
  return (step.ingredientRefs ?? []).filter((ingredientId) => index.has(ingredientId));
}

function toIngredientMatch(
  ingredient: IngredientItem,
  allowSingleWordAliases: boolean,
): IngredientMatch {
  return {
    id: ingredient.id,
    aliases: createIngredientAliases(ingredient.item, allowSingleWordAliases),
    displayText: formatIngredientDisplayText(ingredient),
    measure: formatIngredientMeasure(ingredient),
  };
}

function createIngredientAliases(
  item: string,
  allowSingleWordAliases: boolean,
): string[] {
  const words = item
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const aliases = new Set<string>();

  for (let index = 0; index < words.length; index += 1) {
    const phraseWords = words.slice(index);
    const phrase = phraseWords.join(" ");

    if (phrase.length >= 4 && (allowSingleWordAliases || phraseWords.length > 1)) {
      aliases.add(phrase);
    }
  }

  if (allowSingleWordAliases) {
    for (const word of words) {
      if (word.length >= 5) {
        aliases.add(word);
        aliases.add(singularize(word));
      }
    }
  }

  return [...aliases]
    .filter((alias) => alias.length >= 4)
    .sort((a, b) => b.length - a.length);
}

function removeAmbiguousAliases(
  matches: IngredientMatch[],
  shouldKeepAmbiguousAliases: boolean,
): IngredientMatch[] {
  if (shouldKeepAmbiguousAliases) {
    return matches;
  }

  const aliasCounts = new Map<string, number>();

  for (const match of matches) {
    for (const alias of match.aliases) {
      aliasCounts.set(alias, (aliasCounts.get(alias) ?? 0) + 1);
    }
  }

  return matches.map((match) => ({
    ...match,
    aliases: match.aliases.filter((alias) => aliasCounts.get(alias) === 1),
  }));
}

function singularize(word: string): string {
  if (word.endsWith("ies")) {
    return `${word.slice(0, -3)}y`;
  }

  if (word.endsWith("s")) {
    return word.slice(0, -1);
  }

  return word;
}

function injectIngredientMention(
  text: string,
  ingredient: IngredientMatch,
): DirectionIngredientMention[] {
  const matcher = new RegExp(
    `(^|[^A-Za-z0-9])(${ingredient.aliases.map(escapeRegExp).join("|")})(?=$|[^A-Za-z0-9])`,
    "gi",
  );
  const parts: DirectionIngredientMention[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text))) {
    const prefix = match[1] ?? "";
    const mention = match[2] ?? "";
    const mentionStart = match.index + prefix.length;

    if (mentionStart > lastIndex) {
      parts.push({ type: "text", text: text.slice(lastIndex, mentionStart) });
    }

    parts.push({
      type: "ingredient",
      ingredientId: ingredient.id,
      measure: ingredient.measure,
      text: mention,
    });

    lastIndex = mentionStart + mention.length;
  }

  if (parts.length === 0) {
    return [{ type: "text", text }];
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", text: text.slice(lastIndex) });
  }

  return parts;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
