"use client";
import { useState } from "react";
import { AUDIO_EXT, FORMATS, OBJECTIVES, STYLES, STYLE_LABEL, VIDEO_EXT } from "@/shared/constants";

const STYLE_HINT = { cinematic: "Ritmo calmo, letterbox, tipografia elegante", viral: "Cortes rápidos, legenda grande palavra a palavra", premium: "Limpo, destaque de produto e preço" };

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve(NaN);
    v.src = URL.createObjectURL(file);
  });
}

async function upload(id: string, kind: string, file: File, onProgress: (p: number) => void): Promise<void> {
  const r = await fetch(`/api/projects/${id}/upload-url`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, filename: file.name, type: file.type, size: file.size }) });
  const target = await r.json();
  if (!r.ok) throw new Error(target.error || `Erro ${r.status}`);
  await put(target.url, file, onProgress, target.mode);
  if (target.mode !== "local") {
    const c = await fetch(`/api/projects/${id}/upload-complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, key: target.key }) });
    if (!c.ok) throw new Error((await c.json().catch(() => ({}))).error || `Erro ${c.status}`);
  }
}

function put(url: string, file: File, onProgress: (p: number) => void, mode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    if (mode === "local") x.setRequestHeader("x-filename", encodeURIComponent(file.name));
    if (mode === "supabase") x.setRequestHeader("x-upsert", "true");
    x.setRequestHeader("content-type", file.type || "application/octet-stream");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => {
      if (x.status < 300) return resolve();
      let msg = `Erro ${x.status} no upload`;
      try { const j = JSON.parse(x.responseText || "{}"); msg = j.error || j.message || msg; } catch {}
      if (x.status === 413) msg = "Arquivo grande demais para o armazenamento.";
      reject(new Error(msg));
    };
    x.onerror = () => reject(new Error(mode === "s3" ? "Falha no upload (rede ou CORS do bucket)" : "Falha de rede no upload"));
    x.send(file);
  });
}

export function NewProjectForm({ maxUploadMb, maxDurationS }: { maxUploadMb: number; maxDurationS: number }) {
  const [format, setFormat] = useState<string>("9:16");
  const [style, setStyle] = useState<string>("viral");
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [fileInfo, setFileInfo] = useState("");

  async function checkVideo(file: File | undefined): Promise<string | null> {
    if (!file) return "Selecione um vídeo.";
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!VIDEO_EXT.includes(ext)) return `Formato não suportado. Use ${VIDEO_EXT.join(", ")}.`;
    if (file.size > maxUploadMb * 1024 * 1024) return `Arquivo acima de ${maxUploadMb} MB.`;
    const d = await videoDuration(file);
    if (Number.isFinite(d) && (d < 1 || d > maxDurationS)) return `Duração de ${d.toFixed(1)}s fora do limite (1s a ${maxDurationS}s).`;
    return null;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setErr("");
    if (!f) return setFileInfo("");
    const problem = await checkVideo(f);
    if (problem) { setErr(problem); e.target.value = ""; return setFileInfo(""); }
    const d = await videoDuration(f);
    setFileInfo(`${(f.size / 1048576).toFixed(1)} MB${Number.isFinite(d) ? ` · ${d.toFixed(1)}s` : ""}`);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const fd = new FormData(e.currentTarget);
    const video = fd.get("video") as File;
    const music = fd.get("music") as File;
    const problem = await checkVideo(video?.size ? video : undefined);
    if (problem) return setErr(problem);
    if (music?.size && !AUDIO_EXT.includes(music.name.slice(music.name.lastIndexOf(".")).toLowerCase())) return setErr(`Trilha: use ${AUDIO_EXT.join(", ")}.`);
    setProgress(0);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: fd.get("name"), format, style, objective: fd.get("objective"), instructions: fd.get("instructions") }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      await upload(body.id, "source", video, (p) => setProgress(p * (music?.size ? 0.9 : 1)));
      if (music?.size) await upload(body.id, "music", music, (p) => setProgress(0.9 + p * 0.1));
      await fetch(`/api/projects/${body.id}/analyze`, { method: "POST" });
      window.location.assign(`/p/${body.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setProgress(null);
    }
  }

  const busy = progress !== null;
  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <label className="label">Vídeo bruto *</label>
        <input name="video" type="file" accept={VIDEO_EXT.join(",") + ",video/*"} onChange={onFile} required className="input file:mr-4 file:rounded-md file:border-0 file:bg-volt file:px-3 file:py-1.5 file:font-semibold file:text-ink" />
        <p className="mt-1 text-xs text-smoke">{fileInfo || `${VIDEO_EXT.join(" ")} · até ${maxUploadMb} MB · até ${Math.round(maxDurationS / 60)} min`}</p>
      </div>
      <div>
        <label className="label">Nome do projeto *</label>
        <input name="name" className="input" required maxLength={80} placeholder="Ex.: iPhone 15 Pro — oferta da semana" />
      </div>
      <div>
        <label className="label">Formato</label>
        <div className="grid grid-cols-4 gap-2">
          {FORMATS.map((f) => (
            <button type="button" key={f} onClick={() => setFormat(f)} className={`rounded-lg border py-3 text-sm font-semibold transition ${format === f ? "border-volt bg-volt text-ink" : "border-line hover:border-volt"}`}>{f}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Objetivo</label>
        <select name="objective" className="input" defaultValue="Venda">{OBJECTIVES.map((o) => <option key={o}>{o}</option>)}</select>
      </div>
      <div>
        <label className="label">Estilo</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {STYLES.map((s) => (
            <button type="button" key={s} onClick={() => setStyle(s)} className={`rounded-lg border p-3 text-left transition ${style === s ? "border-volt bg-volt/10" : "border-line hover:border-volt"}`}>
              <div className={`font-semibold ${style === s ? "text-volt" : ""}`}>{STYLE_LABEL[s]}</div>
              <div className="mt-1 text-xs text-smoke">{STYLE_HINT[s]}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Instruções para o diretor</label>
        <textarea name="instructions" rows={4} maxLength={2000} className="input" placeholder={'Ex.: Preço R$ 4.299. CTA: "Chama no direct". Duração 30s. Abertura: iPhone 15 Pro com garantia.'} />
      </div>
      <div>
        <label className="label">Trilha (opcional)</label>
        <input name="music" type="file" accept={AUDIO_EXT.join(",") + ",audio/*"} className="input file:mr-4 file:rounded-md file:border-0 file:bg-paper file:px-3 file:py-1.5 file:text-ink" />
      </div>
      {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
      {busy && (
        <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-volt transition-all" style={{ width: `${Math.round(progress! * 100)}%` }} /></div>
      )}
      <button className="btn w-full" disabled={busy}>{busy ? `Enviando… ${Math.round(progress! * 100)}%` : "Criar e analisar"}</button>
    </form>
  );
}
