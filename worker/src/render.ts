import fs from "node:fs";
import path from "node:path";
import { EdlSchema } from "../../shared/edl";
import { Cancelled, db, projectDir } from "./env";
import { buildBase } from "./engine";
import { composite, hasOverlay, renderOverlay } from "./overlay";
import { killAll } from "./proc";
import { runQc } from "./qc";
import { narrationFile } from "./tts";
import { STORAGE_MODE, ensureLocal, store } from "./storage";
import type { Job, JobCtx } from "./jobs";

export async function runRender(job: Job, ctx: JobCtx) {
  const { data: p } = await db.from("projects").select("*").eq("id", job.project_id).single();
  if (!p?.source_path) throw Object.assign(new Error("projeto sem vídeo"), { fatal: true });
  const version = job.edl_version ?? p.current_version;
  const { data: v } = await db.from("edl_versions").select("edl").eq("project_id", p.id).eq("version", version).single();
  if (!v) throw Object.assign(new Error(`EDL v${version} não encontrado`), { fatal: true });
  const edl = EdlSchema.parse(v.edl);
  await db.from("projects").update({ status: "rendering", error: null, updated_at: new Date().toISOString() }).eq("id", p.id);

  const dir = path.join(projectDir(p.id), "renders", job.id);
  await fs.promises.mkdir(dir, { recursive: true });
  const cancel = { v: false };
  const prog = (x: number, stage: string, force = false) =>
    ctx.progress(x, stage, force).catch((e) => { if (e instanceof Cancelled) { cancel.v = true; killAll(); } else throw e; });
  const guard = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try { const r = await fn(); if (cancel.v) throw new Cancelled(); return r; }
    catch (e) { if (cancel.v) throw new Cancelled(); throw e; }
  };

  const notes: string[] = [];
  let narration: string | null = null;
  if (edl.audio.narration) {
    await prog(0.02, "Narração", true);
    const r = await guard(() => narrationFile(edl.audio.narration!.text, edl.audio.narration!.voiceId));
    narration = r.file;
    if (r.note) notes.push(r.note);
  }
  if (edl.audio.music && !p.music_path) notes.push("Trilha ignorada: nenhum arquivo de trilha no projeto.");

  const source = await guard(() => ensureLocal(p.source_path));
  const music = p.music_path ? await guard(() => ensureLocal(p.music_path)) : null;
  const base = path.join(dir, "base.mp4");
  const duration = await guard(() => buildBase(edl, { source, hasAudio: !!p.analysis?.hasAudio, music, narration }, base, (x) => prog(0.05 + x * 0.35, "Cortes, formato e mixagem (FFmpeg)")));

  const final = path.join(dir, "final.mp4");
  if (hasOverlay(edl)) {
    const ov = path.join(dir, "overlay.mov");
    await guard(() => renderOverlay(edl, ov, (x) => prog(0.4 + x * 0.45, "Motion: legendas e textos (Remotion)"), () => cancel.v));
    await guard(() => composite(base, ov, final, duration, (x) => prog(0.85 + x * 0.1, "Composição final")));
    await fs.promises.rm(ov, { force: true });
    await fs.promises.rm(base, { force: true });
  } else {
    await fs.promises.rename(base, final);
  }

  await prog(0.96, "Controle de qualidade", true);
  const qc = await guard(() => runQc(final, edl, notes));
  if (!qc.passed) {
    await db.from("jobs").update({ qc }).eq("id", job.id);
    throw new Error(`QC reprovado: ${qc.checks.filter((c) => !c.ok && c.severity === "error").map((c) => `${c.name} (${c.value})`).join(", ")}`);
  }
  await prog(0.98, "Enviando arquivo final", true);
  const key = await guard(() => store(final, "video/mp4"));
  if (STORAGE_MODE !== "local") await fs.promises.rm(dir, { recursive: true, force: true });
  await db.from("projects").update({ status: "done", error: null, updated_at: new Date().toISOString() }).eq("id", p.id);
  return { job: { output_path: key, qc, edl_version: version } };
}
