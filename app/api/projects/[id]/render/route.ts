import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";
import { activeJob, loadProject } from "@/lib/project";

// Exporta a versão atual do EDL (job executado pelo worker; retry automático até 2x).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const p = await loadProject(id);
  if (!p?.current_version) return NextResponse.json({ error: "Projeto ainda não tem EDL" }, { status: 409 });
  if (p.files_deleted_at) return NextResponse.json({ error: "Os vídeos deste projeto foram apagados (2 dias). Crie um novo projeto." }, { status: 410 });
  if (await activeJob(id)) return NextResponse.json({ error: "Já existe um processamento em andamento" }, { status: 409 });
  const { data, error } = await db().from("jobs").insert({ project_id: id, type: "render", edl_version: p.current_version }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db().from("projects").update({ status: "rendering", error: null, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ jobId: data.id });
}
