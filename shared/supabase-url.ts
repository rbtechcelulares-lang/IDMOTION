/** Aceita a URL do Supabase colada com /rest/v1, /storage/v1, barras ou espaços e devolve só a base. */
export const normalizeSupabaseUrl = (u: string) =>
  u.trim().replace(/\/+(rest|storage|auth|realtime|functions)\/v1.*$/i, "").replace(/\/+$/, "");
