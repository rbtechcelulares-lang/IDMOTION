import { redirect } from "next/navigation";
import { isAuthed, passwordExists } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LobbyForm } from "./LobbyForm";
import { configProblems } from "@/lib/health";

export const dynamic = "force-dynamic";

export default async function Lobby() {
  const problems = await configProblems();
  if (problems.length) return <ConfigError problems={problems} />;
  if (await isAuthed()) redirect("/");
  const exists = await passwordExists();
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-ink px-6">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-volt/10 blur-3xl" />
      <div className="w-full max-w-sm">
        <div className="idm-rise mb-12 text-center">
          <Logo />
          <div className="idm-line mx-auto mt-5 h-[3px] w-24 bg-volt" />
          <p className="mt-5 text-sm tracking-[.25em] text-smoke uppercase">Intelligence in Every Frame.</p>
        </div>
        <div className="idm-rise" style={{ animationDelay: ".25s" }}>
          <LobbyForm mode={exists ? "login" : "setup"} needsCode={!exists && !!process.env.SETUP_CODE} />
        </div>
      </div>
    </main>
  );
}

function ConfigError({ problems }: { problems: string[] }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center"><Logo /></div>
        <div className="rounded-2xl border border-red-400/40 bg-panel p-5">
          <p className="mb-3 font-semibold text-red-400">Configuração incompleta</p>
          <ul className="list-disc space-y-2 pl-5 text-sm">{problems.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="mt-4 text-xs text-smoke">Corrija em Vercel → Settings → Environment Variables e faça Redeploy.</p>
        </div>
      </div>
    </main>
  );
}
