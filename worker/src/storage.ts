import fs from "node:fs";
import path from "node:path";
import { abs, db, rel } from "./env";
import { s3Get, s3Put, s3Remove } from "../../shared/s3";

/** Mesmo esquema do app: "local" usa DATA_DIR direto; "supabase"/"s3" baixam/sobem do bucket e usam DATA_DIR como cache. */
export const STORAGE_MODE: "local" | "supabase" | "s3" =
  process.env.STORAGE === "supabase" ? "supabase" : process.env.STORAGE === "s3" ? "s3" : "local";
const bucket = () => db.storage.from(process.env.STORAGE_BUCKET || "media");

/** Garante o arquivo no disco local e devolve o caminho. */
export async function ensureLocal(key: string): Promise<string> {
  const file = abs(key);
  if (fs.existsSync(file) || STORAGE_MODE === "local") return file;
  let buf: ArrayBuffer;
  if (STORAGE_MODE === "s3") buf = await s3Get(key);
  else {
    const { data, error } = await bucket().download(key);
    if (error || !data) throw new Error(`download de ${key} falhou: ${error?.message}`);
    buf = await data.arrayBuffer();
  }
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, Buffer.from(buf));
  return file;
}

/** Publica um arquivo gerado (no modo local já está no lugar). Retorna a chave. */
export async function store(file: string, contentType: string): Promise<string> {
  const key = rel(file).split(path.sep).join("/");
  if (STORAGE_MODE === "local") return key;
  const body = await fs.promises.readFile(file);
  if (STORAGE_MODE === "s3") { await s3Put(key, body, contentType); return key; }
  const { error } = await bucket().upload(key, body, { upsert: true, contentType });
  if (error) throw new Error(`upload de ${key} falhou: ${error.message}`);
  return key;
}

export async function removeRemote(keys: string[]) {
  if (!keys.length || STORAGE_MODE === "local") return;
  if (STORAGE_MODE === "s3") return s3Remove(keys);
  const { error } = await bucket().remove(keys);
  if (error) throw new Error(error.message);
}
