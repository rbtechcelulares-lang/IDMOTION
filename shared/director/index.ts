import { GEMINI_BASE_URL, LlmDirector, anthropicAsker, chainAskers, openAiCompatAsker, type Asker } from "./llm";
import { HeuristicDirector } from "./heuristic";
import type { Director } from "./types";

export * from "./types";
export { finalizeEdl } from "./finalize";
export { COMMAND_HELP } from "./commands";

export const AI_CHOICES = ["auto", "gemini", "opus", "haiku", "rules"] as const;
export type AiChoice = (typeof AI_CHOICES)[number];
export const AI_LABEL: Record<AiChoice, string> = {
  auto: "Automático (vídeo real: Opus → Gemini · motion: Gemini → Claude)",
  gemini: "Gemini (grátis)",
  opus: "Claude Opus 5.5 (melhor, pago por uso)",
  haiku: "Claude Haiku 5.5 (econômico, pago por uso)",
  rules: "Só regras (sem IA)",
};

function geminiAsker(): Asker | null {
  const env = process.env;
  const key = env.GEMINI_API_KEY || (env.AI_PROVIDER === "gemini" ? env.AI_API_KEY : undefined);
  if (!key) return null;
  const fallbackModels = (env.AI_FALLBACK_MODELS || "gemini-flash-latest,gemini-3.8-flash,gemini-3-flash-preview,gemini-3.1-flash-lite,gemini-2.5-flash").split(",").map((x) => x.trim());
  return openAiCompatAsker({ baseUrl: env.AI_BASE_URL || GEMINI_BASE_URL, apiKey: key.trim(), model: env.GEMINI_MODEL || (env.AI_PROVIDER === "gemini" ? env.AI_MODEL : "") || "gemini-flash-latest", label: "gemini", fallbackModels, reasoningEffort: env.AI_REASONING_EFFORT || "low" });
}

/**
 * Escolhe o cérebro criativo do projeto. Corrente de reserva: se o Opus falhar (sem crédito, limite, sobrecarga),
 * desce para o Haiku, depois para o Gemini; se nada responder, o diretor por regras faz o plano.
 */
export function getDirector(choice: string = "auto", video = false): Director {
  const env = process.env;
  const key = env.ANTHROPIC_API_KEY?.trim();
  const gem = geminiAsker();
  const opus = key ? anthropicAsker(key, env.CLAUDE_MODEL || "claude-opus-5-5") : null;
  const haiku = key ? anthropicAsker(key, env.CLAUDE_CHEAP_MODEL || "claude-haiku-5-5") : null;
  const compat = env.AI_PROVIDER === "openai-compatible" && env.AI_API_KEY && env.AI_BASE_URL ? openAiCompatAsker({ baseUrl: env.AI_BASE_URL, apiKey: env.AI_API_KEY.trim(), model: env.AI_MODEL || "", label: "ia" }) : null;
  const pick = (AI_CHOICES as readonly string[]).includes(choice) ? (choice as AiChoice) : "auto";
  const chain: (Asker | null)[] =
    pick === "rules" ? []
    : pick === "opus" ? [opus, haiku, gem]
    : pick === "haiku" ? [haiku, gem]
    : pick === "gemini" ? [gem, haiku]
    : env.AI_PROVIDER === "anthropic" ? [opus, haiku, gem]
    // vídeo real pede o cérebro mais forte (enxerga os quadros e a fala palavra a palavra): Opus primeiro, se houver chave
    : video ? [opus, gem, compat, haiku]
    : [gem, compat, haiku];
  const askers = chain.filter((x): x is Asker => !!x);
  return askers.length ? new LlmDirector(chainAskers(askers)) : new HeuristicDirector();
}
