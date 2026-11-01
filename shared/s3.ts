import { AwsClient } from "aws4fetch";

/** Storage S3-compatível (Cloudflare R2, Backblaze B2, MinIO) — usado com STORAGE=s3. */
let client: AwsClient | null = null;
function cfg() {
  const bucket = process.env.S3_BUCKET?.trim();
  // aceita o endpoint colado com o nome do bucket no final (como o painel do R2 mostra)
  let endpoint = process.env.S3_ENDPOINT?.trim().replace(/\/+$/, "");
  if (endpoint && bucket && endpoint.endsWith(`/${bucket}`)) endpoint = endpoint.slice(0, -bucket.length - 1);
  if (endpoint && /r2\.cloudflarestorage\.com/.test(endpoint)) endpoint = new URL(endpoint).origin;
  if (!endpoint || !bucket || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) throw new Error("S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY não configurados");
  client ??= new AwsClient({ accessKeyId: process.env.S3_ACCESS_KEY_ID.trim(), secretAccessKey: process.env.S3_SECRET_ACCESS_KEY.trim(), service: "s3", region: process.env.S3_REGION || "auto" });
  return { endpoint, bucket, client };
}
const objectUrl = (key: string) => {
  const { endpoint, bucket } = cfg();
  return `${endpoint}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
};

/** URL pré-assinada (o navegador usa direto, sem passar pelo servidor). */
export async function s3Presign(method: "GET" | "PUT", key: string, expiresIn = 3600, downloadName?: string) {
  const u = new URL(objectUrl(key));
  u.searchParams.set("X-Amz-Expires", String(expiresIn));
  if (downloadName) u.searchParams.set("response-content-disposition", `attachment; filename="${downloadName.replace(/"/g, "")}"`);
  const signed = await cfg().client.sign(u.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

export async function s3Size(key: string): Promise<number | null> {
  const r = await cfg().client.fetch(objectUrl(key), { method: "HEAD" });
  return r.ok ? Number(r.headers.get("content-length") || 0) : null;
}

export async function s3Remove(keys: string[]) {
  for (const k of keys) {
    const r = await cfg().client.fetch(objectUrl(k), { method: "DELETE" });
    if (!r.ok && r.status !== 404) throw new Error(`S3 DELETE ${k}: ${r.status}`);
  }
}

export async function s3Get(key: string): Promise<ArrayBuffer> {
  const r = await cfg().client.fetch(objectUrl(key));
  if (!r.ok) throw new Error(`S3 GET ${key}: ${r.status}`);
  return r.arrayBuffer();
}

export async function s3Put(key: string, body: Uint8Array, contentType: string) {
  const r = await cfg().client.fetch(objectUrl(key), { method: "PUT", body: body as unknown as BodyInit, headers: { "content-type": contentType } });
  if (!r.ok) throw new Error(`S3 PUT ${key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** Simula o preflight CORS do navegador para um PUT pré-assinado. */
export async function s3CorsCheck(origin: string): Promise<{ ok: boolean; detail: string }> {
  const url = await s3Presign("PUT", "_idmotion_cors_check.txt", 300);
  const r = await fetch(url, { method: "OPTIONS", headers: { origin, "access-control-request-method": "PUT", "access-control-request-headers": "content-type" } });
  const allow = r.headers.get("access-control-allow-origin");
  return allow === "*" || allow === origin ? { ok: true, detail: `liberado para ${allow}` } : { ok: false, detail: `HTTP ${r.status}, sem permissão CORS para ${origin}` };
}
