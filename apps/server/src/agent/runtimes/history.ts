export type RuntimeHistoryMessage = {
  role: "user" | "assistant";
  content: string | unknown;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function extractMessageText(content: string | unknown): string {
  return typeof content === "string" ? content : "";
}

export async function loadNormalizedSessionHistory(input: {
  currentPrompt: string;
  loadSessionMessages?: (
    sessionId: string,
  ) => Promise<RuntimeHistoryMessage[]>;
  onError?: (error: unknown) => void;
  sessionId: string;
}): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  if (!input.loadSessionMessages) return [];

  let savedMessages: RuntimeHistoryMessage[];
  try {
    savedMessages = await input.loadSessionMessages(input.sessionId);
  } catch (error) {
    if (!input.onError) {
      throw error;
    }
    input.onError(error);
    return [];
  }

  const lastMessage = savedMessages.at(-1);
  const shouldDropLastUser =
    lastMessage?.role === "user" &&
    normalizeText(extractMessageText(lastMessage.content)) ===
      normalizeText(input.currentPrompt);

  const history = shouldDropLastUser ? savedMessages.slice(0, -1) : savedMessages;
  return history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: extractMessageText(message.content),
    }));
}
