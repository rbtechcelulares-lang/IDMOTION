import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";
import { loadProject, loadVersion } from "@/lib/project";

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
    versions: versions.data ?? [],
    messages: messages.data ?? [],
    jobs: jobs.data ?? [],
  });
}
