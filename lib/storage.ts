import "server-only";
import path from "node:path";
import { db } from "./supabase";

/** "local" = disco (DATA_DIR, app e worker na mesma máquina); "supabase" = Supabase Storage (Vercel/nuvem). */
export const STORAGE_MODE = process.env.STORAGE === "supabase" ? "supabase" : "local";
export const BUCKET = process.env.STORAGE_BUCKET || "media";
const bucket = () => db().storage.from(BUCKET);

export async function signedUploadUrl(key: string) {
  const { data, error } = await bucket().createSignedUploadUrl(key, { upsert: true });
  if (error || !data) throw new Error(error?.message || "falha ao criar URL de upload");
  return data.signedUrl;
}

export async function objectSize(key: string): Promise<number | null> {
  const { data } = await bucket().list(path.posix.dirname(key), { search: path.posix.basename(key), limit: 10 });
  const obj = data?.find((o) => o.name === path.posix.basename(key));
  return obj ? Number(obj.metadata?.size ?? 0) : null;
}

export async function removeObject(key: string) {
  await bucket().remove([key]);
}

export async function signedDownloadUrl(key: string, downloadName?: string, expiresIn = 3600) {
  const { data, error } = await bucket().createSignedUrl(key, expiresIn, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new Error(error?.message || "arquivo indisponível");
  return data.signedUrl;
}
