import type { Style } from "../constants";

export type Genre = "trap" | "pop" | "light";
export type Track = { genre: Genre; bpm: number; shift: number; seed: number };
export const GENRE_LABEL: Record<Genre, string> = { trap: "Trap (energia, venda direta)", pop: "Pop (animado, leve)", light: "Light (premium, clean)" };
const BPM_RANGE: Record<Genre, [number, number]> = { trap: [130, 150], pop: [98, 114], light: [80, 92] };

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };

/** Escolhe a trilha que combina com o vídeo (estilo, objetivo, palavras do brief) e varia por projeto. */
export function chooseTrack(o: { style: Style; objective?: string; text?: string; seed?: string }): Track {
  const t = `${o.objective ?? ""} ${o.text ?? ""}`.toLowerCase();
  let genre: Genre = o.style === "viral" ? "trap" : "light";
  if (/\btrap\b|\brua\b|pesad|agressiv|black friday|queima|liquida/.test(t)) genre = "trap";
  else if (/\bpop\b|animad|alegr|festa|divertid|lan[çc]amento|novidade|presente|dia das|natal|acess[óo]rio/.test(t)) genre = o.style === "cinematic" ? "light" : "pop";
  else if (/\blight\b|calm|elegan|premium|sofistic|institucional|tutorial|confian/.test(t)) genre = "light";
  return trackFor(genre, o.seed ?? t);
}

export function trackFor(genre: Genre, seed: string, bump = 0): Track {
  const h = hash(`${seed}#${bump}`);
  const [lo, hi] = BPM_RANGE[genre];
  return { genre, bpm: lo + (h % (hi - lo + 1)), shift: ((h >>> 8) % 7) - 3, seed: 1 + ((h >>> 16) % 97) };
}

/** Volume da trilha: baixo quando há fala (com ducking), cheio no vídeo 100% motion. */
export const trackVolume = (genre: Genre, motion: boolean) => (motion ? 0.9 : genre === "light" ? 0.2 : 0.17);
