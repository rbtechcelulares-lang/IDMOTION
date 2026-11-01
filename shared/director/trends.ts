import { z } from "zod";
import raw from "./trends.json";

/** Tendências do nicho, atualizadas pelo agente de pesquisa (2x/dia). Validadas: dado ruim é ignorado. */
export const TrendsSchema = z.object({
  updatedAt: z.string(),
  hooks: z.array(z.string().min(2).max(80)).max(30).default([]),
  ctas: z.array(z.string().min(2).max(60)).max(20).default([]),
  music: z.array(z.object({ genre: z.enum(["trap", "pop", "light"]), bpm: z.number().min(60).max(180), note: z.string().max(160) })).max(12).default([]),
  sources: z.array(z.object({ name: z.string(), url: z.string().url(), license: z.string(), notes: z.string().default("") })).max(40).default([]),
  ideas: z.array(z.string().max(160)).max(30).default([]),
});
export type Trends = z.infer<typeof TrendsSchema>;

const parsed = TrendsSchema.safeParse(raw);
export const TRENDS: Trends = parsed.success ? parsed.data : { updatedAt: "", hooks: [], ctas: [], music: [], sources: [], ideas: [] };

export function trendsForPrompt(): string {
  if (!TRENDS.updatedAt) return "";
  return `TENDÊNCIAS DO NICHO (atualizado ${TRENDS.updatedAt}; use como inspiração, sem copiar e sem inventar fatos):
Ganchos: ${TRENDS.hooks.join(" · ")}
Chamadas: ${TRENDS.ctas.join(" · ")}
Ideias: ${TRENDS.ideas.join(" · ")}
Trilhas: ${TRENDS.music.map((m) => `${m.genre} ${m.bpm}bpm (${m.note})`).join(" · ")}`;
}
