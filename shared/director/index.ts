import { ClaudeDirector, GEMINI_BASE_URL, LlmDirector, openAiCompatAsker } from "./llm";
import { HeuristicDirector } from "./heuristic";
import type { Director } from "./types";

export * from "./types";
export { finalizeEdl } from "./finalize";
export { COMMAND_HELP } from "./commands";

/** Escolhe o diretor pela env. Chave da IA só existe no servidor/worker. */
export function getDirector(): Director {
  const env = process.env;
  const geminiKey = env.GEMINI_API_KEY || (env.AI_PROVIDER === "gemini" ? env.AI_API_KEY : undefined);
  const provider = env.AI_PROVIDER || (geminiKey ? "gemini" : env.ANTHROPIC_API_KEY ? "anthropic" : env.AI_API_KEY && env.AI_BASE_URL ? "openai-compatible" : "heuristic");
  if (provider === "gemini" && geminiKey) {
    return new LlmDirector(openAiCompatAsker({ baseUrl: env.AI_BASE_URL || GEMINI_BASE_URL, apiKey: geminiKey.trim(), model: env.AI_MODEL || "gemini-2.5-flash", label: "gemini" }));
  }
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY) return new ClaudeDirector(env.ANTHROPIC_API_KEY);
  if (provider === "openai-compatible" && env.AI_API_KEY && env.AI_BASE_URL) {
    return new LlmDirector(openAiCompatAsker({ baseUrl: env.AI_BASE_URL, apiKey: env.AI_API_KEY.trim(), model: env.AI_MODEL || "", label: "ia" }));
  }
  return new HeuristicDirector();
}
