"use client";
import { useState } from "react";

export function LobbyForm({ mode, needsCode }: { mode: "login" | "setup"; needsCode: boolean }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (mode === "setup") {
      if (String(f.password).length < 8) return setErr("Mínimo de 8 caracteres.");
      if (f.password !== f.confirm) return setErr("As senhas não conferem.");
    }
    setBusy(true);
    const res = await fetch(mode === "setup" ? "/api/auth/setup" : "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(f),
    });
    setBusy(false);
    if (res.ok) return window.location.assign("/");
    setErr((await res.json().catch(() => ({}))).error || "Erro inesperado.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "setup" && <p className="text-center text-sm text-smoke">Primeiro acesso: crie a senha do usuário <b className="text-paper">IDMOTION</b>.</p>}
      <div>
        <label className="label">Usuário</label>
        <input name="username" className="input" defaultValue="IDMOTION" readOnly={mode === "setup"} autoComplete="username" />
      </div>
      <div>
        <label className="label">Senha</label>
        <input name="password" type="password" className="input" required minLength={mode === "setup" ? 8 : 1} autoComplete={mode === "setup" ? "new-password" : "current-password"} autoFocus />
      </div>
      {mode === "setup" && (
        <div>
          <label className="label">Confirmar senha</label>
          <input name="confirm" type="password" className="input" required minLength={8} autoComplete="new-password" />
        </div>
      )}
      {needsCode && (
        <div>
          <label className="label">Código de setup</label>
          <input name="setupCode" className="input" required autoComplete="off" />
        </div>
      )}
      {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? "…" : mode === "setup" ? "Criar senha" : "Entrar"}</button>
    </form>
  );
}
