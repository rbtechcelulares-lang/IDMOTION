import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const { data: job } = await db().from("jobs").select("id,status,type,project_id").eq("id", id).maybeSingle();
  if (!job || !["queued", "running"].includes(job.status)) return NextResponse.json({ error: "Nada para cancelar" }, { status: 409 });
  // Na fila: cancela direto (condicional ao status para não brigar com o worker). Rodando: o worker interrompe.
  const { data: direct } = await db().from("jobs").update({ status: "cancelled", cancel_requested: true, stage: "Cancelado", finished_at: new Date().toISOString() }).eq("id", id).eq("status", "queued").select("id");
  if (direct?.length) {
    await db().from("projects").update({ status: job.type === "render" ? "ready" : "error", error: job.type === "render" ? null : "Análise cancelada" }).eq("id", job.project_id);
  } else {
    await db().from("jobs").update({ cancel_requested: true, stage: "Cancelando…" }).eq("id", id);
  }
  return NextResponse.json({ ok: true });
}
