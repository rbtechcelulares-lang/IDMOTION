import type { Style } from "../shared/constants";

// Identidade RBTech: amarelo do letreiro + preto, Poppins
export const YELLOW = "#FFD60A";
export const INK = "#0F0F0F";
export const SANS = '"Poppins", "Liberation Sans", "DejaVu Sans", Arial, sans-serif';
export const SERIF = '"DejaVu Serif", "Liberation Serif", Georgia, serif';

export type PresetLook = {
  font: string;
  captionWeight: number;
  captionUpper: boolean;
  captionSize: { sm: number; md: number; lg: number };
  captionBox: boolean;
  highlightWord: boolean;
  letterbox: boolean;
  tracking: number;
};

export const LOOK: Record<Style, PresetLook> = {
  viral: { font: SANS, captionWeight: 900, captionUpper: true, captionSize: { sm: 62, md: 78, lg: 96 }, captionBox: false, highlightWord: true, letterbox: false, tracking: -1 },
  premium: { font: SANS, captionWeight: 600, captionUpper: false, captionSize: { sm: 44, md: 54, lg: 66 }, captionBox: true, highlightWord: false, letterbox: false, tracking: 0 },
  cinematic: { font: SANS, captionWeight: 400, captionUpper: false, captionSize: { sm: 42, md: 52, lg: 62 }, captionBox: false, highlightWord: false, letterbox: true, tracking: 1 },
};
