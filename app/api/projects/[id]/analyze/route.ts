import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";

// Enfileira a análise + direção inicial (executada pelo worker).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const { data: p } = await db().from("projects").select("source_path,status").eq("id", id).maybeSingle();
  if (!p?.source_path) return NextResponse.json({ error: "Envie o vídeo primeiro" }, { status: 409 });
  const { data: active } = await db().from("jobs").select("id").eq("project_id", id).in("status", ["queued", "running"]).limit(1);
  if (active?.length) return NextResponse.json({ error: "Já existe um processamento em andamento" }, { status: 409 });
  const { data, error } = await db().from("jobs").insert({ project_id: id, type: "analyze" }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db().from("projects").update({ status: "analyzing", error: null, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ jobId: data.id });
}
