import { type Edl, mapWordsToTimeline, normalizeEdl, wordsToCaptions } from "../edl";
import type { Analysis } from "./types";

export const CAPTION_WORDS = { viral: 3, premium: 5, cinematic: 6 } as const;

/** Valida (zod), limita à fonte e regenera as legendas a partir da transcrição. */
export function finalizeEdl(raw: unknown, a: Analysis): Edl {
  const edl = normalizeEdl(raw, a.duration);
  if (edl.mode === "video" && a.words?.length) {
    edl.captions.items = wordsToCaptions(mapWordsToTimeline(a.words, edl.clips), CAPTION_WORDS[edl.preset]);
  }
  return normalizeEdl(edl, a.duration);
}
