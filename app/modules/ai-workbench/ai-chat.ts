import { z } from "zod";

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const aiChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1),
  })
  .strict();

const aiChatHistorySchema = z.array(aiChatMessageSchema).max(12);

export function appendAiChatTurn({
  history,
  prompt,
  changeSummary,
}: {
  history: AiChatMessage[];
  prompt: string;
  changeSummary: string[];
}): AiChatMessage[] {
  const nextHistory: AiChatMessage[] = [
    ...history,
    {
      role: "user",
      content: prompt,
    },
    {
      role: "assistant",
      content: changeSummary.length
        ? `Updated the draft with ${changeSummary.length} change${
            changeSummary.length === 1 ? "" : "s"
          }.`
        : "Prepared an updated recipe draft.",
    },
  ];

  return nextHistory.slice(-12);
}

export function parseAiChatHistoryJson(value: string | undefined): AiChatMessage[] {
  if (!value) {
    return [];
  }

  return aiChatHistorySchema.parse(JSON.parse(value));
}

export function serializeAiChatHistory(history: AiChatMessage[]): string {
  return JSON.stringify(aiChatHistorySchema.parse(history));
}
