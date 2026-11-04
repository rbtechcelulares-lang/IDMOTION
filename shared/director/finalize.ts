import { type Edl, mapWordsToTimeline, normalizeEdl, srcToTimeline, wordsToCaptions } from "../edl";
import type { Analysis } from "./types";
import { fixCaption, fixText, newReport, reportLine } from "./textfix";

export const CAPTION_WORDS = { viral: 3, premium: 5, cinematic: 6 } as const;

/** Valida (zod), limita à fonte e regenera as legendas a partir da transcrição. */
export function finalizeEdl(raw: unknown, a: Analysis): Edl {
  const edl = normalizeEdl(anchorToSource(raw), a.duration);
  if (edl.mode === "video") edl.clips = punchClips(snapToWords(edl.clips, a.words ?? [], a.duration), edl.preset, a.words ?? []);
  if (edl.mode === "video" && a.words?.length) {
    edl.captions.items = wordsToCaptions(mapWordsToTimeline(a.words, edl.clips), CAPTION_WORDS[edl.preset]);
  }
  // revisor: corrige/descarta textos de legendas, cenas e overlays
  const rep = newReport();
  edl.captions.items = edl.captions.items.map((c) => ({ ...c, text: fixCaption(c.text, rep) })).filter((c) => c.text);
  if (edl.motion) edl.motion.scenes = edl.motion.scenes.map((s) => ({ ...s, text: fixText(s.text, rep), sub: s.sub ? fixText(s.sub, rep) || undefined : undefined })).filter((s) => s.text);
  const o = edl.overlays;
  if (o.intro) o.intro = { ...o.intro, text: fixText(o.intro.text, rep) || o.intro.text, sub: o.intro.sub ? fixText(o.intro.sub, rep) || undefined : undefined };
  if (o.cta) o.cta = { ...o.cta, text: fixText(o.cta.text, rep) || o.cta.text, sub: o.cta.sub ? fixText(o.cta.sub, rep) || undefined : undefined };
  if (o.price?.label) o.price = { ...o.price, label: fixText(o.price.label, rep, { sentenceCase: false }) || undefined };
  o.texts = o.texts.map((t) => ({ ...t, text: fixText(t.text, rep) })).filter((t) => t.text);
  const line = reportLine(rep);
  if (line) edl.notes = `${edl.notes.replace(/\s*Revisão: [\s\S]*$/, "")} Revisão: ${line}`.trim().slice(0, 500);
  return normalizeEdl(edl, a.duration);
}

const PUNCH = { viral: 1.16, premium: 1.07, cinematic: 1.04 } as const;
const PIECE = { viral: 1.9, premium: 2.6, cinematic: 3.4 } as const;

/**
 * Corte nunca no meio de uma palavra: se a borda do clipe cai dentro de uma palavra,
 * o início recua para antes dela e o fim avança para depois dela (com uma folga curta de respiro).
 */
export function snapToWords(clips: Edl["clips"], words: { start: number; end: number }[], dur: number): Edl["clips"] {
  if (!words.length) return clips;
  const PAD = 0.06;
  const out = clips.map((c) => {
    let { in: i, out: o } = c;
    const k = words.findIndex((w) => i > w.start - PAD && i < w.end);
    if (k >= 0) { const prev = words[k - 1]; i = Math.max(0, words[k].start - PAD, prev ? (prev.end + words[k].start) / 2 : 0); }
    const j = words.findIndex((w) => o > w.start && o < w.end + PAD);
    if (j >= 0) { const next = words[j + 1]; o = Math.min(dur, words[j].end + PAD, next ? (words[j].end + next.start) / 2 : dur); }
    return { ...c, in: +i.toFixed(3), out: +o.toFixed(3) };
  });
  // depois do ajuste, clipes seguidos não podem se sobrepor (repetiria áudio)
  for (let k = 1; k < out.length; k++) if (out[k].in < out[k - 1].out && out[k].in > out[k - 1].in) out[k] = { ...out[k], in: out[k - 1].out };
  return out.filter((c) => c.out - c.in > 0.15);
}

/**
 * Tomadas longas sem corte viram "jump zoom" (skill RBTech): a tomada é dividida em pedaços contínuos
 * que alternam enquadramento aberto/fechado — o tempo não muda, só o ritmo visual.
 * Com transcrição, a troca acontece só numa PAUSA entre palavras (de preferência fim de frase), nunca no meio da fala.
 */
export function punchClips(clips: Edl["clips"], preset: Edl["preset"], words: { text?: string; start: number; end: number }[] = []): Edl["clips"] {
  const out: Edl["clips"] = [];
  const piece = PIECE[preset];
  for (const c of clips) {
    const len = (c.out - c.in) / (c.speed || 1);
    if (len < piece * 1.6) { out.push(c); continue; }
    let cuts: number[];
    const inside = words.filter((w) => w.start >= c.in && w.end <= c.out);
    if (inside.length >= 2) {
      // pausas entre palavras dentro do clipe: [tempo do corte, peso] — fim de frase pesa mais
      const gaps = inside.slice(1).map((w, k) => { const prev = inside[k]; const g = w.start - prev.end; return { t: prev.end + g / 2, g, end: /[.!?,;:]$/.test(prev.text ?? "") }; }).filter((x) => x.g >= 0.04 || x.end);
      cuts = [];
      let last = c.in;
      for (;;) {
        const target = last + piece * (c.speed || 1);
        if (c.out - target < piece * 0.6) break;
        const near = gaps.filter((x) => x.t > last + piece * 0.55 && x.t < last + piece * 1.6 && c.out - x.t > piece * 0.5);
        if (!near.length) break;
        const best = near.reduce((a, b) => (score(b, target) > score(a, target) ? b : a));
        cuts.push(best.t);
        last = best.t;
      }
    } else {
      const n = Math.round(len / piece);
      cuts = Array.from({ length: n - 1 }, (_, k) => c.in + ((k + 1) * (c.out - c.in)) / n);
    }
    const edges = [c.in, ...cuts, c.out];
    for (let k = 0; k < edges.length - 1; k++) {
      const z = k % 2 === 0 ? c.zoom : c.zoom > 1.02 ? 1 : PUNCH[preset];
      out.push({ ...c, in: +edges[k].toFixed(3), out: +edges[k + 1].toFixed(3), zoom: z });
    }
  }
  return out.slice(0, 200);
}
const score = (x: { t: number; g: number; end: boolean }, target: number) => (x.end ? 1 : 0) + Math.min(x.g, 0.4) * 2 - Math.abs(x.t - target) * 0.6;

type Raw = Record<string, unknown> & { clips?: { in: number; out: number; speed?: number }[]; overlays?: Record<string, unknown> };
/**
 * A IA marca textos, preço e cards pelo segundo em que a palavra é DITA no vídeo-fonte ("at").
 * Aqui isso vira tempo da timeline (depois dos cortes); o que caiu num trecho cortado é descartado.
 */
export function anchorToSource(input: unknown): unknown {
  const raw = input as Raw;
  if (!raw || typeof raw !== "object" || raw.mode === "motion" || !Array.isArray(raw.clips) || !raw.overlays) return input;
  const clips = raw.clips.filter((c) => typeof c?.in === "number" && typeof c?.out === "number");
  const o = { ...raw.overlays };
  const place = <T extends { at?: number; start?: number; end?: number; dur?: number }>(x: T, dflt: number): (T & { start: number; end: number }) | null => {
    if (typeof x?.at !== "number") return typeof x?.start === "number" && typeof x?.end === "number" ? (x as T & { start: number; end: number }) : null;
    const t = srcToTimeline(x.at, clips);
    if (t === null) return null;
    const len = typeof x.dur === "number" ? x.dur : typeof x.start === "number" && typeof x.end === "number" ? x.end - x.start : dflt;
    const { at: _a, dur: _d, ...rest } = x;
    return { ...rest, start: +t.toFixed(2), end: +(t + Math.max(0.6, len)).toFixed(2) } as T & { start: number; end: number };
  };
  if (Array.isArray(o.texts)) o.texts = (o.texts as { at?: number }[]).map((x) => place(x, 1.8)).filter(Boolean);
  if (o.price && typeof o.price === "object") o.price = place(o.price as { at?: number }, 2.4);
  if (Array.isArray(o.cards)) o.cards = (o.cards as { at?: number; start?: number; scene?: { duration?: number } }[]).map((c) => {
    if (typeof c?.at !== "number") return c;
    const t = srcToTimeline(c.at, clips);
    return t === null ? null : { scene: c.scene, start: +t.toFixed(2) };
  }).filter(Boolean);
  return { ...raw, overlays: o };
}
