import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";
import { activeJob, aiAvailable, loadProject, loadVersion } from "@/lib/project";
import { STORAGE_MODE, removeObject } from "@/lib/storage";
import fs from "node:fs";
import { projectDir } from "@/lib/files";

// Estado completo do projeto para a tela (polling).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const p = await loadProject(id);
  if (!p) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const [versions, messages, jobs, current] = await Promise.all([
    db().from("edl_versions").select("version,parent_version,source,note,created_at").eq("project_id", id).order("version"),
    db().from("chat_messages").select("id,role,content,edl_version,created_at").eq("project_id", id).order("id"),
    db().from("jobs").select("id,type,status,progress,stage,attempts,max_attempts,error,output_path,qc,edl_version,created_at,finished_at,cancel_requested").eq("project_id", id).order("created_at", { ascending: false }).limit(10),
    p.current_version ? loadVersion(id, p.current_version) : null,
  ]);
  const a = p.analysis;
  return NextResponse.json({
    project: { ...p, analysis: a ? { duration: a.duration, width: a.width, height: a.height, hasAudio: a.hasAudio, scenes: a.scenes?.length ?? 0, speech: a.speech?.length ?? 0, words: a.words?.length ?? 0, transcriptProvider: a.transcriptProvider, frames: a.frames?.length ?? 0, loudnessLufs: a.loudnessLufs } : null },
    edl: current?.edl ?? null,
    canUndo: current?.parent_version != null,
    aiAvailable: aiAvailable(),
    versions: versions.data ?? [],
    messages: messages.data ?? [],
    jobs: jobs.data ?? [],
  });
}

// Exclui o projeto e seus arquivos.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const p = await loadProject(id);
  if (!p) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  if (await activeJob(id)) return NextResponse.json({ error: "Aguarde o processamento terminar (ou cancele) antes de excluir" }, { status: 409 });
  const { data: jobs } = await db().from("jobs").select("output_path").eq("project_id", id).not("output_path", "is", null);
  const keys = [p.source_path, p.music_path, ...(p.analysis?.frames ?? []).map((f: { path: string }) => f.path), ...(jobs ?? []).map((j) => j.output_path)].filter(Boolean) as string[];
  if (STORAGE_MODE === "local") await fs.promises.rm(projectDir(id), { recursive: true, force: true });
  else for (const k of keys) await removeObject(k).catch(() => {});
  await db().from("projects").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}

// Troca o cérebro criativo do projeto. Body: { ai: "auto" | "gemini" | "opus" | "haiku" | "rules" }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ai } = await req.json().catch(() => ({}));
  if (!isUuid(id) || !["auto", "gemini", "opus", "haiku", "rules"].includes(ai)) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const { error } = await db().from("projects").update({ ai }).eq("id", id);
  if (error) return NextResponse.json({ error: /\bai\b/.test(error.message) ? "Rode o SQL novo (supabase/setup_nuvem.sql) no Supabase para salvar o cérebro por projeto." : error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
