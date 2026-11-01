import "server-only";
import path from "node:path";
import { AUDIO_EXT, AUDIO_MIME, VIDEO_EXT, VIDEO_MIME, limits } from "@/shared/constants";

export type Kind = "source" | "music";
export const kindOf = (s: unknown): Kind => (s === "music" ? "music" : "source");

/** Valida nome/tipo/tamanho declarados. Retorna erro (string) ou a extensão. */
export function checkUpload(kind: Kind, filename: string, mime: string, size: number): { error: string; status: number } | { ext: string } {
  const ext = path.extname(filename || "").toLowerCase();
  const [exts, mimes] = kind === "source" ? [VIDEO_EXT, VIDEO_MIME] : [AUDIO_EXT, AUDIO_MIME];
  if (!exts.includes(ext) || (mime && mime !== "application/octet-stream" && !mimes.includes(mime))) return { error: `Tipo não suportado. Use: ${exts.join(", ")}`, status: 415 };
  const { maxUploadMb } = limits();
  if (size > maxUploadMb * 1024 * 1024) return { error: `Arquivo acima de ${maxUploadMb} MB`, status: 413 };
  return { ext };
}
