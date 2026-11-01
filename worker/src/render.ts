import type { Job, JobCtx } from "./jobs";
export async function runRender(_job: Job, _ctx: JobCtx): Promise<{ job: Record<string, unknown> }> {
  throw Object.assign(new Error("render ainda não implementado"), { fatal: true });
}
