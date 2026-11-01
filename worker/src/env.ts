import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const abs = (rel: string) => path.resolve(DATA_DIR, rel);
export const rel = (p: string) => path.relative(DATA_DIR, p);
export const projectDir = (id: string) => path.join(DATA_DIR, "projects", id);
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");
export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export class Cancelled extends Error {
  constructor() { super("cancelado"); }
}
