import { FORMAT_SIZE } from "../../shared/constants";
import { type Edl, edlDuration } from "../../shared/edl";
import { FFMPEG, FFPROBE } from "./env";
import { run } from "./proc";

export type QcCheck = { name: string; ok: boolean; value: string; expected: string; severity: "error" | "warn" };
export type QcReport = { passed: boolean; checks: QcCheck[]; notes: string[] };

/** Controle de qualidade automático do arquivo final (ffprobe + loudness + black frames). */
export async function runQc(file: string, edl: Edl, notes: string[] = []): Promise<QcReport> {
  const checks: QcCheck[] = [];
  const add = (name: string, ok: boolean, value: string, expected: string, severity: "error" | "warn" = "error") => checks.push({ name, ok, value, expected, severity });
  const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  const a = j.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
  const expected = edlDuration(edl);
  const dur = Number(j.format.duration);
  const { width, height } = FORMAT_SIZE[edl.format];

  add("Duração", Math.abs(dur - expected) <= 0.35, `${dur.toFixed(2)}s`, `${expected.toFixed(2)}s ±0.35`);
  add("Resolução", v?.width === width && v?.height === height, v ? `${v.width}x${v.height}` : "sem vídeo", `${width}x${height}`);
  add("Codec de vídeo", v?.codec_name === "h264" && v?.pix_fmt === "yuv420p", `${v?.codec_name}/${v?.pix_fmt}`, "h264/yuv420p");
  const [n, d] = String(v?.avg_frame_rate || "0/1").split("/").map(Number);
  add("FPS", Math.abs(n / d - edl.fps) < 0.5, (n / d).toFixed(2), String(edl.fps));
  add("Trilha de áudio", !!a && a.codec_name === "aac" && Number(a.sample_rate) === 48000 && a.channels === 2, a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : "ausente", "aac 48000Hz 2ch");

  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", file, "-af", "ebur128=framelog=quiet", "-vf", "blackdetect=d=1.5:pix_th=0.08", "-f", "null", "-"]);
  const lufs = Number([...stderr.matchAll(/I:\s+(-?[\d.]+|-inf) LUFS/g)].pop()?.[1] ?? NaN);
  if (edl.audio.normalize) {
    const silent = !Number.isFinite(lufs) || lufs < -60;
    add("Loudness", !silent && lufs >= -17 && lufs <= -11, Number.isFinite(lufs) ? `${lufs.toFixed(1)} LUFS` : "silêncio", "-14 LUFS ±3", silent ? "warn" : "error");
  }
  const blacks = [...stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `${Number(m[1]).toFixed(1)}–${Number(m[2]).toFixed(1)}s`);
  add("Tela preta longa", blacks.length === 0, blacks.join(", ") || "nenhuma", "nenhuma > 1.5s", "warn");

  return { passed: checks.every((c) => c.ok || c.severity === "warn"), checks, notes };
}
