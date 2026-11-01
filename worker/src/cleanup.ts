import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, db, projectDir } from "./env";
import { removeRemote } from "./storage";

const DAYS = Number(process.env.RETENTION_DAYS ?? 2);

/** Apaga os arquivos (fonte, trilha, frames, renders, narração) de projetos sem atividade há RETENTION_DAYS. */
export async function cleanupOldFiles() {
  if (!(DAYS > 0)) return;
  const cutoff = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const { data: projects } = await db.from("projects").select("id,source_path,music_path,analysis,status").is("files_deleted_at", null).lt("updated_at", cutoff).limit(50);
  for (const p of projects ?? []) {
    if (p.status === "analyzing" || p.status === "rendering") continue;
    const { data: jobs } = await db.from("jobs").select("output_path").eq("project_id", p.id).not("output_path", "is", null);
    const keys = [p.source_path, p.music_path, ...((p.analysis?.frames ?? []) as { path: string }[]).map((f) => f.path), ...(jobs ?? []).map((j) => j.output_path)].filter(Boolean) as string[];
    try { await removeRemote(keys); } catch (e) { console.error(`[cleanup] ${p.id}:`, (e as Error).message); continue; }
    await fs.promises.rm(projectDir(p.id), { recursive: true, force: true });
    await db.from("jobs").update({ output_path: null }).eq("project_id", p.id);
    await db.from("projects").update({ files_deleted_at: new Date().toISOString(), status: "expired" }).eq("id", p.id);
    console.log(`[cleanup] arquivos do projeto ${p.id} apagados (${keys.length})`);
  }
  // cache de narração antigo
  const { data: tts } = await db.from("tts_cache").select("hash,path").lt("created_at", cutoff).limit(200);
  if (tts?.length) {
    await removeRemote(tts.map((t) => t.path)).catch((e) => console.error("[cleanup] tts:", e.message));
    await Promise.all(tts.map((t) => fs.promises.rm(path.join(DATA_DIR, t.path), { force: true })));
    await db.from("tts_cache").delete().in("hash", tts.map((t) => t.hash));
  }
}
