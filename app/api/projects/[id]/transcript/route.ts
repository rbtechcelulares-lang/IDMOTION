import { NextResponse } from "next/server";
import { isUuid } from "@/lib/files";
import { loadProject } from "@/lib/project";
import type { Word } from "@/shared/edl";

const ts = (t: number, sep = ",") => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${sep}${String(ms % 1000).padStart(3, "0")}`;
};

/** Agrupa palavras em frases: quebra em pontuação, pausa > 0,6s ou 12 palavras. */
function lines(words: Word[]) {
  const out: { start: number; end: number; text: string }[] = [];
  let cur: Word[] = [];
  const flush = () => { if (cur.length) out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" ") }); cur = []; };
  words.forEach((w, i) => {
    if (cur.length && w.start - cur[cur.length - 1].end > 0.6) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text) || cur.length >= 12 || i === words.length - 1) flush();
  });
  return out;
}

/** Transcrição do vídeo enviado: frases com tempo, texto corrido e legenda .srt (?format=srt baixa o arquivo). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const p = await loadProject(id);
  if (!p) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const words: Word[] = p.analysis?.words ?? [];
  const ls = lines(words);
  const srt = ls.map((l, i) => `${i + 1}\n${ts(l.start)} --> ${ts(l.end)}\n${l.text}\n`).join("\n");
  if (new URL(req.url).searchParams.get("format") === "srt") {
    const name = String(p.name || "transcricao").replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "transcricao";
    return new Response(srt, { headers: { "content-type": "application/x-subrip; charset=utf-8", "content-disposition": `attachment; filename="${encodeURIComponent(name)}.srt"` } });
  }
  return NextResponse.json({ error: p.analysis?.transcriptError ?? null, provider: p.analysis?.transcriptProvider ?? "nenhum", hasVideo: !!p.source_path, lines: ls, text: ls.map((l) => l.text).join("\n") });
}
