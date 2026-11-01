"use client";
// Upload do navegador: local (PUT no app) ou direto para o storage (URL assinada).

export function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve(NaN);
    v.src = URL.createObjectURL(file);
  });
}

export async function upload(id: string, kind: string, file: File, onProgress: (p: number) => void): Promise<void> {
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
    x.onerror = () => reject(new Error(mode === "s3" ? "Falha no upload. Abra Status (no topo) para ver o motivo." : "Falha de rede no upload"));
    x.send(file);
  });
}

