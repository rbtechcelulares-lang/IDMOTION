import "server-only";
import { db } from "./supabase";

/** Diagnóstico de configuração mostrado no lobby (nunca exibe valores secretos). */
export async function configProblems(): Promise<string[]> {
  const p: string[] = [];
  const env = process.env;
  if (!env.SUPABASE_URL) p.push("Falta a variável SUPABASE_URL.");
  else if (!/^https?:\/\/.+/.test(env.SUPABASE_URL.trim())) p.push("SUPABASE_URL inválida: deve começar com https:// (ex.: https://abcd.supabase.co).");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) p.push("Falta a variável SUPABASE_SERVICE_ROLE_KEY (chave secret sb_secret_…).");
  if (!env.SESSION_SECRET) p.push("Falta a variável SESSION_SECRET.");
  else if (env.SESSION_SECRET.trim().length < 32) p.push("SESSION_SECRET muito curta (mínimo 32 caracteres).");
  if (env.STORAGE === "s3") {
    for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) if (!env[k]) p.push(`STORAGE=s3, mas falta a variável ${k}.`);
  }
  if (p.length) return p;
  try {
    const { error } = await db().from("app_auth").select("id").limit(1);
    if (error) {
      const msg = `${error.code ?? ""} ${error.message ?? ""}`;
      if (/PGRST205|42P01|does not exist|schema cache/i.test(msg)) p.push("As tabelas não existem no Supabase: rode o arquivo supabase/setup_nuvem.sql no SQL Editor.");
      else if (/PGRST125|Invalid path/i.test(msg)) p.push("SUPABASE_URL deve ser só a base do projeto, ex.: https://abcd.supabase.co (sem /rest/v1).");
      else if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(msg)) p.push("Não consegui conectar ao Supabase: confira SUPABASE_URL (ex.: https://abcd.supabase.co).");
      else if (/JWT|apikey|key|401|403|PGRST301/i.test(msg)) p.push("Chave do Supabase recusada: confira SUPABASE_SERVICE_ROLE_KEY (use a chave secret, não a publishable/anon).");
      else p.push(`Supabase respondeu com erro: ${msg.trim().slice(0, 160)}`);
    }
  } catch (e) {
    p.push(`Não consegui conectar ao Supabase (confira SUPABASE_URL): ${(e as Error).message.slice(0, 120)}`);
  }
  return p;
}
