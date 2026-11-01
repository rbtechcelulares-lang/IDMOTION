import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { type Edl, EdlSchema } from "../edl";
import { finalizeEdl } from "./finalize";
import { HeuristicDirector, musicFor } from "./heuristic";
import type { Analysis, Brief, Director } from "./types";
import { RBTECH_GUIDE } from "./knowledge";

const SCHEMA_DOC = `EDL JSON (tempos em segundos; clips usam o tempo do vídeo-fonte; overlays usam o tempo da timeline final):
{
 "format": "9:16"|"16:9"|"1:1"|"4:5",
 "preset": "cinematic"|"viral"|"premium",
 "clips": [{"in": number, "out": number, "speed": 0.5-2, "zoom": 1-1.6, "label"?: string}],
 "captions": {"enabled": boolean, "position": "bottom"|"center"|"top", "size": "sm"|"md"|"lg", "items": []},
 "overlays": {
   "intro": {"text": string<=60, "sub"?: string, "duration": 0.5-6} | null,
   "texts": [{"start","end","text"<=80,"position":"top"|"center"|"bottom"}],
   "price": {"start","end","value": "R$ 4.299","label"?: string} | null,
   "cta": {"text": string<=60, "sub"?: string, "duration": 1-8} | null
 },
 "audio": {"sourceVolume": 0-2, "music": {"volume": 0-1, "track": {"genre":"trap"|"pop"|"light","bpm":60-180,"shift":-6..6,"seed":1-9999} | null} | null, "narration": {"text": string, "voiceId"?: string, "volume": 0-2} | null, "normalize": true},
 "notes": string<=500
}
Regras: captions.items fica vazio (o sistema gera a partir da transcrição). Clipes em ordem narrativa, sem pausas, muletas ("é", "hum", "então") ou repetições. Não invente preço: use só o que estiver nas instruções/transcrição.
TRILHA: se hasMusic=true use {"volume":0.16-0.22,"track":null} (trilha enviada). Se hasMusic=false ESCOLHA uma trilha gerada: trap = energia/venda direta (130-150 bpm),
pop = animado/lançamento/leve (98-114), light = premium/calmo/clean (80-92); volume 0.16-0.2 com fala; varie bpm/shift/seed a cada vídeo.`;

const MOTION_DOC = `MODO 100% MOTION (sem vídeo-fonte): responda com
{"mode":"motion","format":...,"preset":...,"clips":[],"motion":{"scenes":[{"kind":"title"|"feature"|"price"|"cta","text":string<=90,"sub"?:string<=120,"duration":0.8-8}]},
 "captions":{"enabled":false,"position":"bottom","size":"md","items":[]},"overlays":{"intro":null,"texts":[],"price":null,"cta":null},
 "audio":{"sourceVolume":1,"music":{"volume":0.9,"track":{"genre":"trap"|"pop"|"light","bpm":number,"shift":number,"seed":number}|null},"narration":{"text":string,"volume":1}|null,"normalize":true},"notes":string}
Regras: 1ª cena "title", última "cta". Textos curtos e fortes (até ~8 palavras); em "price" o text é o valor ("R$ 499,90") e sub o contexto ("iPhones a partir de").
Use só informações das instruções. Duração total típica 12-30s. Trilha: se hasMusic=true use "track":null; senão escolha track (trap energia, pop animado, light premium) com volume 0.9.`;

const STYLE_GUIDE = `${RBTECH_GUIDE}\nEstilos: viral = cortes de 1-3s, punch-in alternado (zoom 1.1-1.2), legenda lg; cinematic = cortes longos, ritmo calmo, zoom 1; premium = limpo, destaque de produto e preço, zoom sutil.`;

function summarize(a: Analysis) {
  const segs = a.speech.slice(0, 200).map((s) => {
    const words = a.words?.filter((w) => w.start >= s.start - 0.2 && w.end <= s.end + 0.2).map((w) => w.text).join(" ");
    return `[${s.start.toFixed(2)}-${s.end.toFixed(2)}] ${words ?? ""}`.trim();
  });
  return [
    `duração ${a.duration.toFixed(2)}s, ${a.width}x${a.height}, ${a.fps.toFixed(0)}fps, áudio=${a.hasAudio}`,
    `cortes de cena: ${a.scenes.map((t) => t.toFixed(2)).join(", ") || "nenhum"}`,
    `trechos de fala (${a.transcriptProvider}):`,
    ...(segs.length ? segs : ["(sem fala detectada)"]),
  ].join("\n");
}

/** Sempre há trilha: a enviada (track null) ou uma gerada que combine (se a IA não escolheu). */
function withMusic(edl: Edl, b: Brief): Edl {
  if (b.hasMusic) edl.audio.music = { volume: edl.audio.music?.volume ?? (edl.mode === "motion" ? 0.9 : 0.18), track: null };
  else if (!edl.audio.music?.track) edl.audio.music = musicFor(b, edl.mode === "motion");
  return edl;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const t = text.trim();
  const arr = !fenced && t.indexOf("[") !== -1 && (t.indexOf("{") === -1 || t.indexOf("[") < t.indexOf("{"));
  const body = fenced ? fenced[1] : arr ? t.slice(t.indexOf("["), t.lastIndexOf("]") + 1) : t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
  return JSON.parse(body);
}

export class ClaudeDirector implements Director {
  readonly name: string;
  private client: Anthropic;
  private model: string;
  private fallback = new HeuristicDirector();

  constructor(apiKey: string, model = process.env.AI_MODEL || "claude-opus-5-5") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.name = `claude:${model}`;
  }

  private async ask(system: string, content: Anthropic.Beta.BetaContentBlockParam[]): Promise<string> {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: (process.env.AI_EFFORT as "low" | "medium" | "high") || "medium" },
      system,
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") throw new Error("IA recusou o pedido");
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }

  /** Revisão "de IA" das legendas (mesma quantidade, mesmos tempos): corrige e limpa o que não faz sentido. */
  private async polishCaptions(edl: Edl): Promise<Edl> {
    const items = edl.captions.items;
    if (edl.mode !== "video" || !items.length || items.length > 400) return edl;
    try {
      const system = `Você revisa legendas de reels de venda (PT-BR). ${RBTECH_GUIDE}\nResponda SOMENTE com um JSON array de strings, com EXATAMENTE ${items.length} itens, na mesma ordem. Use "" para legenda que deve sumir (muleta, ruído, sem sentido). Máx. 6 palavras por item. Não mude números/preços.`;
      const out = z.array(z.string().max(120)).length(items.length).parse(extractJson(await this.ask(system, [{ type: "text", text: JSON.stringify(items.map((c) => c.text)) }])));
      edl.captions.items = items.map((c, i) => ({ ...c, text: out[i].trim() })).filter((c) => c.text);
    } catch (e) {
      console.warn("[director] revisão das legendas falhou, mantendo a revisão local:", (e as Error).message);
    }
    return edl;
  }

  async plan(a: Analysis, b: Brief, frames: { t: number; jpegBase64: string }[] = []): Promise<Edl> {
    if (!b.hasVideo) {
      const system = `Você é o AI Director do ID MOTION, criador de vídeos curtos de venda 100% animados. Responda SOMENTE com JSON válido.\n${MOTION_DOC}\n${STYLE_GUIDE}`;
      const text = `BRIEF\nnome: ${b.name}\nformato: ${b.format}\nestilo: ${b.style}\nobjetivo: ${b.objective}\nhasMusic: ${b.hasMusic}\ninstruções:\n${b.instructions || "(nenhuma)"}\n\nGere o EDL motion.`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = extractJson(await this.ask(system, [{ type: "text", text }])) as Record<string, unknown>;
          return withMusic(finalizeEdl({ ...raw, mode: "motion", clips: [], format: b.format }, a), b);
        } catch (e) {
          console.warn(`[director] motion tentativa ${attempt + 1} inválida:`, (e as Error).message);
        }
      }
      return this.fallback.plan(a, b);
    }
    const system = `Você é o AI Director do ID MOTION, editor de vídeos curtos de venda. Responda SOMENTE com um JSON válido no formato abaixo.\n${SCHEMA_DOC}\n${STYLE_GUIDE}`;
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...frames.slice(0, 6).flatMap((f) => [
        { type: "text" as const, text: `Frame em ${f.t.toFixed(1)}s:` },
        { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.jpegBase64 } },
      ]),
      { type: "text", text: `BRIEF\nnome: ${b.name}\nformato: ${b.format}\nestilo: ${b.style}\nobjetivo: ${b.objective}\nhasMusic: ${b.hasMusic}\ninstruções: ${b.instructions || "(nenhuma)"}\n\nANÁLISE\n${summarize(a)}\n\nGere o EDL.` },
    ];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = extractJson(await this.ask(system, content)) as Record<string, unknown>;
        return this.polishCaptions(withMusic(finalizeEdl({ ...raw, format: b.format }, a), b));
      } catch (e) {
        console.warn(`[director] tentativa ${attempt + 1} inválida:`, (e as Error).message);
      }
    }
    console.warn("[director] usando plano heurístico");
    return this.fallback.plan(a, b);
  }

  async edit(edl: Edl, instruction: string, a: Analysis, b: Brief) {
    // comandos simples resolvem localmente (rápido, sem custo)
    const local = await this.fallback.edit(edl, instruction, a);
    if (local) return local;
    const slim = { ...edl, captions: { ...edl.captions, items: [] } };
    const system = `Você é o AI Director do ID MOTION. O usuário pede alterações em um EDL${edl.mode === "motion" ? " de vídeo 100% motion (edite motion.scenes)" : ""}. Responda SOMENTE com JSON: {"reply": "resumo curto em português do que mudou", "edl": <EDL completo>}.\n${edl.mode === "motion" ? MOTION_DOC : SCHEMA_DOC}\n${STYLE_GUIDE}`;
    const text = `BRIEF: ${b.name} / ${b.objective} / ${b.instructions}\nANÁLISE\n${summarize(a)}\n\nEDL ATUAL\n${JSON.stringify(slim)}\n\nPEDIDO: ${instruction}`;
    const parsed = z.object({ reply: z.string().max(600), edl: z.unknown() }).parse(extractJson(await this.ask(system, [{ type: "text", text }])));
    EdlSchema.parse(parsed.edl);
    return { edl: await this.polishCaptions(finalizeEdl(parsed.edl, a)), reply: parsed.reply };
  }
}
