import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/files";
import { STORAGE_MODE, objectSize, removeObject } from "@/lib/storage";
import { kindOf } from "@/lib/upload";
import { limits } from "@/shared/constants";

// Confirma o upload feito direto no Storage (a duração é validada pelo worker na análise).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { kind: k, key } = await req.json().catch(() => ({}));
  const kind = kindOf(k);
  if (STORAGE_MODE !== "supabase") return NextResponse.json({ error: "modo local usa /upload" }, { status: 400 });
  if (!isUuid(id) || typeof key !== "string" || !new RegExp(`^projects/${id}/${kind}\\.[a-z0-9]+$`).test(key)) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const size = await objectSize(key);
  if (!size) return NextResponse.json({ error: "Arquivo não chegou ao armazenamento" }, { status: 422 });
  const { maxUploadMb } = limits();
  if (size > maxUploadMb * 1024 * 1024) {
    await removeObject(key);
    return NextResponse.json({ error: `Arquivo acima de ${maxUploadMb} MB` }, { status: 413 });
  }
  const patch = kind === "source" ? { source_path: key, status: "uploaded" } : { music_path: key };
  await db().from("projects").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, bytes: size });
}
