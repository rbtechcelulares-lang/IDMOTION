import "server-only";

/**
 * Acorda o worker no GitHub Actions (repository_dispatch). Sem GITHUB_DISPATCH_TOKEN não faz nada
 * (worker contínuo no PC/Docker/Railway). Falha aqui não impede o job: a checagem periódica pega depois.
 */
export async function wakeWorker() {
  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim() || "rbtechcelulares-lang/IDMOTION";
  if (!token) return { skipped: true };
  try {
    const r = await fetch(`${process.env.GITHUB_API_URL || "https://api.github.com"}/repos/${repo}/dispatches`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
      body: JSON.stringify({ event_type: "idmotion-worker" }),
    });
    if (!r.ok) console.error("[dispatch] GitHub respondeu", r.status, (await r.text()).slice(0, 200));
    return { ok: r.ok, status: r.status };
  } catch (e) {
    console.error("[dispatch]", (e as Error).message);
    return { ok: false };
  }
}

/** Acorda o motor e, se falhar, registra o motivo no job (aparece na barra de progresso). */
export async function wakeWorkerFor(jobId: string) {
  const r = await wakeWorker();
  let msg: string | null = null;
  if ("skipped" in r && r.skipped) {
    if (process.env.STORAGE === "s3" || process.env.STORAGE === "supabase") msg = "Motor não acionado: falta GITHUB_DISPATCH_TOKEN na Vercel (ou rode o workflow 'worker' no GitHub → Actions).";
  } else if (!r.ok) {
    const s = "status" in r ? r.status : undefined;
    msg = s === 401 ? "Motor não acionado: token do GitHub inválido ou expirado (GITHUB_DISPATCH_TOKEN)."
      : s === 403 || s === 404 ? "Motor não acionado: o token do GitHub precisa de acesso ao repositório IDMOTION com Contents: Read and write."
      : `Motor não acionado: GitHub respondeu ${s ?? "sem conexão"}.`;
  }
  if (msg) {
    const { db } = await import("./supabase");
    await db().from("jobs").update({ stage: msg }).eq("id", jobId).eq("status", "queued");
  }
  return r;
}
