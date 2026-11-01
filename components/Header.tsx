import Link from "next/link";
import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/"><Logo size="sm" /></Link>
        <nav className="flex items-center gap-2">
          <Link href="/status" className="text-xs text-smoke hover:text-volt">Status</Link>
          <Link href="/new" className="btn !px-4 !py-2 text-sm">+ Novo Projeto</Link>
          <form action="/api/auth/logout" method="post"><button className="btn-ghost">Sair</button></form>
        </nav>
      </div>
    </header>
  );
}
