import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db } from "@/lib/supabase";
import { isAuthed } from "@/lib/auth";
import { isUuid, probeDuration, projectDir, rel } from "@/lib/files";
import { AUDIO_EXT, AUDIO_MIME, VIDEO_EXT, VIDEO_MIME, limits } from "@/shared/constants";

export const runtime = "nodejs";

// PUT /api/projects/:id/upload?kind=source|music  (corpo = arquivo bruto, header x-filename)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind") === "music" ? "music" : "source";
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const { data: project } = await db().from("projects").select("id,status").eq("id", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "projeto não encontrado" }, { status: 404 });

  const name = decodeURIComponent(req.headers.get("x-filename") || "");
  const ext = path.extname(name).toLowerCase();
  const mime = (req.headers.get("content-type") || "").split(";")[0];
  const [exts, mimes] = kind === "source" ? [VIDEO_EXT, VIDEO_MIME] : [AUDIO_EXT, AUDIO_MIME];
  if (!exts.includes(ext) || (mime && mime !== "application/octet-stream" && !mimes.includes(mime))) {
    return NextResponse.json({ error: `Tipo não suportado. Use: ${exts.join(", ")}` }, { status: 415 });
  }
  const { maxUploadMb, maxDurationS, minDurationS } = limits();
  const max = maxUploadMb * 1024 * 1024;
  if (Number(req.headers.get("content-length") || 0) > max) return NextResponse.json({ error: `Arquivo acima de ${maxUploadMb} MB` }, { status: 413 });
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
