import { type Edl, clipDuration, edlDuration } from "../edl";

export type SfxCue = { name: string; t: number; gain?: number; pan?: number };

/** Som ligado ao que está sendo dito (mapa semântico da skill RBTech). */
function semantic(text: string): string | null {
  const t = text.toLowerCase();
  if (/whats|mensag|direct|link|chama|fala com/.test(t)) return "send";
  if (/brinde|b[oô]nus|sorteio|presente|ganh/.test(t)) return "unlock";
  if (/cart[aã]o|parcel|\d+\s?x\b|vezes/.test(t)) return "card";
  if (/aceit|aprovad|garantia|seguro/.test(t)) return "approve";
  if (/atendiment|suporte|t[eé]cnic/.test(t)) return "typing";
  if (/loja|florian|palho[cç]a|s[aã]o jos[eé]|regi[aã]o|endere/.test(t)) return "location";
  if (/iphone|aparelho|modelo|celular|pro max/.test(t)) return "device";
  return null;
}

/**
 * Plano de efeitos sonoros do vídeo: transição (whoosh/wipe/slam) em cada troca de cena, som do significado da cena,
 * preço com impacto, contador com ticks, check com pop, chamada final com riser + hit.
 */
export function planSfx(edl: Edl): SfxCue[] {
  const cues: SfxCue[] = [];
  if (!edl.audio.sfx?.enabled) return cues;
  if (edl.mode === "motion" && edl.motion) {
    let t = 0;
    edl.motion.scenes.forEach((s, i) => {
      const tr = s.transition ?? (i === 0 ? "fade" : "fade");
      if (i > 0) {
        if (tr === "flash") cues.push({ name: "slam", t, gain: 0.9 });
        else if (tr.startsWith("wipe")) cues.push({ name: "wipe", t: Math.max(0, t - 0.1), gain: 0.8, pan: tr === "wipe-lr" ? -0.3 : tr === "wipe-rl" ? 0.3 : 0 });
        else cues.push({ name: "whoosh", t: Math.max(0, t - 0.15), gain: 0.55 });
      }
      const full = `${s.text} ${s.sub ?? ""}`;
      if (s.kind === "price") { cues.push({ name: "price", t: t + 0.08, gain: 1 }); }
      else if (s.kind === "counter") { for (let k = 0; k < 6; k++) cues.push({ name: "tick", t: t + 0.15 + k * 0.12, gain: 0.5 }); cues.push({ name: "price", t: t + 0.9, gain: 0.9 }); }
      else if (s.kind === "check") cues.push({ name: "pop", t: t + 0.12, gain: 0.8 });
      else if (s.kind === "compare") { cues.push({ name: "slam", t: t + 0.15, gain: 0.6 }); cues.push({ name: "approve", t: t + 0.55, gain: 0.8 }); }
      else if (s.kind === "cta") { cues.push({ name: "riser", t: Math.max(0, t - 0.45), gain: 0.7 }); cues.push({ name: "hit", t, gain: 0.9 }); const sem = semantic(full); if (sem === "send") cues.push({ name: "send", t: t + 0.5, gain: 0.7 }); }
      else if (s.kind === "title" && i === 0) cues.push({ name: "shimmer", t: 0.05, gain: 0.5 });
      else { const sem = semantic(full); if (sem) cues.push({ name: sem, t: t + 0.2, gain: 0.75 }); }
      if (s.visual === "phones" || s.visual === "phone") cues.push({ name: "device", t: t + 0.35, gain: 0.6 });
      t += s.duration;
    });
    return cues;
  }
  // vídeo real: whoosh só em corte de verdade (pulo no tempo), "pop" nos jump zooms, sons nos textos, impacto no preço, riser + hit na chamada
  let t = 0;
  edl.clips.forEach((c, i) => {
    if (i > 0) {
      const jump = Math.abs(c.in - edl.clips[i - 1].out) > 0.05;
      if (jump) cues.push({ name: i % 3 === 0 ? "wipe" : "whoosh", t: Math.max(0, t - 0.12), gain: 0.4 });
      else if (c.zoom !== edl.clips[i - 1].zoom) cues.push({ name: "pop", t, gain: 0.25 });
    }
    t += clipDuration(c);
  });
  const total = edlDuration(edl);
  const o = edl.overlays;
  if (o.intro) { cues.push({ name: "shimmer", t: 0.05, gain: 0.5 }); cues.push({ name: "wipe", t: Math.max(0, Math.min(o.intro.duration, 2.4) - 0.2), gain: 0.7 }); }
  for (const x of o.texts) { const sem = semantic(x.text); cues.push({ name: sem ?? "pop", t: x.start + 0.05, gain: sem ? 0.6 : 0.45 }); }
  for (const c of o.cards ?? []) {
    cues.push({ name: "wipe", t: Math.max(0, c.start - 0.12), gain: 0.6 });
    const sem = c.scene.kind === "price" ? "price" : c.scene.kind === "check" ? "pop" : semantic(`${c.scene.text} ${c.scene.sub ?? ""}`);
    if (sem) cues.push({ name: sem, t: c.start + 0.12, gain: 0.75 });
    cues.push({ name: "whoosh", t: Math.max(0, c.start + c.scene.duration - 0.15), gain: 0.4 });
  }
  if (o.price) { cues.push({ name: "slam", t: o.price.start, gain: 0.6 }); cues.push({ name: "price", t: o.price.start + 0.08, gain: 0.85 }); }
  if (o.cta) { const ct = total - o.cta.duration; cues.push({ name: "riser", t: Math.max(0, ct - 0.45), gain: 0.6 }); cues.push({ name: "wipe", t: Math.max(0, ct - 0.2), gain: 0.6 }); cues.push({ name: "hit", t: ct + 0.05, gain: 0.85 }); }
  return cues;
}
