import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";
import { activeJob, loadProject, loadVersion, saveVersion } from "@/lib/project";
import { buildNarration } from "@/shared/director/narration";

// Liga/desliga a narração ElevenLabs (nova versão do plano). Body: { enabled: boolean, text?: string, voiceId?: string }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { enabled, text, voiceId } = await req.json().catch(() => ({}));
  if (!isUuid(id) || typeof enabled !== "boolean") return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const p = await loadProject(id);
  if (!p?.current_version) return NextResponse.json({ error: "Projeto ainda não tem plano" }, { status: 409 });
  if (await activeJob(id)) return NextResponse.json({ error: "Aguarde o processamento terminar" }, { status: 409 });
  const cur = await loadVersion(id, p.current_version);
  if (!cur) return NextResponse.json({ error: "plano não encontrado" }, { status: 500 });
  const edl = structuredClone(cur.edl);
  const custom = typeof text === "string" && !!text.trim() && text.trim() !== buildNarration(edl);
  const t = custom ? text.trim().slice(0, 2500) : buildNarration(edl);
  edl.audio.narration = enabled ? { text: t, custom, volume: edl.audio.narration?.volume ?? 1, voiceId: typeof voiceId === "string" && voiceId.trim() ? voiceId.trim().slice(0, 64) : edl.audio.narration?.voiceId } : null;
  const version = await saveVersion(id, edl, p.current_version, "manual", enabled ? "narração ligada" : "narração desligada");
  await db().from("chat_messages").insert({ project_id: id, role: "assistant", content: enabled ? `Narração ElevenLabs ligada (versão ${version}) — ${custom ? `texto livre: "${t.slice(0, 300)}${t.length > 300 ? "…" : ""}"` : "fala o texto de cada cena, sincronizada com a tela."}` : `Narração desligada (versão ${version}).`, edl_version: version });
  return NextResponse.json({ ok: true, version, text: t });
}
