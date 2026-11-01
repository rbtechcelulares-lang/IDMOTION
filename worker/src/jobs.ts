import { Cancelled, db } from "./env";

export type Job = { id: string; project_id: string; type: "analyze" | "render"; attempts: number; max_attempts: number; edl_version: number | null };

/** Contexto do job: progresso + checagem de cancelamento (throttled). */
export function jobCtx(job: Job) {
  let last = 0;
  return {
    async progress(p: number, stage: string, force = false) {
      const now = Date.now();
      if (!force && now - last < 800) return;
      last = now;
      const { data } = await db.from("jobs").update({ progress: Math.max(0, Math.min(1, p)), stage }).eq("id", job.id).select("cancel_requested").single();
      if (data?.cancel_requested) throw new Cancelled();
    },
    async checkCancel() {
      const { data } = await db.from("jobs").select("cancel_requested").eq("id", job.id).single();
      if (data?.cancel_requested) throw new Cancelled();
    },
  };
}
export type JobCtx = ReturnType<typeof jobCtx>;
