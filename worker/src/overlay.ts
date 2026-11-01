import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
import type { Edl } from "../../shared/edl";
import { FFMPEG } from "./env";
import { run } from "./proc";
import { parseTime } from "./engine";

let bundled: Promise<string> | null = null;
const prebuilt = process.env.REMOTION_BUNDLE;
const getBundle = () =>
  (bundled ??= prebuilt && fs.existsSync(path.join(prebuilt, "index.html")) ? Promise.resolve(prebuilt) : bundle({ entryPoint: path.resolve(__dirname, "../../remotion/index.ts") }).catch((e) => { bundled = null; throw e; }));

export const hasOverlay = (edl: Edl) =>
  !!(edl.overlays.intro || edl.overlays.cta || edl.overlays.price || edl.overlays.texts.length || (edl.captions.enabled && edl.captions.items.length) || edl.preset === "cinematic");

/** Renderiza a camada de motion (ProRes 4444 com alpha). */
export async function renderOverlay(edl: Edl, out: string, onProgress: (p: number) => void, isCancelled: () => boolean) {
  const serveUrl = await getBundle();
  const inputProps = { edl };
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  const composition = await selectComposition({ serveUrl, id: "Overlay", inputProps, browserExecutable });
  const { cancelSignal, cancel } = makeCancelSignal();
  const timer = setInterval(() => isCancelled() && cancel(), 500);
  try {
    await renderMedia({
      serveUrl, composition, inputProps, browserExecutable, cancelSignal,
      codec: "prores", proResProfile: "4444", imageFormat: "png", pixelFormat: "yuva444p10le", muted: true,
      outputLocation: out,
      // ex.: "100%" usa todos os núcleos (padrão do Remotion é metade)
      concurrency: process.env.REMOTION_CONCURRENCY ? (/%$/.test(process.env.REMOTION_CONCURRENCY) ? process.env.REMOTION_CONCURRENCY : Number(process.env.REMOTION_CONCURRENCY)) : null,
      onProgress: ({ progress }) => onProgress(progress),
      chromiumOptions: { gl: "swangle" },
    });
  } finally {
    clearInterval(timer);
  }
}

/** Sobrepõe a camada de motion ao vídeo-base; áudio copiado do base. */
export async function composite(base: string, overlay: string, out: string, duration: number, onProgress: (p: number) => void) {
  await run(FFMPEG, [
    "-y", "-hide_banner", "-loglevel", "error", "-stats", "-stats_period", "0.5",
    "-i", base, "-i", overlay,
    "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto:shortest=1,format=yuv420p[v]",
    "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-preset", process.env.FFMPEG_PRESET || "veryfast", "-crf", process.env.FFMPEG_CRF_FINAL || "20",
    "-r", "30", "-c:a", "copy", "-movflags", "+faststart", out,
  ], { onLine: (l) => { const t = parseTime(l); if (t !== null) onProgress(Math.min(1, t / duration)); } });
}
