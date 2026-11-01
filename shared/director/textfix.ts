/**
 * Revisor de texto do diretor (funciona sem IA): corrige grafia comum de vendas de iPhone em PT-BR,
 * padroniza marcas, remove muletas e descarta letras/frases sem sentido. Com Claude configurado,
 * o diretor ainda faz uma revisão "de IA" por cima (ver llm.ts).
 */

// palavra (minúscula, sem acento opcional) -> forma correta
const FIX: Record<string, string> = {
  ate: "até", tambem: "também", voce: "você", voces: "vocês", vc: "você", vcs: "vocês", tb: "também", tbm: "também",
  q: "que", pq: "porque", porq: "porque", nao: "não", n: "não", entao: "então", ja: "já", so: "só", sao: "são", tao: "tão",
  estao: "estão", ai: "aí", la: "lá", tbem: "também",
  iphone: "iPhone", iphones: "iPhones", ipad: "iPad", ipads: "iPads", airpods: "AirPods", macbook: "MacBook", applewatch: "Apple Watch",
  apple: "Apple", whatsapp: "WhatsApp", whats: "WhatsApp", zap: "WhatsApp", wpp: "WhatsApp", insta: "Instagram", instagram: "Instagram",
  direct: "direct", pix: "Pix", vip: "VIP", promax: "Pro Max", vs: "vs", x: "x", ok: "OK",
  rbtech: "RBTech", rbtec: "RBTech", rbteck: "RBTech", rbtek: "RBTech",
  seminovo: "seminovo", seminovos: "seminovos", seminova: "seminova", seminovas: "seminovas",
  perfums: "perfumes", perfum: "perfume", perfumes: "perfumes", premiun: "premium", premium: "premium",
  garantia: "garantia", garantias: "garantias", grantia: "garantia", garanita: "garantia",
  cartao: "cartão", cartoes: "cartões", promocao: "promoção", promocoes: "promoções", condicao: "condição", condicoes: "condições",
  preco: "preço", precos: "preços", sorteio: "sorteio", sorteios: "sorteios", brinde: "brinde", brindes: "brindes",
  exclusivo: "exclusivo", exclusivos: "exclusivos", exclusiva: "exclusiva", exclusivas: "exclusivas", ecxlusivo: "exclusivo",
  parcelamos: "parcelamos", parcela: "parcela", parcelas: "parcelas", vezes: "vezes", juros: "juros",
  florianopolis: "Florianópolis", floripa: "Floripa", palhoca: "Palhoça", "sao jose": "São José", biguacu: "Biguaçu",
  loja: "loja", lancamento: "lançamento", lancamentos: "lançamentos", novo: "novo", nova: "nova", bateria: "bateria",
  saude: "saúde", camera: "câmera", cameras: "câmeras", memoria: "memória", gigas: "gigas", giga: "giga", tela: "tela",
  acessorios: "acessórios", acessorio: "acessório", unico: "único", unica: "única", ultimo: "último", ultimos: "últimos",
  ultimas: "últimas", estoque: "estoque", disponivel: "disponível", disponiveis: "disponíveis", agora: "agora", hoje: "hoje",
  numero: "número", otimo: "ótimo", otima: "ótima", proximo: "próximo", maximo: "máximo", minimo: "mínimo",
};
// pares de palavras
const FIX2: [RegExp, string][] = [
  [/\bsemi[\s-]+nov([oa]s?)\b/gi, "seminov$1"],
  [/\bpro\s*max\b/gi, "Pro Max"],
  [/\b(iPhone\s+\d{1,2})\s+pro\b/gi, "$1 Pro"],
  [/\b(iPhone\s+\d{1,2})\s+plus\b/gi, "$1 Plus"],
  [/\b(iPhone\s+\d{1,2})\s+mini\b/gi, "$1 mini"],
  [/\b(iPhone\s+\d{1,2})\s+e\b/g, "$1e"],
  [/\brb[\s-]*tec[hk]?\b/gi, "RBTech"],
  [/\bapple\s*watch\b/gi, "Apple Watch"],
  [/\bgrupo\s+vip\b/gi, "grupo VIP"],
  [/\b(\d{1,2})\s*x\b/gi, "$1x"],
  [/\bR\s*\$\s*/g, "R$ "],
];
const FILLERS = new Set(["é", "hum", "hmm", "hm", "ahn", "ah", "eh", "uh", "tipo", "né", "então", "assim", "aí"]);
const VOWELS = /[aeiouáàâãéêíóôõúy]/i;
const KEEP_SHORT = new Set(["a", "e", "o", "é", "à", "ou", "um", "no", "na", "de", "do", "da", "em", "x"]);
const SIGLAS = /^(R\$|VIP|PIX|USB|5G|4G|GB|TB|SSD|LTE|CEP|CNPJ|CPF|\d+[a-z]{0,3}|\d+x|\d+%|[A-Z]{2,5})$/;

export type FixReport = { fixed: string[]; dropped: string[] };
export const newReport = (): FixReport => ({ fixed: [], dropped: [] });

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palavra que não faz sentido: sem vogal, letras repetidas, sequência de teclado, mistura aleatória. */
function isGarbage(word: string): boolean {
  const w = word.replace(/[^\p{L}\p{N}$%]/gu, "");
  if (!w) return true;
  if (SIGLAS.test(w) || /\d/.test(w)) return false;
  const low = w.toLowerCase();
  if (FIX[stripAccents(low)]) return false; // abreviações conhecidas: vc, q, pq, tb, wpp…
  if (low.length === 1) return !KEEP_SHORT.has(low);
  if (!VOWELS.test(low)) return true; // "xkzq", "sdf"
  if (/(.)\1{2,}/.test(low) && new Set(low).size <= 2) return true; // "aaaa", "kkkk"
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(stripAccents(low))) return true; // "asdfghj"
  if (/^(asdf|qwer|zxcv|hjkl|jkl|sdf|dfg|fgh|ghj)/.test(low)) return true;
  return false;
}

function fixWord(token: string, rep?: FixReport): string {
  const m = token.match(/^([^\p{L}\p{N}$]*)([\p{L}\p{N}$%]+(?:[-'][\p{L}\p{N}]+)*)([^\p{L}\p{N}]*)$/u);
  if (!m) return token;
  const [, pre, core, post] = m;
  const w = core.replace(/([a-zà-ú])\1{2,}/gi, "$1"); // "muuuito" -> "muito"
  const key = stripAccents(w.toLowerCase());
  let out = FIX[key] ?? (FIX[w.toLowerCase()] ?? w);
  if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) && out.toUpperCase() !== w.toUpperCase()) out = out.toUpperCase(); // "ATE" -> "ATÉ"
  // preserva maiúscula inicial quando a correção é minúscula
  if (out !== w && /^[A-ZÀ-Ú]/.test(w) && /^[a-zà-ú]/.test(out) && !/^[a-z][A-Z]/.test(out)) out = out[0].toUpperCase() + out.slice(1);
  if (w.toUpperCase() === w && w.length > 3 && out.toLowerCase() === w.toLowerCase()) out = w; // CAIXA ALTA proposital
  if (out !== core) rep?.fixed.push(`${core} → ${out}`);
  return pre + out + post;
}

/** Corrige uma frase. Retorna "" se a frase não fizer sentido. */
export function fixText(text: string, rep?: FixReport, opts: { dropFillers?: boolean; sentenceCase?: boolean } = {}): string {
  const original = text.trim();
  if (!original) return "";
  let words = original.split(/\s+/);
  const garbage = words.filter((w) => isGarbage(w));
  if (garbage.length && garbage.length >= Math.ceil(words.length / 2)) {
    rep?.dropped.push(original);
    return "";
  }
  words = words.filter((w) => {
    if (!isGarbage(w)) return true;
    rep?.dropped.push(w);
    return false;
  });
  words = words.map((w) => fixWord(w, rep));
  if (opts.dropFillers) words = words.filter((w, i) => !(FILLERS.has(w.toLowerCase().replace(/[^\p{L}]/gu, "")) && (i === 0 || words.length <= 2)));
  words = words.filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1].toLowerCase()); // "o o", "que que"
  let s = words.join(" ");
  for (const [re, to] of FIX2) {
    s = s.replace(re, (...m) => {
      let out = m[0].replace(new RegExp(re.source, re.flags.replace("g", "")), to);
      if (/[A-Z]{2}/.test(m[0]) && m[0] === m[0].toUpperCase()) out = out.toUpperCase(); // texto em CAIXA ALTA continua em caixa alta
      if (out !== m[0]) rep?.fixed.push(`${m[0]} → ${out}`);
      return out;
    });
  }
  s = s.replace(/\s+([,.!?;:])/g, "$1").replace(/([,.!?])\1+/g, "$1").replace(/\s{2,}/g, " ").trim();
  if (!/[\p{L}\p{N}]/u.test(s)) { rep?.dropped.push(original); return ""; }
  // maiúscula no início, exceto marcas como iPhone/iPad
  if (opts.sentenceCase !== false && /^[a-zà-ú]/.test(s) && !/^[a-z][A-Z]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

/** Texto da legenda: corrige, tira muleta solta e não força maiúscula. */
export const fixCaption = (text: string, rep?: FixReport) => fixText(text, rep, { dropFillers: true, sentenceCase: false });

export function reportLine(rep: FixReport): string {
  const uniq = (a: string[]) => [...new Set(a)].filter((x) => !/^(.+) → \1$/.test(x));
  const f = uniq(rep.fixed).slice(0, 8);
  const d = uniq(rep.dropped).slice(0, 5);
  return [f.length ? `Corrigi: ${f.join("; ")}` : "", d.length ? `Descartei: ${d.map((x) => `"${x}"`).join(", ")}` : ""].filter(Boolean).join(". ");
}
