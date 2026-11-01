import fs from "node:fs";
import path from "node:path";
import { FFMPEG, FFPROBE } from "./env";
import { run } from "./proc";

export type Probe = { duration: number; width: number; height: number; fps: number; hasAudio: boolean; rotation: number };

export async function probe(file: string): Promise<Probe> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  if (!v) throw new Error("arquivo sem trilha de vídeo");
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || "30/1").split("/").map(Number);
  const rotation = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.find((x: { rotation?: number }) => x.rotation !== undefined)?.rotation ?? 0));
  const swap = rotation === 90 || rotation === 270;
  return {
    duration: Number(j.format.duration) || Number(v.duration) || 0,
    width: swap ? v.height : v.width,
    height: swap ? v.width : v.height,
    fps: d ? n / d : 30,
    hasAudio: j.streams.some((s: { codec_type: string }) => s.codec_type === "audio"),
    rotation,
  };
}

export async function detectScenes(file: string, threshold = 0.35): Promise<number[]> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", file, "-an", "-vf", `scale=320:-2,select='gt(scene,${threshold})',showinfo`, "-f", "null", "-"]);
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => +Number(m[1]).toFixed(3));
}

export async function detectSilences(file: string, duration: number): Promise<{ silences: { start: number; end: number }[]; speech: { start: number; end: number }[] }> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", file, "-vn", "-af", "silencedetect=noise=-35dB:d=0.35", "-f", "null", "-"]);
  const silences: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start: (-?[\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = Math.max(0, Number(s[1]));
    if (e && start !== null) { silences.push({ start, end: Number(e[1]) }); start = null; }
  }
  if (start !== null) silences.push({ start, end: duration });
  const speech: { start: number; end: number }[] = [];
  let t = 0;
  for (const s of silences) {
    if (s.start - t > 0.15) speech.push({ start: +t.toFixed(3), end: +s.start.toFixed(3) });
    t = s.end;
  }
  if (duration - t > 0.15) speech.push({ start: +t.toFixed(3), end: +duration.toFixed(3) });
  return { silences, speech };
}

export async function loudness(file: string): Promise<number | null> {
  try {
    const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", file, "-vn", "-af", "ebur128=framelog=quiet", "-f", "null", "-"]);
    const m = [...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

export async function extractFrames(file: string, duration: number, outDir: string, count = 6): Promise<{ t: number; file: string }[]> {
  await fs.promises.mkdir(outDir, { recursive: true });
  const frames: { t: number; file: string }[] = [];
  for (let i = 0; i < count; i++) {
    const t = +((duration * (i + 0.5)) / count).toFixed(2);
    const out = path.join(outDir, `frame_${i}.jpg`);
    await run(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", out]);
    frames.push({ t, file: out });
  }
  return frames;
}

export async function extractAudio(file: string, out: string) {
  await run(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", out]);
  return out;
}
