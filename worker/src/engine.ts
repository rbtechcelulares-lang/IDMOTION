import { FORMAT_SIZE } from "../../shared/constants";
import { type Edl, clipDuration, edlDuration } from "../../shared/edl";
import { FFMPEG } from "./env";
import { run } from "./proc";

const even = (n: number) => Math.ceil(n / 2) * 2;
const f3 = (n: number) => n.toFixed(3);

export type BaseInputs = { source: string; hasAudio: boolean; music?: string | null; narration?: string | null };

/**
 * Monta o vídeo-base a partir do EDL: cortes (seek por clipe), velocidade, punch-in,
 * resize/crop para o formato, junção, mixagem (fala + trilha com ducking + narração) e loudnorm.
 */
export function buildBaseArgs(edl: Edl, inp: BaseInputs, out: string): { args: string[]; duration: number } {
  const { width: W, height: H } = FORMAT_SIZE[edl.format];
  const total = edlDuration(edl);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-stats", "-stats_period", "0.5"];
  const f: string[] = [];
  const pairs: string[] = [];

  edl.clips.forEach((c, i) => {
    args.push("-ss", f3(c.in), "-t", f3(c.out - c.in), "-i", inp.source);
    const sp = c.speed || 1;
    const z = c.zoom || 1;
    f.push(`[${i}:v]setpts=(PTS-STARTPTS)/${sp},fps=${edl.fps},scale=${even(W * z)}:${even(H * z)}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[v${i}]`);
    const d = clipDuration(c);
    if (inp.hasAudio) f.push(`[${i}:a]asetpts=PTS-STARTPTS,atempo=${sp},aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${f3(d)}[a${i}]`);
    else f.push(`anullsrc=r=48000:cl=stereo,atrim=0:${f3(d)}[a${i}]`);
    pairs.push(`[v${i}][a${i}]`);
  });
  const n = edl.clips.length;
  f.push(`${pairs.join("")}concat=n=${n}:v=1:a=1[vout][acat]`);

  const mix: string[] = [];
  let idx = n;
  const srcVol = edl.audio.narration && inp.narration ? edl.audio.sourceVolume * 0.35 : edl.audio.sourceVolume;
  f.push(`[acat]volume=${srcVol.toFixed(3)}[src]`);
  const useMusic = !!(edl.audio.music && inp.music);
  if (useMusic) f.push(`[src]asplit=2[src1][srcsc]`);
  mix.push(useMusic ? "[src1]" : "[src]");

  if (useMusic) {
    args.push("-stream_loop", "-1", "-i", inp.music!);
    const fade = Math.min(1.5, total / 4);
    f.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${f3(total)},volume=${edl.audio.music!.volume.toFixed(3)},afade=t=in:d=0.5,afade=t=out:st=${f3(total - fade)}:d=${f3(fade)}[mus]`);
    f.push(`[mus][srcsc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[musd]`);
    mix.push("[musd]");
    idx++;
  }
  if (edl.audio.narration && inp.narration) {
    args.push("-i", inp.narration);
    const delay = Math.round((edl.overlays.intro?.duration ?? 0) * 300);
    f.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${delay}|${delay},volume=${edl.audio.narration.volume.toFixed(3)},atrim=0:${f3(total)}[nar]`);
    mix.push("[nar]");
    idx++;
  }
  const mixed = mix.length > 1 ? `${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=first` : `${mix[0]}anull`;
  const norm = edl.audio.normalize ? ",loudnorm=I=-14:TP=-1.5:LRA=11" : "";
  f.push(`${mixed}${norm},aresample=48000,apad,atrim=0:${f3(total)}[aout]`);

  args.push(
    "-filter_complex", f.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", process.env.FFMPEG_PRESET || "veryfast", "-crf", process.env.FFMPEG_CRF || "18", "-pix_fmt", "yuv420p", "-r", String(edl.fps),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-t", f3(total), "-movflags", "+faststart", out,
  );
  return { args, duration: total };
}

export const parseTime = (line: string) => {
  const m = line.match(/time=(\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

export async function buildBase(edl: Edl, inp: BaseInputs, out: string, onProgress: (p: number) => void) {
  const { args, duration } = buildBaseArgs(edl, inp, out);
  await run(FFMPEG, args, { onLine: (l) => { const t = parseTime(l); if (t !== null) onProgress(Math.min(1, t / duration)); } });
  return duration;
}
