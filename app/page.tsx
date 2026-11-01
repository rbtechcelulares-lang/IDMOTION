import Link from "next/link";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { db } from "@/lib/supabase";
import { STYLE_LABEL, type Style } from "@/shared/constants";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; format: string; style: Style; status: string; objective: string; updated_at: string; created_at: string };
const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function Home() {
  const { data } = await db().from("projects").select("id,name,format,style,status,objective,updated_at,created_at").order("updated_at", { ascending: false }).limit(100);
  const rows = (data || []) as Row[];
  const recent = rows.slice(0, 6);
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="idm-rise mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="label">Estúdio</p>
            <h1 className="text-3xl font-bold">O que vamos editar hoje?</h1>
          </div>
          <Link href="/new" className="btn">+ Novo Projeto</Link>
        </section>

        <h2 className="label mb-3">Projetos recentes</h2>
        {recent.length === 0 ? (
          <Link href="/new" className="block rounded-2xl border border-dashed border-line p-10 text-center text-smoke hover:border-volt hover:text-volt">
            Nenhum projeto ainda. Envie seu primeiro vídeo →
          </Link>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="group rounded-2xl border border-line bg-panel p-4 transition hover:border-volt">
                <div className="mb-3 flex items-center justify-between"><StatusBadge status={p.status} /><span className="text-xs text-smoke">{p.format}</span></div>
                <div className="truncate text-lg font-semibold group-hover:text-volt">{p.name}</div>
                <div className="mt-1 text-xs text-smoke">{STYLE_LABEL[p.style]} · {fmt(p.updated_at)}</div>
              </Link>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <h2 className="label mb-3 mt-12">Histórico</h2>
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-panel text-xs uppercase tracking-wider text-smoke">
                  <tr><th className="px-4 py-2">Projeto</th><th className="px-4 py-2">Formato</th><th className="px-4 py-2">Estilo</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Criado</th></tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-t border-line hover:bg-panel">
                      <td className="px-4 py-2"><Link href={`/p/${p.id}`} className="hover:text-volt">{p.name}</Link></td>
                      <td className="px-4 py-2 text-smoke">{p.format}</td>
                      <td className="px-4 py-2 text-smoke">{STYLE_LABEL[p.style]}</td>
                      <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-2 text-smoke">{fmt(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  );
}
