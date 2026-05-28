import { describe, expect, it, vi } from "vitest";

import {
  validRecipeDraftFixture,
  validRecipeFixture,
} from "~/modules/recipe-domain";

import {
  createOpenAiRecipeAiProviderFromEnv,
  extractOpenAiResponseText,
  OpenAiRecipeAiProvider,
  OpenAiRecipeAiProviderError,
  parseProviderText,
} from "../openai-recipe-ai.provider";

describe("OpenAiRecipeAiProvider", () => {
  it("requires an environment-owned API key", () => {
    expect(() => createOpenAiRecipeAiProviderFromEnv({})).toThrow(
      OpenAiRecipeAiProviderError,
    );
  });

  it("calls the Responses API with JSON schema output and parses draft JSON", async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({
          output_text: JSON.stringify(validProviderDraft()),
        }),
    );
    const provider = new OpenAiRecipeAiProvider({
      apiKey: "test-key",
      model: "gpt-test",
      fetch: fetchMock,
    });

    await expect(
      provider.generateRecipe({ prompt: "Make lemon pasta." }),
    ).resolves.toEqual(validProviderDraft());

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    expect(body).toMatchObject({
      model: "gpt-test",
      text: {
        format: {
          type: "json_schema",
          name: "project_spice_recipe_draft",
        },
      },
    });
    expect(body.input[1].content).toContain("Return only a JSON object");
  });

  it("extracts JSON wrapped in prose before schema validation", () => {
    const result = parseProviderText(
      `Here is the draft:\n${JSON.stringify(validProviderDraft())}`,
    );

    expect(result).toEqual({
      success: true,
      data: validProviderDraft(),
    });
  });

  it("makes one bounded repair attempt after invalid provider JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ output_text: "not json" }))
      .mockResolvedValueOnce(
        jsonResponse({ output_text: JSON.stringify(validProviderDraft()) }),
      );
    const provider = new OpenAiRecipeAiProvider({
      apiKey: "test-key",
      fetch: fetchMock,
    });

    await expect(
      provider.transformRecipe({
        recipe: validRecipeFixture,
        prompt: "Make it dairy-free.",
      }),
    ).resolves.toEqual(validProviderDraft());

    const repairBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(repairBody.input.at(-1).content).toContain("Repair the previous response");
  });

  it("does not make more than one repair attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ output_text: "not json" }))
      .mockResolvedValueOnce(jsonResponse({ output_text: "still not json" }));
    const provider = new OpenAiRecipeAiProvider({
      apiKey: "test-key",
      fetch: fetchMock,
    });

    await expect(
      provider.generateRecipe({ prompt: "Make lemon pasta." }),
    ).rejects.toMatchObject({
      kind: "json_parse",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("converts aborted requests into timeout errors", async () => {
    const fetchMock = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    const provider = new OpenAiRecipeAiProvider({
      apiKey: "test-key",
      timeoutMs: 1,
      fetch: fetchMock,
    });

    await expect(
      provider.generateRecipe({ prompt: "Make lemon pasta." }),
    ).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("surfaces non-OK responses as HTTP errors", async () => {
    const provider = new OpenAiRecipeAiProvider({
      apiKey: "test-key",
      fetch: vi.fn(async () =>
        jsonResponse({ error: { message: "bad key" } }, { status: 401 }),
      ),
    });

    await expect(
      provider.generateRecipe({ prompt: "Make lemon pasta." }),
    ).rejects.toMatchObject({
      kind: "http",
    });
  });
});

describe("extractOpenAiResponseText", () => {
  it("reads nested output message text", () => {
    expect(
      extractOpenAiResponseText({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify(validProviderDraft()),
              },
            ],
          },
        ],
      }),
    ).toBe(JSON.stringify(validProviderDraft()));
  });
});

function validProviderDraft() {
  return {
    draftRecipe: validRecipeDraftFixture,
    changeSummary: ["Prepared a structured recipe draft."],
  };
}

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}
