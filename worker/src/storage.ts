import fs from "node:fs";
import path from "node:path";
import { abs, db, rel } from "./env";

/** Mesmo esquema do app: "local" usa DATA_DIR direto; "supabase" baixa/sobe do bucket e usa DATA_DIR como cache. */
export const STORAGE_MODE = process.env.STORAGE === "supabase" ? "supabase" : "local";
const bucket = () => db.storage.from(process.env.STORAGE_BUCKET || "media");

/** Garante o arquivo no disco local e devolve o caminho. */
export async function ensureLocal(key: string): Promise<string> {
  const file = abs(key);
  if (fs.existsSync(file) || STORAGE_MODE === "local") return file;
  const { data, error } = await bucket().download(key);
  if (error || !data) throw new Error(`download de ${key} falhou: ${error?.message}`);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, Buffer.from(await data.arrayBuffer()));
  return file;
}

/** Publica um arquivo gerado (no modo local já está no lugar). Retorna a chave. */
export async function store(file: string, contentType: string): Promise<string> {
  const key = rel(file).split(path.sep).join("/");
  if (STORAGE_MODE === "local") return key;
  const { error } = await bucket().upload(key, await fs.promises.readFile(file), { upsert: true, contentType });
  if (error) throw new Error(`upload de ${key} falhou: ${error.message}`);
  return key;
}
