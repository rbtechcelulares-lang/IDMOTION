import { type Edl, edlDuration } from "../edl";
import { finalizeEdl } from "./finalize";
import { applyCommands } from "./commands";
import type { Analysis, Brief, Director } from "./types";

const FILLERS = new Set(["é", "e", "então", "hum", "hmm", "ah", "eh", "tipo", "né", "deixa", "eu", "ver", "aqui", "assim", "uh", "ahn"]);
const MAX_CLIP = { viral: 2.6, premium: 4, cinematic: 6 } as const;
const DEFAULT_TARGET = { viral: 30, premium: 30, cinematic: 45 } as const;

export function parseBrief(instructions: string) {
  const s = instructions || "";
  const price = s.match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/i)?.[0].replace(/\s+/, " ") ?? null;
  const cta = s.match(/CTA\s*[:=]\s*["“]?([^"”\n.]+)/i)?.[1].trim() ?? null;
  const intro = s.match(/(?:abertura|t[ií]tulo)\s*[:=]\s*["“]?([^"”\n.]+)/i)?.[1].trim() ?? null;
  const dur = s.match(/(\d{1,3})\s*(?:s\b|seg)/i)?.[1];
  const narration = s.match(/narra[çc][aã]o\s*[:=]\s*["“]?([^"”\n]+)/i)?.[1].trim() ?? null;
  return { price, cta, intro, target: dur ? Number(dur) : null, narration };
}

/** Segmentos-base: fala (sem pausas e sem trechos só de muleta) ou cenas. */
function baseSegments(a: Analysis, style: keyof typeof MAX_CLIP) {
  let segs: { in: number; out: number }[] = [];
  if (a.hasAudio && a.speech.length) {
    for (const s of a.speech) {
      const seg = { in: Math.max(0, s.start - 0.12), out: Math.min(a.duration, s.end + 0.15) };
      const words = a.words?.filter((w) => w.start >= s.start - 0.2 && w.end <= s.end + 0.2) ?? [];
      const meaningful = words.filter((w) => !FILLERS.has(w.text.toLowerCase().replace(/[^\p{L}]/gu, "")));
      if (words.length && meaningful.length === 0) continue; // só "é, hum, então"
      const last = segs[segs.length - 1];
      if (last && seg.in - last.out < 0.25) last.out = seg.out;
      else segs.push(seg);
    }
  }
  if (!segs.length) {
    const cuts = [0, ...a.scenes.filter((t) => t > 0.3 && t < a.duration - 0.3), a.duration];
    for (let i = 0; i < cuts.length - 1; i++) {
      for (let t = cuts[i]; t < cuts[i + 1] - 0.3; t += MAX_CLIP[style]) {
        segs.push({ in: t, out: Math.min(cuts[i + 1], t + MAX_CLIP[style]) });
      }
    }
  }
  return segs.filter((s) => s.out - s.in >= 0.4);
}

export function heuristicPlan(a: Analysis, b: Brief): Edl {
  const p = parseBrief(b.instructions);
  const target = Math.min(p.target ?? DEFAULT_TARGET[b.style], a.duration);
  const clips: Edl["clips"] = [];
  let total = 0;
  for (const s of baseSegments(a, b.style)) {
    if (total >= target) break;
    const out = Math.min(s.out, s.in + (target - total));
    if (out - s.in < 0.4) break;
    // ritmo: no viral alterna punch-in a cada clipe; no premium um leve zoom a cada 2
    const zoom = b.style === "viral" ? (clips.length % 2 ? 1.12 : 1) : b.style === "premium" && clips.length % 2 ? 1.05 : 1;
    clips.push({ in: +s.in.toFixed(3), out: +out.toFixed(3), speed: 1, zoom });
    total += out - s.in;
  }
  const dur = edlDuration({ clips });
  const ctaDur = Math.min(3, Math.max(1.5, dur * 0.15));
  const isSale = /venda|lan[çc]amento/i.test(b.objective);
  const edl = {
    format: b.format,
    preset: b.style,
    clips,
    captions: { enabled: true, position: b.style === "cinematic" ? "bottom" : "center", size: b.style === "viral" ? "lg" : "md", items: [] },
    overlays: {
      intro: { text: (p.intro || b.name).slice(0, 60), sub: b.objective ? b.objective.slice(0, 80) : undefined, duration: b.style === "viral" ? 1.6 : 2.4 },
      texts: [],
      price: p.price ? { start: +(dur * 0.55).toFixed(2), end: +(dur - ctaDur).toFixed(2), value: p.price, label: "por apenas" } : null,
      cta: { text: (p.cta || (isSale ? "Chama no direct" : "Saiba mais")).slice(0, 60), duration: ctaDur },
    },
    audio: {
      sourceVolume: 1,
      music: b.hasMusic ? { volume: b.style === "viral" ? 0.22 : 0.16 } : null,
      narration: p.narration ? { text: p.narration, volume: 1 } : null,
      normalize: true,
    },
    notes: "Plano heurístico (sem IA externa).",
  };
  return finalizeEdl(edl, a);
}

export class HeuristicDirector implements Director {
  readonly name = "heuristic";
  async plan(a: Analysis, b: Brief) {
    return heuristicPlan(a, b);
  }
  async edit(edl: Edl, instruction: string, a: Analysis) {
    const r = applyCommands(edl, instruction, a);
    return r ? { edl: finalizeEdl(r.edl, a), reply: r.reply } : null;
  }
}
