import { redirect } from "next/navigation";
import { isAuthed, passwordExists } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LobbyForm } from "./LobbyForm";

export const dynamic = "force-dynamic";

export default async function Lobby() {
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
