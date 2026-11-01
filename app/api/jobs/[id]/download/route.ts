import { NextResponse } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { db } from "@/lib/supabase";
import { abs, isUuid } from "@/lib/files";
import { STORAGE_MODE, signedDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";

// Download (e preview com Range) do vídeo exportado.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const { data: job } = await db().from("jobs").select("output_path,status,project_id,projects(name)").eq("id", id).maybeSingle();
  if (!job?.output_path || job.status !== "done") return NextResponse.json({ error: "Arquivo indisponível" }, { status: 404 });
  const name0 = String((job.projects as { name?: string } | null)?.name || "idmotion").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "_") || "idmotion";
  if (STORAGE_MODE !== "local") {
    const inline0 = new URL(req.url).searchParams.has("inline");
    return NextResponse.redirect(await signedDownloadUrl(job.output_path, inline0 ? undefined : `${name0}.mp4`), 302);
  }
  const file = abs(job.output_path);
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat) return NextResponse.json({ error: "Arquivo não encontrado no disco" }, { status: 404 });
  const name = name0;
  const inline = new URL(req.url).searchParams.has("inline");
  const headers: Record<string, string> = {
    "content-type": "video/mp4",
    "accept-ranges": "bytes",
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(name)}.mp4"`,
  };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${stat.size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, {
      status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { ...headers, "content-length": String(stat.size) } });
}
