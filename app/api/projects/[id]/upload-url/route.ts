import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";
import { STORAGE_MODE, signedUploadUrl } from "@/lib/storage";
import { checkUpload, kindOf } from "@/lib/upload";

// Devolve para onde o navegador deve enviar o arquivo (direto ao Supabase Storage na nuvem).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { kind: k, filename, type, size } = await req.json().catch(() => ({}));
  const kind = kindOf(k);
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const { data: p } = await db().from("projects").select("id").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "projeto não encontrado" }, { status: 404 });
  const check = checkUpload(kind, String(filename || ""), String(type || ""), Number(size || 0));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });
  if (STORAGE_MODE === "local") return NextResponse.json({ mode: "local", url: `/api/projects/${id}/upload?kind=${kind}` });
  const key = `projects/${id}/${kind}${check.ext}`;
  return NextResponse.json({ mode: "supabase", url: await signedUploadUrl(key), key });
}
