const MAP: Record<string, [string, string]> = {
  created: ["Aguardando upload", "text-smoke border-line"],
  uploaded: ["Na fila", "text-smoke border-line"],
  analyzing: ["Analisando", "text-volt border-volt/40"],
  ready: ["Pronto p/ exportar", "text-paper border-paper/30"],
  rendering: ["Renderizando", "text-volt border-volt/40"],
  done: ["Exportado", "text-ink bg-volt border-volt"],
  error: ["Erro", "text-red-400 border-red-400/40"],
  expired: ["Arquivos apagados", "text-smoke border-line"],
};
export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = MAP[status] || [status, "text-smoke border-line"];
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${cls}`}>{label}</span>;
}
