import type { Edl } from "../edl";

const plain = (s: string) => s.replace(/[*~]/g, "").replace(/\s+/g, " ").trim();
const sentence = (s: string) => { const t = plain(s); return /[.!?]$/.test(t) ? t : `${t}.`; };

/** Texto de narração escrito a partir do plano (cenas do motion ou abertura/preço/CTA do vídeo). */
export function buildNarration(edl: Edl): string {
  const parts: string[] = [];
  if (edl.mode === "motion") {
    for (const s of edl.motion?.scenes ?? []) {
      if (s.kind === "compare" && s.compare) parts.push(`${s.compare.left.label} ${s.compare.left.value}. ${s.compare.right.label}: ${s.compare.right.value}.`);
      else if (s.kind === "price" || s.kind === "counter") parts.push(sentence(`${s.sub ? `${s.sub} ` : ""}${s.text}`));
      else parts.push(sentence(`${s.text}${s.sub && s.kind !== "title" ? `. ${s.sub}` : ""}`));
    }
  } else {
    const o = edl.overlays;
    if (o.intro) parts.push(sentence(o.intro.text));
    if (o.price) parts.push(sentence(`${o.price.label ? `${o.price.label} ` : ""}${o.price.value}`));
    if (o.cta) parts.push(sentence(o.cta.text));
  }
  return parts.join(" ").replace(/\.\.+/g, ".").slice(0, 2500);
}
