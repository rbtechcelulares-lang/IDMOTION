import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db } from "@/lib/supabase";
import { isAuthed } from "@/lib/auth";
import { isUuid, probeDuration, projectDir, rel } from "@/lib/files";
import { limits } from "@/shared/constants";
import { checkUpload } from "@/lib/upload";
import { STORAGE_MODE } from "@/lib/storage";

export const runtime = "nodejs";

// PUT /api/projects/:id/upload?kind=source|music  (corpo = arquivo bruto, header x-filename)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind") === "music" ? "music" : "source";
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const { data: project } = await db().from("projects").select("id,status").eq("id", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "projeto não encontrado" }, { status: 404 });

  if (STORAGE_MODE !== "local") return NextResponse.json({ error: "Use o upload direto (STORAGE=supabase)" }, { status: 400 });
  const name = decodeURIComponent(req.headers.get("x-filename") || "");
  const mime = (req.headers.get("content-type") || "").split(";")[0];
  const check = checkUpload(kind, name, mime, Number(req.headers.get("content-length") || 0));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const ext = check.ext;
  const { maxUploadMb, maxDurationS, minDurationS } = limits();
  const max = maxUploadMb * 1024 * 1024;
  if (!req.body) return NextResponse.json({ error: "corpo vazio" }, { status: 400 });

  const dir = projectDir(id);
  await fs.promises.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${kind}${ext}`);
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _e, cb) {
      bytes += chunk.length;
      cb(bytes > max ? new Error("too_large") : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as import("stream/web").ReadableStream), counter, fs.createWriteStream(dest));
  } catch (e) {
    await fs.promises.rm(dest, { force: true });
    const tooLarge = (e as Error).message === "too_large";
    return NextResponse.json({ error: tooLarge ? `Arquivo acima de ${maxUploadMb} MB` : "Falha no upload" }, { status: tooLarge ? 413 : 500 });
  }
  if (bytes === 0) return NextResponse.json({ error: "arquivo vazio" }, { status: 400 });

  const duration = await probeDuration(dest);
  if (duration !== null && (Number.isNaN(duration) || duration < minDurationS || (kind === "source" && duration > maxDurationS))) {
    await fs.promises.rm(dest, { force: true });
    const msg = Number.isNaN(duration) ? "Arquivo ilegível ou corrompido" : `Duração inválida (${duration.toFixed(1)}s). Permitido: ${minDurationS}s a ${maxDurationS}s`;
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const patch = kind === "source" ? { source_path: rel(dest), status: "uploaded" } : { music_path: rel(dest) };
  await db().from("projects").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, bytes, duration });
}
