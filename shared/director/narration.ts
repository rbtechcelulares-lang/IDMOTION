import type { Edl } from "../edl";

const plain = (s: string) => s.replace(/[*~]/g, "").replace(/\s+/g, " ").trim();
const sentence = (s: string) => { const t = plain(s); return /[.!?]$/.test(t) ? t : `${t}.`; };

type Scene = NonNullable<Edl["motion"]>["scenes"][number];
/** O que a voz fala numa cena: exatamente o texto da tela. */
export function sceneLine(s: Scene): string {
  if (s.kind === "compare" && s.compare) return `${s.compare.left.label} ${s.compare.left.value}. ${s.compare.right.label}: ${s.compare.right.value}.`;
  if (s.kind === "price" || s.kind === "counter") return sentence(`${s.sub ? `${s.sub} ` : ""}${s.text}`);
  return sentence(`${s.text}${s.sub && s.kind !== "title" ? `. ${s.sub}` : ""}`);
}

/** Texto de narração escrito a partir do plano (cenas do motion ou abertura/preço/CTA do vídeo). */
export function buildNarration(edl: Edl): string {
  const parts: string[] = [];
  if (edl.mode === "motion") {
    for (const s of edl.motion?.scenes ?? []) parts.push(sceneLine(s));
  } else {
    const o = edl.overlays;
    if (o.intro) parts.push(sentence(o.intro.text));
    if (o.price) parts.push(sentence(`${o.price.label ? `${o.price.label} ` : ""}${o.price.value}`));
    if (o.cta) parts.push(sentence(o.cta.text));
  }
  return parts.join(" ").replace(/\.\.+/g, ".").slice(0, 2500);
}

export type Tone = "animado" | "neutro" | "calmo";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Texto como deve ser FALADO (a tela continua igual): sem CAIXA ALTA, sem marcações, preço/datas/parcelas por extenso
 * e, no tom animado, exclamação no lugar do ponto.
 */
export function speakable(text: string, tone: Tone = "animado", kind?: string): string {
  let t = text.replace(/[*~]/g, "").replace(/\s+/g, " ").trim();
  const letters = t.replace(/[^A-Za-zÀ-ú]/g, "");
  const allCaps = letters.length > 4 && letters === letters.toUpperCase();
  t = t.replace(/R\$\s?(\d{1,3}(?:\.\d{3})*)(?:,(\d{2}))?/g, (_m, r, c) => `${r.replace(/\./g, "")} ${r === "1" ? "real" : "reais"}${c && c !== "00" ? ` e ${Number(c)} centavos` : ""}`);
  t = t.replace(/\b(\d{1,2})\s?x\b/gi, "$1 vezes");
  t = t.replace(/\b(\d{1,2})\/(\d{1,2})\b/g, (m, d, mo) => (Number(mo) >= 1 && Number(mo) <= 12 ? `${Number(d)} de ${MESES[Number(mo) - 1]}` : m));
  t = t.replace(/(\d+)\s?%/g, "$1 por cento");
  // depois das conversões: CAIXA ALTA → normal (mantém siglas curtas e marcas)
  if (allCaps) t = t.toLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
  t = t.replace(/\biphones?\b/gi, (m) => (m.toLowerCase().endsWith("s") ? "iPhones" : "iPhone")).replace(/\brb ?tech\b/gi, "RBTech").replace(/\bvip\b/gi, "VIP");

  if (tone === "animado" && (kind === "title" || kind === "price" || kind === "cta" || kind === "counter" || /[.]$/.test(t) === false)) t = t.replace(/[.]+$/, "") + (/[!?]$/.test(t) ? "" : "!");
  else if (!/[.!?]$/.test(t)) t += ".";
  return t;
}
