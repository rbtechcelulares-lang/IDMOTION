import { z } from "zod";
import { FORMATS, STYLES } from "./constants";

/** EDL (Edit Decision List) do ID MOTION. Tempos em segundos. */
export const ClipSchema = z.object({
  in: z.number().min(0),
  out: z.number().positive(),
  speed: z.number().min(0.5).max(2).default(1),
  zoom: z.number().min(1).max(1.6).default(1), // punch-in
  label: z.string().max(80).optional(),
}).refine((c) => c.out > c.in + 0.1, { message: "clip.out deve ser maior que clip.in" });

const Timed = { start: z.number().min(0), end: z.number().positive() };

export const CaptionSchema = z.object({ ...Timed, text: z.string().min(1).max(120) });

export const EdlSchema = z.object({
  version: z.literal(1).default(1),
  format: z.enum(FORMATS),
  preset: z.enum(STYLES),
  fps: z.literal(30).default(30),
  clips: z.array(ClipSchema).min(1).max(200),
  captions: z.object({
    enabled: z.boolean().default(true),
    position: z.enum(["bottom", "center", "top"]).default("bottom"),
    size: z.enum(["sm", "md", "lg"]).default("md"),
    items: z.array(CaptionSchema).max(1000).default([]),
  }),
  overlays: z.object({
    intro: z.object({ text: z.string().min(1).max(60), sub: z.string().max(80).optional(), duration: z.number().min(0.5).max(6).default(2.2) }).nullable().default(null),
    texts: z.array(z.object({ ...Timed, text: z.string().min(1).max(80), position: z.enum(["top", "center", "bottom"]).default("top") })).max(50).default([]),
    price: z.object({ ...Timed, value: z.string().min(1).max(30), label: z.string().max(40).optional() }).nullable().default(null),
    cta: z.object({ text: z.string().min(1).max(60), sub: z.string().max(80).optional(), duration: z.number().min(1).max(8).default(3) }).nullable().default(null),
  }),
  audio: z.object({
    sourceVolume: z.number().min(0).max(2).default(1),
    music: z.object({ volume: z.number().min(0).max(1).default(0.18) }).nullable().default(null),
    narration: z.object({ text: z.string().min(1).max(2500), voiceId: z.string().max(64).optional(), volume: z.number().min(0).max(2).default(1) }).nullable().default(null),
    normalize: z.boolean().default(true),
  }),
  notes: z.string().max(500).default(""),
});

export type Edl = z.infer<typeof EdlSchema>;
export type Clip = Edl["clips"][number];

export const clipDuration = (c: Pick<Clip, "in" | "out" | "speed">) => (c.out - c.in) / (c.speed || 1);
export const edlDuration = (e: Pick<Edl, "clips">) => e.clips.reduce((s, c) => s + clipDuration(c), 0);

/** Valida e "conserta" o que for possível: limita clips à duração da fonte e overlays à timeline. */
export function normalizeEdl(input: unknown, sourceDuration: number): Edl {
  const edl = EdlSchema.parse(input);
  edl.clips = edl.clips
    .map((c) => ({ ...c, in: Math.max(0, c.in), out: Math.min(sourceDuration, c.out) }))
    .filter((c) => c.out - c.in >= 0.2);
  if (!edl.clips.length) throw new Error("EDL sem clipes válidos dentro da duração da fonte");
  const total = edlDuration(edl);
  const clampT = <T extends { start: number; end: number }>(arr: T[]) =>
    arr.map((x) => ({ ...x, start: Math.max(0, x.start), end: Math.min(total, x.end) })).filter((x) => x.end - x.start >= 0.15);
  edl.captions.items = clampT(edl.captions.items);
  edl.overlays.texts = clampT(edl.overlays.texts);
  if (edl.overlays.price) edl.overlays.price = clampT([edl.overlays.price])[0] ?? null;
  return edl;
}

export type Word = { text: string; start: number; end: number };

/** Converte palavras (tempo da fonte) para o tempo da timeline, considerando cortes e velocidade. */
export function mapWordsToTimeline(words: Word[], clips: Clip[]): Word[] {
  const out: Word[] = [];
  let offset = 0;
  for (const c of clips) {
    const sp = c.speed || 1;
    for (const w of words) {
      const mid = (w.start + w.end) / 2;
      if (mid >= c.in && mid < c.out) {
        out.push({ text: w.text, start: offset + (Math.max(w.start, c.in) - c.in) / sp, end: offset + (Math.min(w.end, c.out) - c.in) / sp });
      }
    }
    offset += clipDuration(c);
  }
  return out;
}

/** Agrupa palavras em legendas curtas (máx. N palavras / quebra em pausas). */
export function wordsToCaptions(words: Word[], maxWords = 4): { start: number; end: number; text: string }[] {
  const caps: { start: number; end: number; text: string }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) caps.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" ").slice(0, 120) });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (cur.length >= maxWords || (prev && w.start - prev.end > 0.45) || (prev && /[.!?]$/.test(prev.text))) flush();
    cur.push(w);
  }
  flush();
  return caps;
}
