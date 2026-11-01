import { type Edl, EdlSchema, edlDuration } from "../edl";
import { finalizeEdl } from "./finalize";
import { applyCommands } from "./commands";
import { pickCta } from "./knowledge";
import { chooseTrack, trackVolume } from "./music";
import { BG_WORDS, EMOJI_RE, TEXTURE_WORDS, iconFor, type Background, type Texture } from "../motion";
import { fixText, newReport, reportLine } from "./textfix";
import type { Analysis, Brief, Director } from "./types";

const FILLERS = new Set(["é", "e", "então", "hum", "hmm", "ah", "eh", "tipo", "né", "deixa", "eu", "ver", "aqui", "assim", "uh", "ahn"]);
const MAX_CLIP = { viral: 2.6, premium: 4, cinematic: 6 } as const;
const DEFAULT_TARGET = { viral: 30, premium: 30, cinematic: 45 } as const;

export function parseBrief(instructions: string) {
  const s = instructions || "";
  const price = s.match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/i)?.[0].replace(/\s+/, " ") ?? null;
  const duration = s.match(/dura[çc][aã]o\s*[:=]?\s*(\d{1,3})\s*(?:s\b|seg)/i)?.[1];
  const cta = s.match(/CTA\s*[:=]\s*["“]?([^"”\n.]+)/i)?.[1].trim() ?? null;
  const intro = s.match(/(?:abertura|t[ií]tulo)\s*[:=]\s*["“]?([^"”\n.]+)/i)?.[1].trim() ?? null;
  const dur = s.match(/(\d{1,3})\s*(?:s\b|seg)/i)?.[1];
  const narration = s.match(/narra[çc][aã]o\s*[:=]\s*["“]?([^"”\n]+)/i)?.[1].trim() ?? null;
  return { price, cta, intro, target: duration ? Number(duration) : dur ? Number(dur) : null, narration };
}

/** Segmentos-base: fala (sem pausas e sem trechos só de muleta) ou cenas. */
function baseSegments(a: Analysis, style: keyof typeof MAX_CLIP) {
  const segs: { in: number; out: number }[] = [];
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

const SCENE_SECONDS = { viral: 1.9, premium: 2.6, cinematic: 3.2 } as const;
const PRICE_RE = /(?:R\$\s?)?\d{1,3}(?:\.\d{3})*,\d{2}|R\$\s?\d{1,3}(?:\.\d{3})*/i;
const CTA_RE = /^(cta\s*[:=]\s*)|\b(acesse|chama|chame|compre|garanta|clique|link|direct|whats|venha|entre|aproveite|siga)\b/i;

/** Vídeo 100% motion: cada linha das instruções vira uma cena (título, benefícios, preço, CTA). */
export function motionPlan(b: Brief): Edl {
  const all = (b.instructions || "").split(/\n|(?<=[.!?])\s+/).map((l) => l.trim().replace(/^[-•\d.)\s]+(?=\S)/, "").replace(/[.;]+$/, ""));
  const directives = all.filter((l) => /^(fundo|textura|emojis?|[ií]cones?)\b/i.test(l));
  const lines = all.filter((l) => l && !directives.includes(l) && !/^(dura[çc][aã]o|narra[çc][aã]o|abertura|t[ií]tulo)\s*[:=]/i.test(l));
  const p = parseBrief(b.instructions);
  const base = SCENE_SECONDS[b.style];
  const rep = newReport();
  const cap = (t: string, n = 90) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
  type S = { kind: "title" | "feature" | "price" | "cta" | "compare" | "counter" | "check"; text: string; sub?: string; duration: number; icon?: string; bg?: Background; compare?: { left: { label: string; value: string }; right: { label: string; value: string } } };
  const scenes: S[] = [];
  scenes.push({ kind: "title", text: cap(fixText(p.intro || b.name, rep) || b.name, 60), sub: b.objective || undefined, duration: base + 0.4 });
  let cta: string | null = p.cta;
  const money = (s: string) => { const m = s.match(PRICE_RE); return m ? (/R\$/.test(m[0]) ? m[0].replace(/\s+/, " ") : `R$ ${m[0]}`) : null; };
  for (const raw0 of lines) {
    const em = raw0.match(EMOJI_RE); // emoji no começo da linha = ícone da cena
    const raw = em ? raw0.slice(em[0].length) : raw0;
    const l = fixText(raw, rep); // revisor: corrige grafia e descarta o que não faz sentido
    if (!l) continue;
    const icon = em?.[1] ?? iconFor(l);
    const bg: Background | undefined = /caderno|papel|planilha|anota/i.test(l) ? "paper" : undefined; // "jeito antigo" em papel
    if (/^(?:✓|✔|check\s*[:=])/i.test(raw)) { scenes.push({ kind: "check", text: cap(l.replace(/^(?:check\s*[:=]\s*)/i, "")), duration: base + 0.2 }); continue; }
    if (CTA_RE.test(l) && !PRICE_RE.test(l)) { cta = l.replace(/^cta\s*[:=]\s*/i, ""); continue; }
    const vs = l.split(/\s+(?:vs\.?|x|contra)\s+/i);
    if (vs.length === 2 && money(vs[0]) && money(vs[1])) {
      const side = (s: string) => ({ label: cap(s.replace(PRICE_RE, "").replace(/R\$\s*/i, "").replace(/\s{2,}/g, " ").trim(), 40), value: money(s)! });
      scenes.push({ kind: "compare", text: "Compare", compare: { left: side(vs[0]), right: side(vs[1]) }, duration: base + 1.6 });
      continue;
    }
    const value = money(l);
    if (value) {
      const label = l.replace(l.match(PRICE_RE)![0], "").replace(/R\$\s*/i, "").replace(/\s{2,}/g, " ").trim();
      const counter = /^(menos de|apenas|s[óo]|mais de|at[ée])\b/i.test(label) && label.split(" ").length <= 3;
      scenes.push({ kind: counter ? "counter" : "price", text: cap(value, 30), sub: label ? cap(label, 120) : undefined, duration: base + (counter ? 1.2 : 0.8), icon: counter ? undefined : icon });
    } else scenes.push({ kind: "feature", text: cap(highlight(l)), duration: Math.min(5, base + l.length / 40), icon, bg });
  }
  if (scenes.length === 1) scenes.push({ kind: "feature", text: cap(b.objective || b.name), duration: base });
  const ctaText = cap(fixText(cta || "", rep) || (/venda|lan[çc]amento/i.test(b.objective) ? pickCta(b.name) : "Saiba mais"), 60);
  scenes.push({ kind: "cta", text: ctaText, duration: base + 1, icon: iconFor(ctaText) });
  if (p.target) {
    const total = scenes.reduce((s, x) => s + x.duration, 0);
    const k = p.target / total;
    scenes.forEach((x) => (x.duration = Math.max(0.8, Math.min(8, +(x.duration * k).toFixed(2)))));
  }
  // tema: padrão do estilo + diretivas "fundo: branco", "textura: pontilhada", "emojis: 🔥 📱"
  const dir = directives.join(" ").toLowerCase();
  const bgD = directives.find((d) => /^fundo/i.test(d))?.toLowerCase() ?? "";
  const txD = directives.find((d) => /^textura/i.test(d))?.toLowerCase() ?? "";
  const theme = {
    bg: (BG_WORDS.find(([re]) => re.test(bgD))?.[1] ?? (b.style === "premium" ? "glow" : "black")) as Background,
    texture: (TEXTURE_WORDS.find(([re]) => re.test(txD))?.[1] ?? (b.style === "viral" ? "stripes" : "grain")) as Texture,
    floaters: null as { items: string[] } | null,
  };
  const emojis = [...dir.matchAll(/\p{Extended_Pictographic}/gu)].map((m) => m[0]);
  if (/sem (emojis?|[ií]cones?)/.test(dir)) theme.floaters = null;
  else if (emojis.length) theme.floaters = { items: emojis.slice(0, 8) };
  else theme.floaters = { items: [...new Set(scenes.map((s) => s.icon).filter((x): x is string => !!x))].slice(0, 6) };
  if (theme.floaters && !theme.floaters.items.length) theme.floaters = null;
  return EdlSchema.parse({
    mode: "motion", format: b.format, preset: b.style, clips: [], motion: { theme, scenes: scenes.slice(0, 30) },
    captions: { enabled: false, position: "bottom", size: "md", items: [] },
    overlays: { intro: null, texts: [], price: null, cta: null },
    audio: { sourceVolume: 1, music: musicFor(b, true), narration: p.narration ? { text: p.narration, volume: 1 } : null, normalize: true },
    notes: `Vídeo 100% motion (sem vídeo-fonte).${reportLine(rep) ? ` Revisão: ${reportLine(rep)}` : ""}`.slice(0, 500),
  });
}

/** Trilha: a enviada pelo usuário ou uma gerada que combine com o vídeo. */
export function musicFor(b: Brief, motion: boolean) {
  if (b.hasMusic) return { volume: motion ? 0.9 : b.style === "viral" ? 0.22 : 0.16, track: null };
  const track = chooseTrack({ style: b.style, objective: b.objective, text: b.instructions, seed: b.name });
  return { volume: trackVolume(track.genre, motion), track };
}

/** Destaca (com *…*) números, preços, parcelas e palavras de impacto. Respeita *…* já escrito. */
export function highlight(s: string): string {
  if (s.includes("*")) return s;
  const m = s.match(/R\$\s?\d[\d.,]*|\b\d+\s?(?:x|%|anos?|meses|dias|gb|vezes)\b|\b(?:gr[aá]tis|garantia|brindes?|exclusiv\w*|premium|novo|nova|lan[çc]amento|seminovos?|pix)\b/i);
  return m ? s.replace(m[0], `*${m[0]}*`) : s;
}

export function heuristicPlan(a: Analysis, b: Brief): Edl {
  if (!b.hasVideo) return motionPlan(b);
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
      cta: { text: (p.cta || (isSale ? pickCta(b.name) : "Saiba mais")).slice(0, 60), duration: ctaDur },
    },
    audio: {
      sourceVolume: 1,
      music: musicFor(b, false),
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
