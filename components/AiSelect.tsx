"use client";
/** Seletor do cérebro criativo (IA que planeja o vídeo; quem produz é sempre o motor). */
export const AI_OPTIONS = [
  { v: "auto", label: "Automático", hint: "Gemini → Claude → regras", need: null },
  { v: "gemini", label: "Gemini", hint: "grátis", need: "gemini" },
  { v: "opus", label: "Claude Opus 5.5", hint: "o melhor · ~US$ 0,06/vídeo · desce p/ Haiku se faltar crédito", need: "claude" },
  { v: "haiku", label: "Claude Haiku 5.5", hint: "econômico · ~US$ 0,002/vídeo", need: "claude" },
  { v: "rules", label: "Só regras", hint: "sem IA", need: null },
] as const;

export function AiSelect({ name, ai, value, onChange, disabled }: { name?: string; ai: { gemini: boolean; claude: boolean }; value?: string; onChange?: (v: string) => void; disabled?: boolean }) {
  return (
    <select name={name} className="input" defaultValue={value === undefined ? "auto" : undefined} value={value} disabled={disabled} onChange={(e) => onChange?.(e.target.value)}>
      {AI_OPTIONS.map((o) => {
        const missing = o.need === "gemini" ? !ai.gemini : o.need === "claude" ? !ai.claude : false;
        return <option key={o.v} value={o.v}>{o.label} — {missing ? "chave não configurada" : o.hint}</option>;
      })}
    </select>
  );
}
