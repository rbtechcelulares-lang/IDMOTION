import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/shared/supabase-url";

let client: SupabaseClient | null = null;

// Cliente com service role: só existe no servidor.
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados");
    client = createClient(normalizeSupabaseUrl(url), key.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
