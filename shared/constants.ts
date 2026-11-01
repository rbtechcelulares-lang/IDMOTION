export const FORMATS = ["9:16", "16:9", "1:1", "4:5"] as const;
export type Format = (typeof FORMATS)[number];
export const FORMAT_SIZE: Record<Format, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export const STYLES = ["cinematic", "viral", "premium"] as const;
export type Style = (typeof STYLES)[number];
export const STYLE_LABEL: Record<Style, string> = {
  cinematic: "Cinematic",
  viral: "Viral Fast Cut",
  premium: "Premium Product",
};

export const OBJECTIVES = ["Venda", "Lançamento", "Institucional", "Tutorial", "Outro"] as const;

export const VIDEO_EXT = [".mp4", ".mov", ".m4v", ".webm"];
export const VIDEO_MIME = ["video/mp4", "video/quicktime", "video/x-m4v", "video/webm"];
export const AUDIO_EXT = [".mp3", ".m4a", ".wav", ".aac"];
export const AUDIO_MIME = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/wave", "audio/aac"];

export const limits = () => ({
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 1024),
  maxDurationS: Number(process.env.MAX_DURATION_S || 600),
  minDurationS: 1,
});
