"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { STYLE_LABEL, type Style } from "@/shared/constants";
import type { Edl } from "@/shared/edl";
import { upload } from "@/components/upload";
import { VIDEO_EXT } from "@/shared/constants";

type Job = { id: string; type: string; status: string; progress: number; stage: string; attempts: number; max_attempts: number; error: string | null; output_path: string | null; edl_version: number | null; created_at: string; cancel_requested: boolean;
  qc: { passed: boolean; checks: { name: string; ok: boolean; value: string; expected: string; severity: string }[]; notes: string[] } | null };
type State = {
  project: { id: string; name: string; status: string; format: string; style: Style; objective: string; instructions: string; error: string | null; current_version: number | null; files_deleted_at: string | null;
    analysis: { duration: number; width: number; height: number; hasAudio: boolean; scenes: number; speech: number; words: number; transcriptProvider: string; frames: number; loudnessLufs: number | null } | null };
  edl: Edl | null; canUndo: boolean; versions: { version: number; source: string; note: string }[];
  messages: { id: number; role: string; content: string; edl_version: number | null }[]; jobs: Job[];
};

const sec = (n: number) => `${n.toFixed(1)}s`;
const ASPECT: Record<string, string> = { "9:16": "9/16", "16:9": "16/9", "1:1": "1/1", "4:5": "4/5" };

export function ProjectView({ id }: { id: string }) {
  const [s, setS] = useState<State | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    if (r.status === 401) return window.location.assign("/lobby");
    if (r.ok) setS(await r.json());
  }, [id]);

  const active = s?.jobs.find((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    load();
    const t = setInterval(load, active ? 1200 : 5000);
    return () => clearInterval(t);
  }, [load, active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight); }, [s?.messages.length]);

  async function post(url: string, body?: unknown) {
    setErr("");
    setBusy(true);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || `Erro ${r.status}`);
    await load();
    return r.ok;
  }

  if (!s) return <main className="mx-auto max-w-6xl px-4 py-10 text-smoke">Carregando…</main>;
  const { project: p, edl } = s;
  const lastRender = s.jobs.find((j) => j.type === "render" && j.status !== "queued" && j.status !== "running");
  const lastDone = s.jobs.find((j) => j.type === "render" && j.status === "done");
  const analyzing = active?.type === "analyze";
  const expired = !!p.files_deleted_at;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_400px]">
      <section className="min-w-0 space-y-6">
        <div className="idm-rise">
          <div className="mb-2 flex flex-wrap items-center gap-2"><StatusBadge status={p.status} /><span className="text-xs text-smoke">{p.format} · {STYLE_LABEL[p.style]} · {p.objective}</span></div>
          <h1 className="text-3xl font-bold">{p.name}</h1>
          {p.error && <p className="mt-2 text-sm text-red-400" title={p.error}>{p.error.slice(0, 160)}{p.error.length > 160 ? "…" : ""}</p>}
          {p.status === "created" && !active && !edl && <Reupload id={id} onDone={load} />}
          {p.status === "error" && !active && <button className="btn-ghost mt-3" disabled={busy} onClick={() => post(`/api/projects/${id}/analyze`)}>Analisar de novo</button>}
        </div>

        <div className="flex justify-center rounded-2xl border border-line bg-panel p-4">
          {expired ? (
            <div className="py-16 text-center text-smoke">Os vídeos deste projeto foram apagados automaticamente após 2 dias.<br />Crie um novo projeto para editar de novo.</div>
          ) : lastDone ? (
            <video key={lastDone.id} controls playsInline className="max-h-[70vh] rounded-lg bg-black" style={{ aspectRatio: ASPECT[p.format] }} src={`/api/jobs/${lastDone.id}/download?inline`} />
          ) : p.analysis?.frames ? (
            <div className="grid w-full grid-cols-3 gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {Array.from({ length: p.analysis.frames }).map((_, i) => <img key={i} alt={`frame ${i}`} src={`/api/projects/${id}/frame/${i}`} className="w-full rounded-md" />)}
            </div>
          ) : (
            <div className="py-16 text-center text-smoke">{analyzing ? "Analisando o material…" : "Sem preview ainda."}</div>
          )}
        </div>

        {analyzing && <Progress job={active!} onCancel={() => post(`/api/jobs/${active!.id}/cancel`)} />}

        {p.analysis && p.analysis.duration > 0 && (
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat k="Duração" v={sec(p.analysis.duration)} /><Stat k="Fonte" v={`${p.analysis.width}x${p.analysis.height}`} />
            <Stat k="Cenas / falas" v={`${p.analysis.scenes} / ${p.analysis.speech}`} />
            <Stat k="Transcrição" v={p.analysis.words ? `${p.analysis.words} palavras` : "não"} />
          </div>
        )}

        {edl && (
          <div className="rounded-2xl border border-line bg-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="label !mb-0">{edl.mode === "motion" ? "Motion" : "EDL"} · versão {p.current_version} · {sec(edl.mode === "motion" ? (edl.motion?.scenes ?? []).reduce((t, c) => t + c.duration, 0) : edl.clips.reduce((t, c) => t + (c.out - c.in) / (c.speed || 1), 0))}</h2>
              <span className="text-xs text-smoke">{STYLE_LABEL[edl.preset]} · {edl.format}</span>
            </div>
            {edl.mode === "motion" && (
              <ol className="mb-4 space-y-1 text-sm">
                {edl.motion?.scenes.map((c, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-line/60 py-1"><span className="min-w-0 truncate"><span className="text-volt">#{i + 1}</span> {c.text}</span><span className="shrink-0 text-smoke">{{ title: "abertura", feature: "cena", price: "preço", cta: "CTA" }[c.kind]} · {sec(c.duration)}</span></li>
                ))}
              </ol>
            )}
            <ol className="mb-4 space-y-1 text-sm">
              {edl.clips.map((c, i) => (
                <li key={i} className="flex justify-between gap-2 border-b border-line/60 py-1"><span><span className="text-volt">#{i + 1}</span> {sec(c.in)} → {sec(c.out)}</span><span className="text-smoke">{c.speed !== 1 ? `${c.speed}x ` : ""}{c.zoom > 1 ? `zoom ${c.zoom}` : ""}</span></li>
              ))}
            </ol>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Stat k="Abertura" v={edl.overlays.intro?.text ?? "—"} /><Stat k="CTA" v={edl.overlays.cta?.text ?? "—"} />
              <Stat k="Preço" v={edl.overlays.price?.value ?? "—"} /><Stat k="Legendas" v={edl.captions.enabled ? `${edl.captions.items.length} · ${edl.captions.size} · ${edl.captions.position}` : "desligadas"} />
              <Stat k="Trilha" v={edl.audio.music ? `${edl.audio.music.track ? `${edl.audio.music.track.genre} ${edl.audio.music.track.bpm} bpm` : "enviada"} · ${Math.round(edl.audio.music.volume * 100)}%` : "—"} /><Stat k="Narração" v={edl.audio.narration ? "sim" : "—"} />
            </div>
          </div>
        )}
      </section>

      <aside className="space-y-6">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <h2 className="label">Exportação</h2>
          {active?.type === "render" ? (
            <Progress job={active} onCancel={() => post(`/api/jobs/${active.id}/cancel`)} />
          ) : (
            <button className="btn w-full" disabled={busy || !edl || !!active || expired} onClick={() => post(`/api/projects/${id}/render`)}>
              {lastDone ? "Exportar de novo" : "Exportar vídeo"}
            </button>
          )}
          {!expired && <p className="mt-2 text-center text-[11px] text-smoke">Baixe no celular: os vídeos são apagados 2 dias após a última atividade.</p>}
          {lastRender && lastRender.status === "error" && !active && !expired && (
            <div className="mt-3 text-sm text-red-400">Falhou após {lastRender.attempts} tentativa(s): <span title={lastRender.error ?? ""}>{lastRender.error?.slice(0, 160)}</span> <button className="btn-ghost mt-2" onClick={() => post(`/api/projects/${id}/render`)}>Tentar de novo</button></div>
          )}
          {lastRender?.status === "cancelled" && !active && <p className="mt-3 text-sm text-smoke">Última exportação cancelada.</p>}
          {lastDone && !expired && (
            <div className="mt-4 space-y-3">
              <a className="btn w-full !bg-paper" href={`/api/jobs/${lastDone.id}/download`}>⬇ Baixar MP4 (v{lastDone.edl_version})</a>
              {lastDone.qc && (
                <table className="w-full text-xs">
                  <tbody>
                    {lastDone.qc.checks.map((c) => (
                      <tr key={c.name} className="border-t border-line/60"><td className="py-1">{c.ok ? <span className="text-volt">✓</span> : c.severity === "warn" ? "!" : <span className="text-red-400">✗</span>} {c.name}</td><td className="py-1 text-right text-smoke">{c.value}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              {lastDone.qc?.notes.map((n) => <p key={n} className="text-xs text-smoke">{n}</p>)}
            </div>
          )}
        </div>

        <div className="flex h-[520px] flex-col rounded-2xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="label !mb-0">Director Chat</h2>
            <button className="btn-ghost !py-1" disabled={busy || !s.canUndo || !!active || expired} onClick={() => post(`/api/projects/${id}/undo`)}>↶ Desfazer</button>
          </div>
          <div ref={chatRef} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {s.messages.length === 0 && <p className="text-smoke">O plano aparece aqui depois da análise.</p>}
            {s.messages.map((m) => (
              <div key={m.id} className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 ${m.role === "user" ? "ml-auto bg-volt text-ink" : "bg-line/60"}`}>{m.content}</div>
            ))}
          </div>
          <form className="flex gap-2 border-t border-line p-3" onSubmit={async (e) => { e.preventDefault(); if (!msg.trim()) return; const t = msg; setMsg(""); if (!(await post(`/api/projects/${id}/chat`, { message: t }))) setMsg(t); }}>
            <input className="input !py-2" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={edl ? 'Ex.: "preço R$ 3.999, legenda maior"' : "Aguardando análise…"} disabled={!edl || busy || !!active || expired} maxLength={2000} />
            <button className="btn !px-4 !py-2" disabled={!edl || busy || !!active || !msg.trim()}>{busy ? "…" : "→"}</button>
          </form>
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className="w-full text-xs text-smoke underline-offset-4 hover:text-red-400 hover:underline disabled:opacity-40" disabled={busy || !!active}
          onClick={async () => { if (!confirm("Excluir este projeto e os vídeos dele?")) return; const r = await fetch(`/api/projects/${id}`, { method: "DELETE" }); if (r.ok) window.location.assign("/"); else setErr((await r.json().catch(() => ({}))).error || "Erro ao excluir"); }}>
          Excluir projeto
        </button>
      </aside>
    </main>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg border border-line px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-smoke">{k}</div><div className="truncate">{v}</div></div>;
}

function Progress({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const pct = Math.round(job.progress * 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm"><span className={/não acionado/.test(job.stage) ? "text-red-400" : ""}>{job.status === "queued" ? (job.attempts || /não acionado/.test(job.stage) ? job.stage : "Ligando o motor de render… (até ~1 min)") : job.stage || "Iniciando…"}</span><span className="text-volt">{pct}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-volt transition-all duration-700" style={{ width: `${pct}%` }} /></div>
      <div className="flex items-center justify-between text-xs text-smoke">
        <span>Tentativa {Math.max(1, job.attempts)}/{job.max_attempts}</span>
        <button className="btn-ghost !py-1" onClick={onCancel} disabled={job.cancel_requested}>{job.cancel_requested ? "Cancelando…" : "Cancelar"}</button>
      </div>
    </div>
  );
}

function Reupload({ id, onDone }: { id: string; onDone: () => void }) {
  const [p, setP] = useState<number | null>(null);
  const [e, setE] = useState("");
  return (
    <div className="mt-4 rounded-xl border border-volt/40 p-4">
      <p className="mb-2 text-sm">O vídeo não chegou. Envie de novo:</p>
      <input type="file" accept={VIDEO_EXT.join(",") + ",video/*"} disabled={p !== null} className="input file:mr-3 file:rounded-md file:border-0 file:bg-volt file:px-3 file:py-1.5 file:font-semibold file:text-ink"
        onChange={async (ev) => {
          const f = ev.target.files?.[0];
          if (!f) return;
          setE(""); setP(0);
          try {
            await upload(id, "source", f, setP);
            const r = await fetch(`/api/projects/${id}/analyze`, { method: "POST" });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erro ${r.status}`);
            onDone();
          } catch (x) { setE((x as Error).message); setP(null); }
        }} />
      {p !== null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-volt" style={{ width: `${Math.round(p * 100)}%` }} /></div>}
      {e && <p className="mt-2 text-sm text-red-400">{e}</p>}
    </div>
  );
}
