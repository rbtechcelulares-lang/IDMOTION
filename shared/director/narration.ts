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

const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEN = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
function ate999(n: number): string {
  if (n < 20) return UN[n];
  if (n < 100) return DEZ[Math.floor(n / 10)] + (n % 10 ? ` e ${UN[n % 10]}` : "");
  if (n === 100) return "cem";
  return CEN[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : "");
}
/** Número inteiro por extenso em português (até 999 milhões). Ex.: 4299 → "quatro mil duzentos e noventa e nove". */
export function numPt(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 1000) return ate999(n);
  if (n < 1_000_000) {
    const mil = Math.floor(n / 1000), resto = n % 1000;
    const head = mil === 1 ? "mil" : `${ate999(mil)} mil`;
    return resto ? `${head}${resto < 100 || resto % 100 === 0 ? " e " : " "}${ate999(resto)}` : head;
  }
  const mi = Math.floor(n / 1_000_000), resto = n % 1_000_000;
  const head = mi === 1 ? "um milhão" : `${ate999(mi)} milhões`;
  return resto ? `${head} ${resto < 100 ? "e " : ""}${numPt(resto)}` : head;
}
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Texto como deve ser FALADO (a tela continua igual): sem CAIXA ALTA, sem marcações, preço/datas/parcelas por extenso
 * e, no tom animado, exclamação no lugar do ponto.
 */
export function speakable(text: string, tone: Tone = "animado", kind?: string): string {
  let t = text.replace(/[*~]/g, "").replace(/\s+/g, " ").trim();
  const letters = t.replace(/[^A-Za-zÀ-ú]/g, "");
  const allCaps = letters.length > 4 && letters === letters.toUpperCase();
  // preços: "R$ 4.299,90", "R$ 599", "499,90 reais" → por extenso
  const reais = (r: string, c?: string) => { const n = Number(r.replace(/\./g, "")); const cv = c ? Number(c) : 0; return `${numPt(n)} ${n === 1 ? "real" : "reais"}${cv ? ` e ${numPt(cv)} ${cv === 1 ? "centavo" : "centavos"}` : ""}`; };
  t = t.replace(/R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/g, (_m, r, c) => reais(r, c));
  t = t.replace(/\b(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*(?:reais|real)\b/gi, (_m, r, c) => reais(r, c));
  t = t.replace(/\b(\d{1,3}(?:\.\d{3})*|\d+)\s*(reais|real)\b/gi, (_m, r) => reais(r));
  t = t.replace(/\b(\d{1,2})\s?x\b/gi, (_m, n) => `${numPt(Number(n))} vezes`);
  t = t.replace(/\b(\d{1,2})\/(\d{1,2})\b/g, (m, d, mo) => (Number(mo) >= 1 && Number(mo) <= 12 ? `${Number(d) === 1 ? "primeiro" : numPt(Number(d))} de ${MESES[Number(mo) - 1]}` : m));
  t = t.replace(/(\d+)\s?%/g, (_m, n) => `${numPt(Number(n))} por cento`);
  // "1 ano" → "um ano", "10 primeiras" → "dez primeiras" (números soltos que sobraram)
  t = t.replace(/\b(\d{1,6})\b/g, (_m, n) => numPt(Number(n)));
  // depois das conversões: CAIXA ALTA → normal (mantém siglas curtas e marcas)
  if (allCaps) t = t.toLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
  t = t.replace(/\biphones?\b/gi, (m) => (m.toLowerCase().endsWith("s") ? "iPhones" : "iPhone")).replace(/\brb ?tech\b/gi, "RBTech").replace(/\bvip\b/gi, "VIP");

  if (tone === "animado" && (kind === "title" || kind === "price" || kind === "cta" || kind === "counter" || /[.]$/.test(t) === false)) t = t.replace(/[.]+$/, "") + (/[!?]$/.test(t) ? "" : "!");
  else if (!/[.!?]$/.test(t)) t += ".";
  return t;
}
