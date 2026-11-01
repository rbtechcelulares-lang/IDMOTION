import "server-only";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const projectDir = (id: string) => path.join(DATA_DIR, "projects", id);
/** Caminhos no banco são relativos a DATA_DIR (app e worker montam o mesmo diretório). */
export const abs = (rel: string) => {
  const p = path.resolve(DATA_DIR, rel);
  if (!p.startsWith(DATA_DIR + path.sep)) throw new Error("caminho inválido");
  return p;
};
export const rel = (p: string) => path.relative(DATA_DIR, p);

const run = promisify(execFile);

/** Duração via ffprobe, ou null se ffprobe não existir nesta máquina (o worker valida de novo). */
export async function probeDuration(file: string): Promise<number | null> {
  try {
    const { stdout } = await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) ? d : NaN;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    return NaN; // arquivo ilegível
  }
}

export const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
