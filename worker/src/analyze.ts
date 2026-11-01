import fs from "node:fs";
import path from "node:path";
import { db, projectDir, rel } from "./env";
import { detectScenes, detectSilences, extractAudio, extractFrames, loudness, probe } from "./media";
import { getTranscriber } from "./transcribe";
import { ensureLocal, store } from "./storage";
import { getDirector, type Analysis, type Brief } from "../../shared/director";
import type { Job, JobCtx } from "./jobs";
import { buildNarration } from "../../shared/director/narration";
import type { Edl } from "../../shared/edl";

/** Caixa "Narração ElevenLabs" no Novo Projeto ("narração: auto"): escreve a narração a partir do plano. */
function autoNarration(edl: Edl, instructions: string) {
  if (/narra[çc][aã]o\s*[:=]\s*auto/i.test(instructions || "") && (!edl.audio.narration || edl.audio.narration.text === "auto")) edl.audio.narration = { text: buildNarration(edl), volume: 1, custom: false, tone: "animado", voiceId: instructions.match(/\bvoz\s*:\s*([A-Za-z0-9]{10,40})/)?.[1] };
  return edl;
}

export async function runAnalyze(job: Job, ctx: JobCtx) {
  const { data: p, error } = await db.from("projects").select("*").eq("id", job.project_id).single();
  if (error || !p) throw new Error("projeto não encontrado");
  if (!p.source_path) return planMotion(p, ctx);
  const src = await ensureLocal(p.source_path);
  const dir = projectDir(p.id);
  const maxDur = Number(process.env.MAX_DURATION_S || 600);

  await ctx.progress(0.05, "Lendo metadados", true);
  const meta = await probe(src);
  if (meta.duration < 1 || meta.duration > maxDur) throw Object.assign(new Error(`Duração ${meta.duration.toFixed(1)}s fora do limite (1–${maxDur}s)`), { fatal: true });
  await db.from("projects").update({ source_meta: meta }).eq("id", p.id);

  await ctx.progress(0.15, "Detectando cenas", true);
  const scenes = await detectScenes(src);
  await ctx.progress(0.35, "Detectando fala e pausas", true);
  const { silences, speech } = meta.hasAudio ? await detectSilences(src, meta.duration) : { silences: [], speech: [] };
  const lufs = meta.hasAudio ? await loudness(src) : null;
  await ctx.progress(0.5, "Extraindo frames", true);
  const frames = await extractFrames(src, meta.duration, path.join(dir, "frames"));
  await Promise.all(frames.map((f) => store(f.file, "image/jpeg")));

  let words: Analysis["words"] = null;
  const tr = getTranscriber();
  if (tr && meta.hasAudio) {
    await ctx.progress(0.6, "Transcrevendo", true);
    try {
      words = await tr.transcribe(await extractAudio(src, path.join(dir, "audio16k.mp3")));
    } catch (e) {
      console.warn("[analyze] transcrição falhou, seguindo sem legendas:", (e as Error).message);
    }
  }

  const analysis: Analysis = {
    duration: meta.duration, width: meta.width, height: meta.height, fps: meta.fps, hasAudio: meta.hasAudio,
    scenes, silences, speech, words, transcript: words?.map((w) => w.text).join(" ") ?? "",
    transcriptProvider: words ? tr!.name : "nenhum", frames: frames.map((f) => ({ t: f.t, path: rel(f.file) })), loudnessLufs: lufs,
  };
  await db.from("projects").update({ analysis }).eq("id", p.id);

  const director = getDirector(p.ai);
  await ctx.progress(0.75, `AI Director (${director.name})`, true);
  const brief: Brief = { name: p.name, format: p.format, style: p.style, objective: p.objective, instructions: p.instructions, hasMusic: !!p.music_path, hasVideo: !!p.source_path };
  const jpegs = await Promise.all(frames.map(async (f) => ({ t: f.t, jpegBase64: (await fs.promises.readFile(f.file)).toString("base64") })));
  const edl = autoNarration(await director.plan(analysis, brief, jpegs), p.instructions);
  await ctx.checkCancel();

  const { data: last } = await db.from("edl_versions").select("version").eq("project_id", p.id).order("version", { ascending: false }).limit(1);
  const version = (last?.[0]?.version ?? 0) + 1;
  await db.from("edl_versions").insert({ project_id: p.id, version, parent_version: null, edl, source: "director", note: `Plano inicial (${director.name})` });
  await db.from("chat_messages").insert({ project_id: p.id, role: "assistant", content: `Plano criado por ${director.name}: ${edl.clips.length} cortes, ${edl.overlays.price ? "com preço, " : ""}${edl.captions.items.length} legendas. Peça alterações aqui ou exporte.${/Revisão: /.test(edl.notes) ? `\n${edl.notes.slice(edl.notes.indexOf("Revisão: "))}` : ""}`, edl_version: version });
  await db.from("projects").update({ status: "ready", current_version: version, error: null, updated_at: new Date().toISOString() }).eq("id", p.id);
  return { version };
}

/** Projeto sem vídeo: vídeo 100% motion planejado só a partir do brief. */
async function planMotion(p: Record<string, any>, ctx: JobCtx) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const analysis: Analysis = { duration: 0, width: 0, height: 0, fps: 30, hasAudio: false, scenes: [], silences: [], speech: [], words: null, transcript: "", transcriptProvider: "nenhum", frames: [], loudnessLufs: null };
  await db.from("projects").update({ analysis }).eq("id", p.id);
  const director = getDirector(p.ai);
  await ctx.progress(0.5, `AI Director (${director.name}) — vídeo 100% motion`, true);
  const brief: Brief = { name: p.name, format: p.format, style: p.style, objective: p.objective, instructions: p.instructions, hasMusic: !!p.music_path, hasVideo: false };
  const edl = autoNarration(await director.plan(analysis, brief), p.instructions);
  await ctx.checkCancel();
  const { data: last } = await db.from("edl_versions").select("version").eq("project_id", p.id).order("version", { ascending: false }).limit(1);
  const version = (last?.[0]?.version ?? 0) + 1;
  await db.from("edl_versions").insert({ project_id: p.id, version, parent_version: null, edl, source: "director", note: `Plano motion (${director.name})` });
  await db.from("chat_messages").insert({ project_id: p.id, role: "assistant", content: `Vídeo 100% motion criado por ${director.name}: ${edl.motion?.scenes.length} cenas. Peça alterações (ex.: "remover cena 2", "preço R$ 399,90", "mais rápido") ou exporte.${/Revisão: /.test(edl.notes) ? `\n${edl.notes.slice(edl.notes.indexOf("Revisão: "))}` : ""}`, edl_version: version });
  await db.from("projects").update({ status: "ready", current_version: version, error: null, updated_at: new Date().toISOString() }).eq("id", p.id);
  return { version };
}
