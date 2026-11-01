import { NextResponse } from "next/server";
import fs from "node:fs";
import { abs, isUuid } from "@/lib/files";
import { loadProject } from "@/lib/project";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const p = await loadProject(id);
  const f = p?.analysis?.frames?.[Number(n)];
  if (!f) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const buf = await fs.promises.readFile(abs(f.path)).catch(() => null);
  if (!buf) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
}
