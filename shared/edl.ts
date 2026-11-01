import { z } from "zod";
import { FORMATS, STYLES } from "./constants";
import { ANIMS, BACKGROUNDS, LAYOUTS, TEXTURES, VISUALS } from "./motion";

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

export const SCENE_KINDS = ["title", "feature", "price", "cta", "compare", "counter", "check"] as const;
const CompareSide = z.object({ label: z.string().max(40).default(""), value: z.string().min(1).max(30), sub: z.string().max(60).optional() });
// Texto aceita *destaque* (cor de acento) e ~riscado~.
export const MotionSceneSchema = z.object({
  kind: z.enum(SCENE_KINDS).default("feature"),
  text: z.string().min(1).max(90),
  sub: z.string().max(120).optional(),
  duration: z.number().min(0.8).max(8).default(2.2),
  icon: z.string().max(40).optional(), // nome de ícone (Lucide) ou emoji
  bg: z.enum(BACKGROUNDS).optional(), // fundo só desta cena
  compare: z.object({ left: CompareSide, right: CompareSide }).optional(),
  layout: z.enum(LAYOUTS).optional(), // posição do texto
  anim: z.enum(ANIMS).optional(), // animação de entrada do texto
  visual: z.enum(VISUALS).optional(), // iPhones desenhados animados
});
export const MotionThemeSchema = z.object({
  bg: z.enum(BACKGROUNDS).default("glow"),
  texture: z.enum(TEXTURES).default("grain"),
  floaters: z.object({ items: z.array(z.string().max(40)).max(12) }).nullable().default(null), // ícones/emojis flutuando
});

export const EdlSchema = z.object({
  version: z.literal(1).default(1),
  // video = edição do vídeo enviado · motion = vídeo 100% animado (sem vídeo-fonte)
  mode: z.enum(["video", "motion"]).default("video"),
  motion: z.object({ theme: MotionThemeSchema.default({ bg: "glow", texture: "grain", floaters: null }), scenes: z.array(MotionSceneSchema).min(1).max(30) }).nullable().default(null),
  format: z.enum(FORMATS),
  preset: z.enum(STYLES),
  fps: z.literal(30).default(30),
  clips: z.array(ClipSchema).max(200).default([]),
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
    // track = trilha gerada pelo diretor (quando o projeto não tem trilha enviada)
    music: z.object({
      volume: z.number().min(0).max(1).default(0.18),
      track: z.object({ genre: z.enum(["trap", "pop", "light"]), bpm: z.number().min(60).max(180).default(110), shift: z.number().int().min(-6).max(6).default(0), seed: z.number().int().min(1).max(9999).default(1) }).nullable().default(null),
    }).nullable().default(null),
    // custom=false (padrão): no motion, fala cena por cena o texto da tela, sincronizado; custom=true: texto livre em faixa única
    narration: z.object({ text: z.string().min(1).max(2500), voiceId: z.string().max(64).optional(), volume: z.number().min(0).max(2).default(1), custom: z.boolean().default(false), tone: z.enum(["animado", "neutro", "calmo"]).default("animado") }).nullable().default(null),
    normalize: z.boolean().default(true),
  }),
  notes: z.string().max(500).default(""),
}).refine((e) => (e.mode === "motion" ? !!e.motion?.scenes.length : e.clips.length > 0), { message: "EDL precisa de clips (vídeo) ou cenas (motion)" });

export type Edl = z.infer<typeof EdlSchema>;
export type Clip = Edl["clips"][number];

export const clipDuration = (c: Pick<Clip, "in" | "out" | "speed">) => (c.out - c.in) / (c.speed || 1);
export const edlDuration = (e: { clips: Pick<Clip, "in" | "out" | "speed">[]; mode?: string; motion?: { scenes: { duration: number }[] } | null }) =>
  e.mode === "motion" ? (e.motion?.scenes ?? []).reduce((s, x) => s + x.duration, 0) : e.clips.reduce((s, c) => s + clipDuration(c), 0);

/** Valida e "conserta" o que for possível: limita clips à duração da fonte e overlays à timeline. */
export function normalizeEdl(input: unknown, sourceDuration: number): Edl {
  const edl = EdlSchema.parse(input);
  if (edl.mode === "motion") {
    edl.clips = [];
    edl.captions.items = [];
  } else edl.clips = edl.clips
    .map((c) => ({ ...c, in: Math.max(0, c.in), out: Math.min(sourceDuration, c.out) }))
    .filter((c) => c.out - c.in >= 0.2);
  if (edl.mode === "video" && !edl.clips.length) throw new Error("EDL sem clipes válidos dentro da duração da fonte");
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
