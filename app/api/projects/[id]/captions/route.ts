import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";
import { activeJob, loadProject, loadVersion, saveVersion } from "@/lib/project";

const LABEL = { auto: "automática (o diretor escolhe por trecho)", top: "em cima", bottom: "embaixo" } as const;

// Posição da legenda escolhida pelo usuário (nova versão do plano). Body: { place: "auto" | "top" | "bottom" }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { place } = await req.json().catch(() => ({}));
  if (!isUuid(id) || !(place in LABEL)) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const p = await loadProject(id);
  if (!p?.current_version) return NextResponse.json({ error: "Projeto ainda não tem plano" }, { status: 409 });
  if (await activeJob(id)) return NextResponse.json({ error: "Aguarde o processamento terminar" }, { status: 409 });
  const cur = await loadVersion(id, p.current_version);
  if (!cur) return NextResponse.json({ error: "plano não encontrado" }, { status: 500 });
  const edl = structuredClone(cur.edl);
  if (edl.captions.place === place) return NextResponse.json({ ok: true, version: p.current_version });
  edl.captions.place = place as keyof typeof LABEL;
  const version = await saveVersion(id, edl, p.current_version, "manual", `legenda ${LABEL[place as keyof typeof LABEL]}`);
  await db().from("chat_messages").insert({ project_id: id, role: "assistant", content: `Legenda ${LABEL[place as keyof typeof LABEL]} (versão ${version}). Exporte para ver.`, edl_version: version });
  return NextResponse.json({ ok: true, version });
}
