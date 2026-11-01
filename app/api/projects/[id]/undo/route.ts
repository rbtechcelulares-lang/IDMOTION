import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";
import { loadProject, loadVersion } from "@/lib/project";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const p = await loadProject(id);
  const cur = p?.current_version ? await loadVersion(id, p.current_version) : null;
  if (!cur || cur.parent_version == null) return NextResponse.json({ error: "Nada para desfazer" }, { status: 409 });
  await db().from("projects").update({ current_version: cur.parent_version, updated_at: new Date().toISOString() }).eq("id", id);
  await db().from("chat_messages").insert({ project_id: id, role: "assistant", content: `Desfeito. Voltei para a versão ${cur.parent_version}.`, edl_version: cur.parent_version });
  return NextResponse.json({ ok: true, version: cur.parent_version });
}
