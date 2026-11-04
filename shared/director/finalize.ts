import { type Edl, mapWordsToTimeline, normalizeEdl, srcToTimeline, wordsToCaptions } from "../edl";
import type { Analysis } from "./types";
import { fixCaption, fixText, newReport, reportLine } from "./textfix";

export const CAPTION_WORDS = { viral: 3, premium: 5, cinematic: 6 } as const;

/** Valida (zod), limita à fonte e regenera as legendas a partir da transcrição. */
export function finalizeEdl(raw: unknown, a: Analysis): Edl {
  const edl = normalizeEdl(anchorToSource(raw), a.duration);
  if (edl.mode === "video") edl.clips = punchClips(edl.clips, edl.preset);
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
 * Tomadas longas sem corte viram "jump zoom" (skill RBTech): a tomada é dividida em pedaços contínuos
 * que alternam enquadramento aberto/fechado — o tempo não muda, só o ritmo visual.
 */
export function punchClips(clips: Edl["clips"], preset: Edl["preset"]): Edl["clips"] {
  const out: Edl["clips"] = [];
  for (const c of clips) {
    const len = (c.out - c.in) / (c.speed || 1);
    const piece = PIECE[preset];
    if (len < piece * 1.6) { out.push(c); continue; }
    const n = Math.round(len / piece);
    const step = (c.out - c.in) / n;
    for (let k = 0; k < n; k++) {
      const z = k % 2 === 0 ? c.zoom : c.zoom > 1.02 ? 1 : PUNCH[preset];
      out.push({ ...c, in: +(c.in + k * step).toFixed(3), out: +(k === n - 1 ? c.out : c.in + (k + 1) * step).toFixed(3), zoom: z });
    }
  }
  return out.slice(0, 200);
}

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
