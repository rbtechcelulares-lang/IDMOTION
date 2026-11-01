import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Cancelled, db, projectDir } from "./env";
import { killAll } from "./proc";
import { jobCtx, type Job } from "./jobs";
import { runAnalyze } from "./analyze";
import { runRender } from "./render";

const WORKER_ID = `${os.hostname()}-${process.pid}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2000);
let stopping = false;

async function finish(job: Job, patch: Record<string, unknown>, projectPatch?: Record<string, unknown>) {
  await db.from("jobs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", job.id);
  if (projectPatch) await db.from("projects").update({ ...projectPatch, updated_at: new Date().toISOString() }).eq("id", job.project_id);
}

const cleanup = (job: Job) =>
  job.type === "render" ? fs.promises.rm(path.join(projectDir(job.project_id), "renders", job.id), { recursive: true, force: true }) : Promise.resolve();

async function handle(job: Job) {
  const ctx = jobCtx(job);
  console.log(`[worker] ${job.type} ${job.id} (tentativa ${job.attempts}/${job.max_attempts})`);
  try {
    const result = job.type === "analyze" ? await runAnalyze(job, ctx) : await runRender(job, ctx);
    await finish(job, { status: "done", progress: 1, stage: "Concluído", ...(result && "job" in result ? result.job : {}) });
    console.log(`[worker] ${job.id} ok`);
  } catch (e) {
    killAll();
    if (e instanceof Cancelled) {
      await cleanup(job);
      await finish(job, { status: "cancelled", stage: "Cancelado" }, { status: job.type === "analyze" ? "error" : "ready", error: job.type === "analyze" ? "Análise cancelada" : null });
      console.log(`[worker] ${job.id} cancelado`);
      return;
    }
    const msg = (e as Error).message.slice(0, 1000);
    const fatal = (e as { fatal?: boolean }).fatal;
    console.error(`[worker] ${job.id} falhou:`, msg);
    if (!fatal && job.attempts < job.max_attempts) {
      // retry automático (máx. 2 = max_attempts 3)
      await db.from("jobs").update({ status: "queued", stage: `Nova tentativa (${job.attempts}/${job.max_attempts - 1})`, error: msg, progress: 0 }).eq("id", job.id);
    } else {
      await cleanup(job);
      await finish(job, { status: "error", error: msg }, { status: job.type === "analyze" ? "error" : "ready", error: msg });
    }
  }
}

async function loop() {
  console.log(`[worker] ${WORKER_ID} pronto (poll ${POLL_MS}ms)`);
  // jobs "running" órfãos (worker caiu) voltam para a fila
  await db.from("jobs").update({ status: "queued" }).eq("status", "running");
  while (!stopping) {
    const { data, error } = await db.rpc("claim_job", { p_worker: WORKER_ID });
    if (error) console.error("[worker] claim:", error.message);
    const job = (data as Job[] | null)?.[0];
    if (job) await handle(job);
    else await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stopping = true; killAll(); setTimeout(() => process.exit(0), 500); });
loop().catch((e) => { console.error(e); process.exit(1); });
