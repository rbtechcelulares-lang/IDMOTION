import type { Edl, Word } from "../edl";
import type { Format, Style } from "../constants";

export type Analysis = {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  scenes: number[]; // instantes de corte de cena (s)
  silences: { start: number; end: number }[];
  speech: { start: number; end: number }[];
  words: Word[] | null; // transcrição com tempos (null = sem transcrição)
  transcript: string;
  transcriptProvider: string;
  transcriptError?: string | null;
  frames: { t: number; path: string }[]; // relativos a DATA_DIR
  loudnessLufs: number | null;
};

export type Brief = {
  name: string;
  format: Format;
  style: Style;
  objective: string;
  instructions: string;
  hasMusic: boolean;
  hasVideo: boolean; // false = vídeo 100% motion
};

export type EditResult = { edl: Edl; reply: string };

/** Interface trocável do diretor de IA. */
export interface Director {
  readonly name: string;
  plan(a: Analysis, b: Brief, frames?: { t: number; jpegBase64: string }[]): Promise<Edl>;
  edit(edl: Edl, instruction: string, a: Analysis, b: Brief): Promise<EditResult | null>;
}
