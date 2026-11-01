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
