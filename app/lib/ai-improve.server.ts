/**
 * AI recipe improvement — fallback chain, KV cache, quota, food-safety post-filter.
 *
 * Fallback order (per plan iteration-3 Option B):
 *   1. Workers AI (Llama 3.1) — free, edge-native
 *   2. Anthropic via ANTHROPIC_OAUTH_TOKEN (subscription-bound)
 *   3. OpenAI via OPENAI_CODEX_TOKEN (subscription-bound)
 *
 * Workers AI is not available in unit tests (no CF runtime), so the calling
 * code wraps it behind the `callWorkersAI` injectable. Tests stub that layer.
 */

import {
  recipeIngredientLines,
  type ImprovedRecipe,
  type RecipeInput,
} from "./ai-improve.shared";

export interface ImprovementResult {
  improved: ImprovedRecipe;
  provider: "workers-ai" | "anthropic" | "openai";
  tokensIn: number;
  tokensOut: number;
  fromCache: boolean;
}

export type WorkersAICaller = (
  prompt: string,
  systemPrompt: string
) => Promise<string>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PROMPT_VERSION = 1;
export const DAILY_QUOTA = 5;

// ---------------------------------------------------------------------------
// Food-safety post-filter
// ---------------------------------------------------------------------------

const UNSAFE_PATTERNS: RegExp[] = [
  // raw egg near reference to children (any order, within 100 chars)
  /\braw\s+eggs?\b.{0,100}\b(children?|kids?|infants?|baby|babies|toddlers?)\b/i,
  /\b(children?|kids?|infants?|baby|babies|toddlers?)\b.{0,100}\braw\s+eggs?\b/i,
  // pork served undercooked / rare (any order)
  /\bpork\b.{0,60}\b(undercooked|pink|rare|medium.?rare)\b/i,
  /\b(undercooked|pink|rare|medium.?rare)\b.{0,60}\bpork\b/i,
  // raw poultry
  /\braw\s+(chicken|poultry|turkey)\b/i,
];

export function checkFoodSafety(text: string): string | null {
  for (const pat of UNSAFE_PATTERNS) {
    if (pat.test(text)) return pat.source;
  }
  return null;
}

export function applyFoodSafetyFilter(result: ImprovedRecipe): {
  safe: boolean;
  flaggedPattern: string | null;
} {
  const combined = [
    result.directions,
    result.notes,
    ...result.ingredients,
  ].join(" ");
  const flagged = checkFoodSafety(combined);
  return { safe: flagged === null, flaggedPattern: flagged };
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

export function buildCacheKey(
  contentHash: string,
  profileId: string,
  promptVersion: number
): string {
  return `ai-improve:${contentHash}:${profileId}:v${promptVersion}`;
}

// ---------------------------------------------------------------------------
// Quota check
// ---------------------------------------------------------------------------

export async function checkAndIncrementQuota(
  kv: KVNamespace,
  userId: string,
  day: string // YYYY-MM-DD
): Promise<{ allowed: boolean; used: number }> {
  const key = `ai-quota:${userId}:${day}`;
  const raw = await kv.get(key);
  const used = raw ? parseInt(raw, 10) : 0;
  if (used >= DAILY_QUOTA) return { allowed: false, used };
  await kv.put(key, String(used + 1), { expirationTtl: 86400 * 2 });
  return { allowed: true, used: used + 1 };
}

export async function getQuotaUsed(
  kv: KVNamespace,
  userId: string,
  day: string
): Promise<number> {
  const key = `ai-quota:${userId}:${day}`;
  const raw = await kv.get(key);
  return raw ? parseInt(raw, 10) : 0;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export function buildSystemPrompt(profileSystemPrompt: string): string {
  return `${profileSystemPrompt}

When improving a recipe, return ONLY valid JSON matching this exact schema:
{
  "title": "string",
  "description": "string",
  "ingredients": ["string", ...],
  "directions": "string",
  "notes": "string"
}
Each ingredient line should be a complete string like "2 cups flour".
Directions should be a single string with numbered steps separated by newlines.
Do not include any text outside the JSON object.`;
}

export function buildUserPrompt(recipe: RecipeInput): string {
  const ingredientLines = recipeIngredientLines(recipe).map((line) => `- ${line}`);

  return `Please improve this recipe:

Title: ${recipe.title}
Description: ${recipe.description ?? ""}

Ingredients:
${ingredientLines.join("\n")}

Directions:
${recipe.directionsText ?? ""}

Notes:
${recipe.notes ?? ""}`;
}

// ---------------------------------------------------------------------------
// Token budget estimation (rough: 1 token ≈ 4 chars)
// ---------------------------------------------------------------------------

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const WORKERS_AI_TOKEN_LIMIT = 6000;

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

export function parseImprovedRecipeJson(raw: string): ImprovedRecipe {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<ImprovedRecipe>;
  if (
    typeof parsed.title !== "string" ||
    typeof parsed.directions !== "string" ||
    !Array.isArray(parsed.ingredients)
  ) {
    throw new Error("Invalid improved recipe structure");
  }
  return {
    title: parsed.title ?? "",
    description: parsed.description ?? "",
    ingredients: parsed.ingredients as string[],
    directions: parsed.directions ?? "",
    notes: parsed.notes ?? "",
  };
}

// ---------------------------------------------------------------------------
// Anthropic call (subscription OAuth token, Claude Haiku)
// ---------------------------------------------------------------------------

export async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  token: string
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const body = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401 || resp.status === 403) {
    const err = new Error(`Anthropic auth error: ${resp.status}`);
    (err as Error & { tosError: boolean }).tosError = true;
    throw err;
  }

  if (!resp.ok) {
    throw new Error(`Anthropic error: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const text =
    data.content.find((c) => c.type === "text")?.text ?? "";
  return {
    text,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// OpenAI call (subscription Codex token)
// ---------------------------------------------------------------------------

export async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  token: string
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const body = {
    model: "gpt-4o-mini",
    max_tokens: 2048,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401 || resp.status === 403) {
    const err = new Error(`OpenAI auth error: ${resp.status}`);
    (err as Error & { tosError: boolean }).tosError = true;
    throw err;
  }

  if (!resp.ok) {
    throw new Error(`OpenAI error: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  const text = data.choices[0]?.message?.content ?? "";
  return {
    text,
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Main improve function
// ---------------------------------------------------------------------------

export interface ImprovementEnv {
  kv: KVNamespace;
  anthropicToken: string | undefined;
  openaiToken: string | undefined;
  callWorkersAI: WorkersAICaller | null;
}

export async function improveRecipe(
  recipe: RecipeInput,
  profile: { id: string; systemPrompt: string },
  env: ImprovementEnv,
  userId: string,
  day: string
): Promise<ImprovementResult & { tosError?: boolean }> {
  const systemPrompt = buildSystemPrompt(profile.systemPrompt);
  const userPrompt = buildUserPrompt(recipe);
  const tokenEstimate = estimateTokens(userPrompt);

  // KV cache check
  const cacheKey = buildCacheKey(
    recipe.contentHash ?? recipe.id,
    profile.id,
    PROMPT_VERSION
  );
  const cached = await env.kv.get(cacheKey, "json") as ImprovedRecipe | null;
  if (cached) {
    return {
      improved: cached,
      provider: "workers-ai",
      tokensIn: 0,
      tokensOut: 0,
      fromCache: true,
    };
  }

  // Quota check
  const quota = await checkAndIncrementQuota(env.kv, userId, day);
  if (!quota.allowed) {
    throw Object.assign(new Error("Daily quota exceeded"), { quotaExceeded: true });
  }

  let text = "";
  let provider: ImprovementResult["provider"] = "workers-ai";
  let tokensIn = 0;
  let tokensOut = 0;
  let tosError = false;

  // Try Workers AI if within token budget
  if (env.callWorkersAI && tokenEstimate <= WORKERS_AI_TOKEN_LIMIT) {
    try {
      text = await env.callWorkersAI(userPrompt, systemPrompt);
      provider = "workers-ai";
    } catch {
      // fall through to Anthropic
    }
  }

  // Fallback: Anthropic
  if (!text && env.anthropicToken) {
    try {
      const r = await callAnthropic(systemPrompt, userPrompt, env.anthropicToken);
      text = r.text;
      tokensIn = r.tokensIn;
      tokensOut = r.tokensOut;
      provider = "anthropic";
    } catch (e) {
      if ((e as Error & { tosError?: boolean }).tosError) tosError = true;
      // fall through to OpenAI
    }
  }

  // Fallback: OpenAI
  if (!text && env.openaiToken) {
    try {
      const r = await callOpenAI(systemPrompt, userPrompt, env.openaiToken);
      text = r.text;
      tokensIn = r.tokensIn;
      tokensOut = r.tokensOut;
      provider = "openai";
      tosError = false;
    } catch (e) {
      if ((e as Error & { tosError?: boolean }).tosError) tosError = true;
    }
  }

  if (!text) {
    const err = Object.assign(new Error("All AI providers failed"), { tosError });
    throw err;
  }

  const improved = parseImprovedRecipeJson(text);

  // Food-safety post-filter
  const safety = applyFoodSafetyFilter(improved);
  if (!safety.safe) {
    throw new Error(`Food safety check failed: ${safety.flaggedPattern}`);
  }

  // Cache the result (30-day TTL)
  await env.kv.put(cacheKey, JSON.stringify(improved), {
    expirationTtl: 60 * 60 * 24 * 30,
  });

  return { improved, provider, tokensIn, tokensOut, fromCache: false, tosError };
}
