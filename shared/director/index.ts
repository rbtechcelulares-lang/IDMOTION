import { ClaudeDirector } from "./llm";
import { HeuristicDirector } from "./heuristic";
import type { Director } from "./types";

export * from "./types";
export { finalizeEdl } from "./finalize";
export { COMMAND_HELP } from "./commands";

/** Escolhe o diretor pela env. Chave da IA só existe no servidor/worker. */
export function getDirector(): Director {
  const provider = process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "heuristic");
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) return new ClaudeDirector(process.env.ANTHROPIC_API_KEY);
  return new HeuristicDirector();
}
