import fs from "node:fs";
import { FORMAT_SIZE } from "../../shared/constants";
import { type Edl, clipDuration, edlDuration } from "../../shared/edl";
import { FFMPEG } from "./env";
import { run } from "./proc";

const even = (n: number) => Math.ceil(n / 2) * 2;
const f3 = (n: number) => n.toFixed(3);

export type BaseInputs = { source: string; hasAudio: boolean; music?: string | null; narration?: string | null; sfx?: string | null };

/**
 * Monta o vídeo-base a partir do EDL: cortes (seek por clipe), velocidade, punch-in,
 * resize/crop para o formato, junção, mixagem (fala + trilha com ducking + narração) e loudnorm.
 */
export function buildBaseArgs(edl: Edl, inp: BaseInputs, out: string, intermediate = false): { args: string[]; duration: number } {
  const { width: W, height: H } = FORMAT_SIZE[edl.format];
  const total = edlDuration(edl);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-stats", "-stats_period", "0.5"];
  const f: string[] = [];

  // Trechos contínuos (jump zoom: mesmo vídeo, sem pulo no tempo) viram UMA entrada: o áudio corre inteiro, sem emendas
  // (antes cada pedaço era cortado e emendado → estalos a cada zoom); o vídeo é fatiado por quadro exato e cada fatia ganha seu zoom.
  const groups: { in: number; out: number; speed: number; parts: typeof edl.clips }[] = [];
  for (const c of edl.clips) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(c.in - g.out) < 0.02 && (c.speed || 1) === g.speed) { g.out = c.out; g.parts.push(c); }
    else groups.push({ in: c.in, out: c.out, speed: c.speed || 1, parts: [c] });
  }
  const vParts: string[] = [];
  const aParts: string[] = [];
  let k = 0;
  groups.forEach((g, i) => {
    args.push("-ss", f3(g.in), "-t", f3(g.out - g.in), "-i", inp.source);
    const sp = g.speed;
    const gDur = (g.out - g.in) / sp;
    const gFrames = Math.max(1, Math.round(gDur * edl.fps));
    const n = g.parts.length;
    f.push(`[${i}:v]setpts=(PTS-STARTPTS)/${sp},fps=${edl.fps},trim=end_frame=${gFrames},tpad=stop_mode=clone:stop=${gFrames}${n > 1 ? `,split=${n}${g.parts.map((_, j) => `[g${i}s${j}]`).join("")}` : `[g${i}s0]`}`);
    let acc = 0;
    g.parts.forEach((c, j) => {
      const a = Math.round(acc * edl.fps);
      acc += (c.out - c.in) / sp;
      const b = j === n - 1 ? gFrames : Math.round(acc * edl.fps);
      const z = c.zoom || 1;
      f.push(`[g${i}s${j}]trim=start_frame=${a}:end_frame=${Math.max(a + 1, b)},setpts=PTS-STARTPTS,scale=${even(W * z)}:${even(H * z)}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[v${k}]`);
      vParts.push(`[v${k++}]`);
    });
    const d = gFrames / edl.fps;
    if (inp.hasAudio) f.push(`[${i}:a]asetpts=PTS-STARTPTS,atempo=${sp},aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${f3(d)},asetpts=PTS-STARTPTS[a${i}]`);
    else f.push(`anullsrc=r=48000:cl=stereo,atrim=0:${f3(d)}[a${i}]`);
    aParts.push(`[a${i}]`);
  });
  f.push(`${vParts.join("")}concat=n=${vParts.length}:v=1:a=0[vout]`);
  f.push(`${aParts.join("")}concat=n=${aParts.length}:v=0:a=1[acat]`);
  const n = groups.length;
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
  if (inp.sfx && edl.audio.sfx?.enabled) {
    args.push("-i", inp.sfx);
    f.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${(edl.audio.sfx.volume ?? 0.7).toFixed(3)},atrim=0:${f3(total)}[sfx]`);
    mix.push("[sfx]");
    idx++;
  }
  const mixed = mix.length > 1 ? `${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=first` : `${mix[0]}anull`;
  const norm = edl.audio.normalize ? ",loudnorm=I=-14:TP=-1.5:LRA=11" : "";
  f.push(`${mixed}${norm},aresample=48000,apad,atrim=0:${f3(total)}[aout]`);

  args.push(
    "-filter_complex", f.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    // intermediário (vai ser recodificado na composição): ultrafast + qualidade alta
    "-c:v", "libx264", "-preset", intermediate ? "ultrafast" : process.env.FFMPEG_PRESET || "veryfast", "-crf", intermediate ? "14" : process.env.FFMPEG_CRF || "18", "-pix_fmt", "yuv420p", "-r", String(edl.fps),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-t", f3(total), "-movflags", "+faststart", out,
  );
  return { args, duration: total };
}

export const parseTime = (line: string) => {
  const m = line.match(/time=(\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

export async function buildBase(edl: Edl, inp: BaseInputs, out: string, onProgress: (p: number) => void, intermediate = false) {
  const { args, duration } = buildBaseArgs(edl, inp, out, intermediate);
  await run(FFMPEG, args, { onLine: (l) => { const t = parseTime(l); if (t !== null) onProgress(Math.min(1, t / duration)); } });
  if (edl.audio.normalize) await fixLoudness(out);
  return duration;
}

/** 2ª passada só de áudio: o loudnorm de passada única erra em material com muito silêncio. */
async function fixLoudness(file: string, target = -14) {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", file, "-vn", "-af", "ebur128=framelog=quiet", "-f", "null", "-"]);
  const lufs = Number([...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()?.[1] ?? NaN);
  if (!Number.isFinite(lufs) || lufs < -50 || Math.abs(lufs - target) <= 1) return;
  const tmp = file.replace(/\.mp4$/, ".gain.mp4");
  await run(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-c:v", "copy", "-af", `volume=${(target - lufs).toFixed(2)}dB,alimiter=limit=0.89:level=false`, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", tmp]);
  await fs.promises.rename(tmp, file);
}

/** Base do vídeo 100% motion: fundo preto (o Remotion pinta tudo por cima) + trilha/narração mixadas. */
export async function buildMotionBase(edl: Edl, inp: { music?: string | null; narration?: string | null; narrationDelay?: number; sfx?: string | null }, out: string, onProgress: (p: number) => void) {
  const { width: W, height: H } = FORMAT_SIZE[edl.format];
  const total = edlDuration(edl);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-stats", "-stats_period", "0.5", "-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=${edl.fps}:d=${f3(total)}`];
  const f: string[] = [];
  const mix: string[] = [];
  let idx = 1;
  if (edl.audio.music && inp.music) {
    args.push("-stream_loop", "-1", "-i", inp.music);
    const fade = Math.min(1.5, total / 4);
    f.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${f3(total)},volume=${(edl.audio.music.volume * (edl.audio.narration && inp.narration ? 0.35 : 1)).toFixed(3)},afade=t=in:d=0.3,afade=t=out:st=${f3(total - fade)}:d=${f3(fade)}[mus]`);
    mix.push("[mus]");
    idx++;
  }
  if (edl.audio.narration && inp.narration) {
    args.push("-i", inp.narration);
    const nd = Math.round((inp.narrationDelay ?? 0.4) * 1000);
    f.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${nd}|${nd},volume=${edl.audio.narration.volume.toFixed(3)},atrim=0:${f3(total)}[nar]`);
    mix.push("[nar]");
    idx++;
  }
  if (inp.sfx && edl.audio.sfx?.enabled) {
    args.push("-i", inp.sfx);
    f.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${(edl.audio.sfx.volume ?? 0.7).toFixed(3)},atrim=0:${f3(total)}[sfx]`);
    mix.push("[sfx]");
    idx++;
  }
  if (!mix.length) { f.push(`anullsrc=r=48000:cl=stereo,atrim=0:${f3(total)}[sil]`); mix.push("[sil]"); }
  const mixed = mix.length > 1 ? `${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=longest` : `${mix[0]}anull`;
  const norm = edl.audio.normalize && mix[0] !== "[sil]" ? ",loudnorm=I=-14:TP=-1.5:LRA=11" : "";
  f.push(`${mixed}${norm},aresample=48000,apad,atrim=0:${f3(total)}[aout]`);
  args.push("-filter_complex", f.join(";"), "-map", "0:v", "-map", "[aout]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "14", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", f3(total), "-movflags", "+faststart", out);
  await run(FFMPEG, args, { onLine: (l) => { const t = parseTime(l); if (t !== null) onProgress(Math.min(1, t / total)); } });
  if (edl.audio.normalize && mix[0] !== "[sil]") await fixLoudness(out);
  return total;
}
