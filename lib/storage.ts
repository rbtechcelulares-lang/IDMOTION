import "server-only";
import path from "node:path";
import { db } from "./supabase";
import { s3Presign, s3Remove, s3Size } from "@/shared/s3";

/**
 * "local" = disco (DATA_DIR, app e worker na mesma máquina)
 * "supabase" = Supabase Storage · "s3" = Cloudflare R2 / S3-compatível (Vercel/nuvem)
 */
export const STORAGE_MODE: "local" | "supabase" | "s3" =
  process.env.STORAGE === "supabase" ? "supabase" : process.env.STORAGE === "s3" ? "s3" : "local";
export const BUCKET = process.env.STORAGE_BUCKET || "media";
const bucket = () => db().storage.from(BUCKET);

export async function signedUploadUrl(key: string) {
  if (STORAGE_MODE === "s3") return s3Presign("PUT", key, 3600);
  const { data, error } = await bucket().createSignedUploadUrl(key, { upsert: true });
  if (error || !data) throw new Error(error?.message || "falha ao criar URL de upload");
  return data.signedUrl;
}

export async function objectSize(key: string): Promise<number | null> {
  if (STORAGE_MODE === "s3") return s3Size(key);
  const { data } = await bucket().list(path.posix.dirname(key), { search: path.posix.basename(key), limit: 10 });
  const obj = data?.find((o) => o.name === path.posix.basename(key));
  return obj ? Number(obj.metadata?.size ?? 0) : null;
}

export async function removeObject(key: string) {
  if (STORAGE_MODE === "s3") return s3Remove([key]);
  await bucket().remove([key]);
}

export async function signedDownloadUrl(key: string, downloadName?: string, expiresIn = 3600) {
  if (STORAGE_MODE === "s3") return s3Presign("GET", key, expiresIn, downloadName);
  const { data, error } = await bucket().createSignedUrl(key, expiresIn, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new Error(error?.message || "arquivo indisponível");
  return data.signedUrl;
}
