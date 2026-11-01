import { type Edl, edlDuration } from "../edl";
import { FORMATS, STYLES, type Format, type Style } from "../constants";
import type { Analysis } from "./types";
import { fixText } from "./textfix";
import { buildNarration } from "./narration";
import { trackFor, trackVolume, type Genre } from "./music";
import { BG_WORDS, TEXTURE_WORDS, iconFor, type Background } from "../motion";

export const COMMAND_HELP = [
  "estilo viral | cinematic | premium",
  "formato 9:16 | 16:9 | 1:1 | 4:5",
  "duração 20s",
  "mais rápido / mais lento",
  "remover corte 3 (ou: remover cena 2, no vídeo motion)",
  "preço R$ 4.299 / sem preço",
  "CTA: Chama no direct / sem CTA",
  "abertura: Novo iPhone / sem abertura",
  "texto: Garantia de 1 ano",
  "legenda maior | menor | no centro | embaixo | em cima | sem legenda | com legenda",
  "fundo branco | preto | creme | amarelo | brilho [na cena 2] · textura granulada | pontilhada | grade | linhas | listras | sem textura",
  "emojis 🔥 📱 💛 (flutuando) · emoji 🔥 na cena 2 · ícone telefone na cena 3 · ícones flutuantes · sem ícones",
  "destaque garantia · riscar caderno",
  "trilha trap | pop | light · outra trilha · trilha mais rápida · volume da música 30% · sem trilha",
  "narração: texto… / sem narração",
];

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Interpreta comandos simples em português. Retorna null se nada foi entendido. */
export function applyCommands(input: Edl, instruction: string, a: Analysis): { edl: Edl; reply: string } | null {
  const edl = clone(input);
  const done: string[] = [];
  const text = instruction.trim();
  const low = text.toLowerCase();
  let m: RegExpMatchArray | null;

  const style = STYLES.find((s) => new RegExp(`\\b${s}\\b`, "i").test(low)) as Style | undefined;
  if (style && /estilo|preset|deix[ae]|mud[ae]|troc[ae]|vers[aã]o/.test(low)) { edl.preset = style; done.push(`estilo ${style}`); }

  m = low.match(/\b(9:16|16:9|1:1|4:5)\b/);
  if (m && FORMATS.includes(m[1] as Format)) { edl.format = m[1] as Format; done.push(`formato ${m[1]}`); }

  const motion = edl.mode === "motion" && edl.motion ? edl.motion.scenes : null;
  if (motion) {
    const scale = (k: number) => motion.forEach((x) => (x.duration = Math.max(0.8, Math.min(8, +(x.duration * k).toFixed(2)))));
    if (/mais r[aá]pido|acelera|mais din[aâ]mico/.test(low)) { scale(1 / 1.15); done.push("ritmo +15%"); }
    if (/mais lento|desacelera|mais calmo/.test(low)) { scale(1.15); done.push("ritmo -15%"); }
    if ((m = low.match(/(?:remov|tir|apag)\w*\s+(?:a\s+)?(?:cena|card|tela)\s*(\d+)/))) {
      const i = Number(m[1]) - 1;
      if (i >= 0 && i < motion.length && motion.length > 1) { motion.splice(i, 1); done.push(`cena ${i + 1} removida`); }
    }
    if ((m = low.match(/dura[çc][aã]o\s*(?:de|para|=|:)?\s*(\d{1,3})\s*s?/))) {
      scale(Math.max(3, Number(m[1])) / edlDuration(edl));
      done.push(`duração ≈ ${edlDuration(edl).toFixed(1)}s`);
    }
    const setKind = (kind: "title" | "price" | "cta", text: string, sub?: string) => {
      const sc = motion.find((x) => x.kind === kind);
      if (sc) { sc.text = text; if (sub !== undefined) sc.sub = sub; }
      else if (kind === "title") motion.unshift({ kind, text, duration: 2.4 });
      else if (kind === "cta") motion.push({ kind, text, duration: 3 });
      else motion.splice(Math.max(0, motion.length - 1), 0, { kind, text, sub, duration: 2.8 });
    };
    if ((m = text.match(/pre[çc]o\s*(?:para|:|=|de)?\s*(R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i))) {
      const value = m[1].startsWith("R$") ? m[1].replace(/\s+/, " ") : `R$ ${m[1]}`;
      setKind("price", value); done.push(`preço ${value}`);
    }
    if (/sem pre[çc]o/.test(low)) { edl.motion!.scenes = motion.filter((x) => x.kind !== "price"); done.push("preço removido"); }
    if ((m = text.match(/cta\s*[:=]\s*["“]?([^"”\n]+)/i))) { setKind("cta", fixText(m[1].trim()).slice(0, 90)); done.push(`CTA "${m[1].trim()}"`); }
    if ((m = text.match(/(?:abertura|t[ií]tulo)\s*[:=]\s*["“]?([^"”\n]+)/i))) { setKind("title", fixText(m[1].trim()).slice(0, 90)); done.push(`abertura "${m[1].trim()}"`); }
    // ---- visual: fundo, textura, emojis, ícones, destaque, riscado ----
    const theme = edl.motion!.theme;
    const sceneIdx = (s: string) => { const k = s.match(/cena\s*(\d+)/); return k ? Number(k[1]) - 1 : null; };
    for (const part of low.split(/[,;\n]| e (?=fundo|textura|emoji|[ií]cone|destaq|risc)/)) {
      const p = part.trim();
      if (!p) continue;
      const idx = sceneIdx(p);
      if (/\bfundo\b/.test(p)) {
        const bg = BG_WORDS.find(([re]) => re.test(p))?.[1] as Background | undefined;
        if (bg && idx !== null && motion[idx]) { motion[idx].bg = bg; done.push(`fundo ${bg} na cena ${idx + 1}`); }
        else if (bg) { theme.bg = bg; motion.forEach((x) => delete x.bg); done.push(`fundo ${bg}`); }
      }
      if (/\btextura\b|granulad|pontilhad|quadriculad|listrad/.test(p)) {
        const tx = TEXTURE_WORDS.find(([re]) => re.test(p))?.[1];
        if (tx) { theme.texture = tx; done.push(`textura ${tx}`); }
      }
      if (/sem (emojis?|[ií]cones?)( flutuantes)?$/.test(p) && idx === null) { theme.floaters = null; done.push("sem ícones flutuantes"); continue; }
      const emojis = [...part.matchAll(/\p{Extended_Pictographic}(?:\uFE0F)?/gu)].map((x) => x[0]);
      if (/emoji|[ií]cone/.test(p)) {
        if (idx !== null && motion[idx]) {
          if (/sem (emoji|[ií]cone)/.test(p)) { delete motion[idx].icon; done.push(`sem ícone na cena ${idx + 1}`); }
          else {
            const ic = emojis[0] ?? iconFor(p.replace(/[ií]cone|emoji|na cena\s*\d+|de|do|da/g, " "));
            if (ic) { motion[idx].icon = ic; done.push(`ícone ${emojis[0] ?? ic} na cena ${idx + 1}`); }
          }
        } else if (emojis.length) { theme.floaters = { items: emojis.slice(0, 8) }; done.push(`emojis flutuando ${emojis.join(" ")}`); }
        else if (/flutua|fundo|voando/.test(p) || /^(com )?[ií]cones$|^emojis$/.test(p)) {
          const items = [...new Set(motion.map((x) => x.icon).filter((x): x is string => !!x))];
          const named = iconFor(p.replace(/[ií]cones?|flutuantes?|emojis?|de|com/g, " "));
          theme.floaters = { items: (named ? [named, ...items] : items.length ? items : ["Sparkles", "Smartphone", "MessageSquareText"]).slice(0, 6) };
          done.push("ícones flutuantes");
        }
      }
    }
    if ((m = text.match(/\bdestaqu?e?\w*\s*[:=]?\s*["“]?([^"”,\n]+)/i))) {
      const w = m[1].trim(); let hit = false;
      motion.forEach((x) => { if (x.text.toLowerCase().includes(w.toLowerCase()) && !x.text.includes(`*${w}`)) { x.text = x.text.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"), "*$1*"); hit = true; } });
      if (hit) done.push(`destaque "${w}"`);
    }
    if ((m = text.match(/\brisca\w*\s*[:=]?\s*["“]?([^"”,\n]+)/i))) {
      const w = m[1].trim(); let hit = false;
      motion.forEach((x) => { if (x.text.toLowerCase().includes(w.toLowerCase())) { x.text = x.text.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"), "~$1~"); hit = true; } });
      if (hit) done.push(`riscado "${w}"`);
    }
    if ((m = text.match(/\b(?:texto|cena|adicion\w*)\s*[:=]\s*["“]?([^"”\n]+)/i))) {
      const at = motion.findIndex((x) => x.kind === "price" || x.kind === "cta");
      motion.splice(at < 0 ? motion.length : at, 0, { kind: "feature", text: fixText(m[1].trim()).slice(0, 90), duration: 2.4 });
      done.push(`cena "${m[1].trim()}" adicionada`);
    }
  }

  if (!motion && /mais r[aá]pido|acelera|mais din[aâ]mico/.test(low)) { edl.clips.forEach((c) => (c.speed = Math.min(2, +((c.speed || 1) * 1.15).toFixed(2)))); done.push("ritmo +15%"); }
  if (!motion && /mais lento|desacelera|mais calmo/.test(low)) { edl.clips.forEach((c) => (c.speed = Math.max(0.5, +((c.speed || 1) / 1.15).toFixed(2)))); done.push("ritmo -15%"); }

  if (!motion && (m = low.match(/(?:remov|tir|corta|apag)\w*\s+(?:o\s+)?(?:corte|clipe|cena|trecho)\s*(\d+)/))) {
    const i = Number(m[1]) - 1;
    if (i >= 0 && i < edl.clips.length && edl.clips.length > 1) { edl.clips.splice(i, 1); done.push(`corte ${i + 1} removido`); }
  }

  if (!motion && (m = low.match(/dura[çc][aã]o\s*(?:de|para|=|:)?\s*(\d{1,3})\s*s?/))) {
    const target = Math.max(3, Number(m[1]));
    const clips: Edl["clips"] = [];
    let t = 0;
    for (const c of edl.clips) {
      const d = (c.out - c.in) / (c.speed || 1);
      if (t + d <= target) { clips.push(c); t += d; continue; }
      const rest = target - t;
      if (rest > 0.4) clips.push({ ...c, out: c.in + rest * (c.speed || 1) });
      break;
    }
    edl.clips = clips.length ? clips : edl.clips.slice(0, 1);
    done.push(`duração ≈ ${edlDuration(edl).toFixed(1)}s`);
  }

  if (motion) { /* preço/CTA/abertura/texto já tratados nas cenas */ }
  else if (/sem pre[çc]o|remov\w* (o )?pre[çc]o/.test(low)) { edl.overlays.price = null; done.push("preço removido"); }
  else if ((m = text.match(/pre[çc]o\s*(?:para|:|=|de)?\s*(R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i))) {
    const value = m[1].startsWith("R$") ? m[1].replace(/\s+/, " ") : `R$ ${m[1]}`;
    const d = edlDuration(edl);
    const ctaD = edl.overlays.cta?.duration ?? 0;
    edl.overlays.price = { ...(edl.overlays.price ?? { start: +(d * 0.55).toFixed(2), end: +(d - ctaD).toFixed(2), label: "por apenas" }), value };
    done.push(`preço ${value}`);
  }

  if (motion) { /* idem */ }
  else if (/sem cta|remov\w* (o )?cta/.test(low)) { edl.overlays.cta = null; done.push("CTA removido"); }
  else if ((m = text.match(/cta\s*[:=]\s*["“]?([^"”\n]+)/i))) { edl.overlays.cta = { duration: edl.overlays.cta?.duration ?? 3, text: fixText(m[1].trim()).slice(0, 60) }; done.push(`CTA "${m[1].trim()}"`); }

  if (motion) { /* idem */ }
  else if (/sem abertura|remov\w* (a )?abertura/.test(low)) { edl.overlays.intro = null; done.push("abertura removida"); }
  else if ((m = text.match(/(?:abertura|t[ií]tulo)\s*[:=]\s*["“]?([^"”\n]+)/i))) { edl.overlays.intro = { duration: edl.overlays.intro?.duration ?? 2.2, sub: edl.overlays.intro?.sub, text: fixText(m[1].trim()).slice(0, 60) }; done.push(`abertura "${m[1].trim()}"`); }

  if (!motion && (m = text.match(/\btexto\s*[:=]\s*["“]?([^"”\n]+)/i))) {
    const d = edlDuration(edl);
    const start = Math.min(d - 1, (edl.overlays.intro?.duration ?? 0) + 0.3);
    edl.overlays.texts.push({ start, end: Math.min(d, start + 3), text: fixText(m[1].trim()).slice(0, 80), position: "top" });
    done.push(`texto "${m[1].trim()}"`);
  }
  if (/sem textos|remov\w* (os )?textos/.test(low)) { edl.overlays.texts = []; done.push("textos removidos"); }

  if (/sem legenda/.test(low)) { edl.captions.enabled = false; done.push("legendas desligadas"); }
  if (/com legenda|liga\w* (a )?legenda/.test(low)) { edl.captions.enabled = true; done.push("legendas ligadas"); }
  if (/legenda\w* maior/.test(low)) { edl.captions.size = edl.captions.size === "sm" ? "md" : "lg"; done.push(`legenda ${edl.captions.size}`); }
  if (/legenda\w* menor/.test(low)) { edl.captions.size = edl.captions.size === "lg" ? "md" : "sm"; done.push(`legenda ${edl.captions.size}`); }
  if (/legenda\w* (no )?(centro|meio)/.test(low)) { edl.captions.position = "center"; done.push("legenda no centro"); }
  if (/legenda\w* (embaixo|em baixo|abaixo|no rodap[eé])/.test(low)) { edl.captions.position = "bottom"; done.push("legenda embaixo"); }
  if (/legenda\w* (em cima|no topo|acima)/.test(low)) { edl.captions.position = "top"; done.push("legenda em cima"); }

  const isMotion = edl.mode === "motion";
  const cur = edl.audio.music;
  if (/sem m[uú]sica|sem trilha/.test(low)) { edl.audio.music = null; done.push("trilha desligada"); }
  else {
    if ((m = low.match(/(?:m[uú]sica|trilha)\s*(?:de\s+|estilo\s+|tipo\s+)?(trap|pop|light|leve|calma|animada|premium)\b/))) {
      const g: Genre = m[1] === "trap" ? "trap" : m[1] === "pop" || m[1] === "animada" ? "pop" : "light";
      edl.audio.music = { volume: cur?.track ? cur.volume : trackVolume(g, isMotion), track: trackFor(g, `${g}${Date.now()}`) };
      done.push(`trilha ${g}`);
    }
    if (/(outra|nova|troca\w*( a)?) (m[uú]sica|trilha)/.test(low)) {
      const g: Genre = edl.audio.music?.track?.genre ?? "pop";
      edl.audio.music = { volume: edl.audio.music?.volume ?? trackVolume(g, isMotion), track: trackFor(g, `${g}${Date.now()}`, 1) };
      done.push(`nova trilha ${g}`);
    }
    if (/com (m[uú]sica|trilha)/.test(low) && !edl.audio.music) { edl.audio.music = { volume: trackVolume("pop", isMotion), track: trackFor("pop", String(Date.now())) }; done.push("trilha ligada"); }
    const tr = edl.audio.music?.track;
    if (tr && /(m[uú]sica|trilha) mais r[aá]pida/.test(low)) { tr.bpm = Math.min(180, tr.bpm + 12); done.push(`trilha ${tr.bpm} bpm`); }
    if (tr && /(m[uú]sica|trilha) mais lenta/.test(low)) { tr.bpm = Math.max(60, tr.bpm - 12); done.push(`trilha ${tr.bpm} bpm`); }
    if ((m = low.match(/(?:m[uú]sica|trilha)[^\d]{0,20}(\d{1,3})\s*%/))) { edl.audio.music = { track: edl.audio.music?.track ?? null, volume: Math.min(1, Number(m[1]) / 100) }; done.push(`trilha ${m[1]}%`); }
  }
  if ((m = low.match(/(?:volume|[aá]udio) (?:do )?(?:v[ií]deo|original|fala)[^\d]{0,10}(\d{1,3})\s*%/))) { edl.audio.sourceVolume = Math.min(2, Number(m[1]) / 100); done.push(`áudio original ${m[1]}%`); }

  if (edl.audio.narration && (m = low.match(/narra(?:[çc][aã]o|dor)\s*(?:mais\s+)?(animad[oa]|empolgad[oa]|energ[eé]tic[oa]|neutr[oa]|calm[oa]|tranquil[oa])/))) {
    const tone = /neutr/.test(m[1]) ? "neutro" : /calm|tranquil/.test(m[1]) ? "calmo" : "animado";
    edl.audio.narration.tone = tone; done.push(`narração ${tone}`);
  }
  if (/sem narra[çc][aã]o/.test(low)) { edl.audio.narration = null; done.push("narração removida"); }
  else if (/narra[çc][aã]o\s*[:=]?\s*(auto|das cenas|sincronizada)/i.test(text)) { edl.audio.narration = { text: buildNarration(edl), volume: 1, voiceId: edl.audio.narration?.voiceId, custom: false, tone: edl.audio.narration?.tone ?? "animado" }; done.push("narração sincronizada com as cenas"); }
  else if ((m = text.match(/narra[çc][aã]o\s*[:=]\s*["“]?([^"”]+)/i))) { edl.audio.narration = { text: m[1].trim().slice(0, 2500), volume: 1, voiceId: edl.audio.narration?.voiceId, custom: true, tone: edl.audio.narration?.tone ?? "animado" }; done.push("narração definida"); }

  void a;
  if (!done.length) return null;
  return { edl, reply: `Feito: ${done.join(", ")}.` };
}
