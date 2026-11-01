import "server-only";
import { db } from "./supabase";
import { EdlSchema, type Edl } from "@/shared/edl";
import type { Analysis, Brief } from "@/shared/director";

export async function loadProject(id: string) {
  const { data } = await db().from("projects").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function loadVersion(id: string, version: number): Promise<{ edl: Edl; parent_version: number | null } | null> {
  const { data } = await db().from("edl_versions").select("edl,parent_version").eq("project_id", id).eq("version", version).maybeSingle();
  return data ? { edl: EdlSchema.parse(data.edl), parent_version: data.parent_version } : null;
}

export async function saveVersion(id: string, edl: Edl, parent: number | null, source: string, note: string) {
  const { data: last } = await db().from("edl_versions").select("version").eq("project_id", id).order("version", { ascending: false }).limit(1);
  const version = (last?.[0]?.version ?? 0) + 1;
  const { error } = await db().from("edl_versions").insert({ project_id: id, version, parent_version: parent, edl, source, note: note.slice(0, 300) });
  if (error) throw error;
  await db().from("projects").update({ current_version: version, status: "ready", updated_at: new Date().toISOString() }).eq("id", id);
  return version;
}

export const briefOf = (p: Record<string, unknown>): Brief => ({
  name: p.name as string, format: p.format as Brief["format"], style: p.style as Brief["style"],
  objective: p.objective as string, instructions: p.instructions as string, hasMusic: !!p.music_path, hasVideo: !!p.source_path,
});
export const analysisOf = (p: Record<string, unknown>) => p.analysis as Analysis;

export async function activeJob(id: string) {
  const { data } = await db().from("jobs").select("id,type").eq("project_id", id).in("status", ["queued", "running"]).limit(1);
  return data?.[0] ?? null;
}

/** Quais cérebros estão configurados (sem expor chaves). */
export const aiAvailable = () => ({ gemini: !!(process.env.GEMINI_API_KEY || (process.env.AI_PROVIDER === "gemini" && process.env.AI_API_KEY)), claude: !!process.env.ANTHROPIC_API_KEY });
