import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";
import { analysisOf, briefOf, loadProject, loadVersion, saveVersion } from "@/lib/project";
import { COMMAND_HELP, getDirector } from "@/shared/director";

export const maxDuration = 120;

async function say(id: string, role: "user" | "assistant", content: string, edl_version?: number | null) {
  await db().from("chat_messages").insert({ project_id: id, role, content: content.slice(0, 4000), edl_version: edl_version ?? null });
}

// Director Chat: aplica a instrução sobre o EDL atual e cria nova versão.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { message } = await req.json().catch(() => ({}));
  if (!isUuid(id) || typeof message !== "string" || !message.trim() || message.length > 2000) return NextResponse.json({ error: "mensagem inválida" }, { status: 400 });
  const p = await loadProject(id);
  if (!p?.current_version) return NextResponse.json({ error: "Projeto ainda não tem EDL" }, { status: 409 });
  const cur = await loadVersion(id, p.current_version);
  if (!cur) return NextResponse.json({ error: "EDL atual não encontrado" }, { status: 500 });

  await say(id, "user", message.trim());
  if (/^\s*(desfazer|desfaz|undo|voltar)\s*$/i.test(message)) {
    if (cur.parent_version == null) { await say(id, "assistant", "Nada para desfazer."); return NextResponse.json({ ok: true }); }
    await db().from("projects").update({ current_version: cur.parent_version, updated_at: new Date().toISOString() }).eq("id", id);
    await say(id, "assistant", `Desfeito. Voltei para a versão ${cur.parent_version}.`, cur.parent_version);
    return NextResponse.json({ ok: true, version: cur.parent_version });
  }
  try {
    const r = await getDirector().edit(cur.edl, message.trim(), analysisOf(p), briefOf(p));
    if (!r) {
      await say(id, "assistant", `Não entendi. Exemplos:\n• ${COMMAND_HELP.join("\n• ")}${process.env.ANTHROPIC_API_KEY ? "" : "\n(Configure ANTHROPIC_API_KEY para pedidos livres.)"}`);
      return NextResponse.json({ ok: true });
    }
    const version = await saveVersion(id, r.edl, p.current_version, "chat", message.trim());
    await say(id, "assistant", `${r.reply} (versão ${version})`, version);
    return NextResponse.json({ ok: true, version });
  } catch (e) {
    await say(id, "assistant", `Não consegui aplicar: ${(e as Error).message.slice(0, 300)}`);
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
