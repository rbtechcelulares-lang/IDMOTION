// Cookie de sessão assinado (HMAC-SHA256). Funciona no Edge (middleware) e no Node.
export const SESSION_COOKIE = "idm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias
export const USERNAME = "IDMOTION";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou curto (mín. 32 caracteres)");
  return s;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export async function createSessionToken(): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ u: USERNAME, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE })));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await hmac(payload);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json.u === USERNAME && typeof json.exp === "number" && json.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
