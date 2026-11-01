import { headers } from "next/headers";
import Link from "next/link";
import { Header } from "@/components/Header";
import { db } from "@/lib/supabase";
import { STORAGE_MODE } from "@/lib/storage";
import { s3CorsCheck, s3Put, s3Remove, s3Size } from "@/shared/s3";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean | null; detail: string; fix?: string };

async function run(name: string, fn: () => Promise<string>, fix: string): Promise<Check> {
  try {
    return { name, ok: true, detail: await fn() };
  } catch (e) {
    return { name, ok: false, detail: (e as Error).message.slice(0, 220), fix };
  }
}

// Diagnóstico da instalação na nuvem (testes reais, sem mostrar chaves).
export default async function Status() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const checks: Check[] = [];

  checks.push(await run("Banco (Supabase)", async () => {
    const { error } = await db().from("projects").select("id").limit(1);
    if (error) throw new Error(error.message);
    return "conectado";
  }, "Confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (secret) e se o setup_nuvem.sql foi rodado."));

  checks.push({ name: "Armazenamento", ok: STORAGE_MODE !== "local" ? true : null, detail: `STORAGE=${STORAGE_MODE}`, fix: STORAGE_MODE === "local" ? "Na Vercel use STORAGE=s3 (Cloudflare R2)." : undefined });

  if (STORAGE_MODE === "s3") {
    checks.push(await run("R2: gravar, ler e apagar", async () => {
      await s3Put("_idmotion_check.txt", new TextEncoder().encode("ok"), "text/plain");
      if ((await s3Size("_idmotion_check.txt")) !== 2) throw new Error("arquivo não confere");
      await s3Remove(["_idmotion_check.txt"]);
      return "ok";
    }, "Confira S3_ENDPOINT (https://<ID>.r2.cloudflarestorage.com), S3_BUCKET=idmotion e o token (Object Read & Write)."));
    checks.push(await run("R2: CORS para este endereço", async () => {
      const r = await s3CorsCheck(origin);
      if (!r.ok) throw new Error(r.detail);
      return r.detail;
    }, 'No bucket idmotion → Settings → CORS Policy: [{"AllowedOrigins":["*"],"AllowedMethods":["GET","PUT","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]'));
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim() || "rbtechcelulares-lang/IDMOTION";
  checks.push(token ? await run("Motor (token do GitHub)", async () => {
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
    const j = await r.json();
    if (j.permissions && !j.permissions.push) throw new Error("token sem permissão de escrita (Contents: Read and write)");
    return `acesso a ${repo}`;
  }, "Gere um token fine-grained só para IDMOTION com Contents: Read and write e coloque em GITHUB_DISPATCH_TOKEN.")
    : { name: "Motor (token do GitHub)", ok: STORAGE_MODE === "local" ? null : false, detail: "GITHUB_DISPATCH_TOKEN não configurado", fix: "Adicione GITHUB_DISPATCH_TOKEN na Vercel e faça Redeploy (ou use um worker contínuo)." });

  const { data: lastJob } = await db().from("jobs").select("type,status,stage,created_at,started_at").order("created_at", { ascending: false }).limit(1).maybeSingle();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="label">Diagnóstico</p>
        <h1 className="mb-6 text-3xl font-bold">Status da instalação</h1>
        <ul className="space-y-3">
          {checks.map((c) => (
            <li key={c.name} className={`rounded-xl border p-4 ${c.ok === false ? "border-red-400/50" : "border-line"}`}>
              <div className="flex items-center justify-between gap-3"><span className="font-semibold">{c.name}</span><span className={c.ok ? "text-volt" : c.ok === false ? "text-red-400" : "text-smoke"}>{c.ok ? "✓ ok" : c.ok === false ? "✗ falhou" : "—"}</span></div>
              <p className="mt-1 break-words text-sm text-smoke">{c.detail}</p>
              {c.ok === false && c.fix && <p className="mt-2 break-words text-sm">→ {c.fix}</p>}
            </li>
          ))}
          <li className="rounded-xl border border-line p-4 text-sm">
            <span className="font-semibold">Último job:</span>{" "}
            <span className="text-smoke">{lastJob ? `${lastJob.type} · ${lastJob.status} · ${lastJob.stage || "—"} · ${lastJob.started_at ? "o motor pegou" : "o motor ainda não pegou"}` : "nenhum"}</span>
          </li>
        </ul>
        <Link href="/" className="btn-ghost mt-6">← Voltar</Link>
      </main>
    </>
  );
}
