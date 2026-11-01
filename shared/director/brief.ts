import { BG_WORDS, type Background } from "../motion";

/**
 * Lê um briefing/prompt de campanha (com "Cena 1", "Texto:", "HEADLINE", aspas, "DIREÇÃO CRIATIVA"...)
 * e separa o que APARECE NA TELA do que é só direção. Retorna null se as instruções forem simples (uma ideia por linha).
 */
export type BriefScene = { texts: string[]; desc: string; title: string };
export type CreativeBrief = { scenes: BriefScene[]; bg?: Background; target?: number; brand?: string; logoAtEnd: boolean };

const QUOTE_RE = /[“"«]([^”"»\n]{2,140})[”"»]/g;
const SCENE_RE = /^\s*(?:cena|scene|parte)\s*(\d+)\s*[-–—:.)]*\s*(.*)$/i;
const SECTION_RE = /^\s*(conceito|headline|headline principal|dire[çc][aã]o criativa|roteiro( do v[ií]deo)?|estilo|dura[çc][aã]o|observa[çc][õo]es|regras|prompt|objetivo|p[uú]blico)\b[^:]*:?/i;

export function isCreativeBrief(t: string): boolean {
  const quotes = (t.match(QUOTE_RE) || []).length;
  return /^\s*cena\s*\d+/im.test(t) || /\b(roteiro|headline|dire[çc][aã]o criativa)\b/i.test(t) || (quotes >= 2 && t.length > 250);
}

export function parseCreativeBrief(text: string): CreativeBrief | null {
  if (!isCreativeBrief(text)) return null;
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^[\s*•\-–]+/, "").trim());
  const scenes: BriefScene[] = [];
  let cur: BriefScene | null = null;
  let section = "";
  let headline: string | null = null;
  let expectText = false;
  for (const line of lines) {
    if (!line) continue;
    const sm = line.match(SCENE_RE);
    if (sm) { cur = { texts: [], desc: sm[2] || "", title: sm[2] || "" }; scenes.push(cur); expectText = false; continue; }
    const sec = line.match(SECTION_RE);
    if (sec && !cur) {
      section = sec[1].toLowerCase();
      const rest = line.slice(sec[0].length).trim();
      if (/headline/.test(section) && rest) headline = rest.replace(/[“”"]/g, "");
      continue;
    }
    if (sec && cur && /^(estilo|dura[çc][aã]o|observa|regras)/i.test(sec[1])) { cur = null; section = sec[1].toLowerCase(); continue; }
    if (/headline/.test(section) && !headline && !cur) { headline = line.replace(/[“”"]/g, "").trim(); continue; }
    if (!cur) continue;
    const quotes = [...line.matchAll(QUOTE_RE)].map((m) => m[1].trim());
    if (quotes.length) { cur.texts.push(...quotes); expectText = false; continue; }
    if (expectText && line.length <= 90) { cur.texts.push(line); expectText = false; continue; }
    if (/^(texto|frase|legenda|headline)\s*[:=]?\s*$/i.test(line) || /(surge|aparece) (a|o) (frase|texto)\s*:?$/i.test(line)) { expectText = true; continue; }
    const inline = line.match(/^(?:texto|frase|legenda)\s*[:=]\s*(.+)$/i);
    if (inline) { cur.texts.push(inline[1].replace(/[“”"]/g, "").trim()); continue; }
    cur.desc += ` ${line}`;
  }
  // sem "Cena N": cada texto entre aspas vira uma cena, na ordem
  if (!scenes.length) {
    const qs = [...text.matchAll(QUOTE_RE)].map((m) => m[1].trim());
    for (const q of qs) scenes.push({ texts: [q], desc: "", title: "" });
  }
  // headline entra se nenhuma cena já a mostra
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}$]/gu, "");
  if (headline && !scenes.some((s) => s.texts.some((t) => norm(t) === norm(headline!)))) {
    scenes.splice(Math.min(1, scenes.length), 0, { texts: [headline], desc: "headline", title: "headline" });
  }
  const kept = scenes.filter((s) => s.texts.length);
  if (!kept.length) return null;

  const low = text.toLowerCase();
  const bgLine = low.split("\n").find((l) => /fundo/.test(l)) ?? "";
  const bg = BG_WORDS.find(([re]) => re.test(bgLine))?.[1];
  const dm = low.match(/dura[çc][aã]o[^\d]{0,20}(\d{1,3})\s*(?:a|-|–|até|e)\s*(\d{1,3})\s*s/) ?? low.match(/dura[çc][aã]o[^\d]{0,20}(\d{1,3})\s*s/);
  const target = dm ? (dm[2] ? (Number(dm[1]) + Number(dm[2])) / 2 : Number(dm[1])) : undefined;
  const brand = text.match(/[Ll]ogo\s+(?:da\s+|do\s+)?([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .&-]{2,40}?)(?=\s+centralizad|\s*[.,\n]|$)/)?.[1]?.trim();
  const logoAtEnd = /logo/i.test(kept[kept.length - 1].desc);
  return { scenes: kept, bg, target, brand, logoAtEnd };
}
