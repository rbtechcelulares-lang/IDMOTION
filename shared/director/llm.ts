import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { type Edl, EdlSchema } from "../edl";
import { finalizeEdl } from "./finalize";
import { HeuristicDirector, musicFor } from "./heuristic";
import type { Analysis, Brief, Director } from "./types";
import { RBTECH_GUIDE } from "./knowledge";
import { LIBRARY_DOC } from "../motion";

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
{"mode":"motion","format":...,"preset":...,"clips":[],"motion":{
  "theme":{"bg": um fundo da biblioteca,"texture":"none"|"grain"|"dots"|"grid"|"lines"|"stripes","floaters":{"items":[ícones Lucide ou emojis]}|null},
  "scenes":[{"kind":"title"|"feature"|"price"|"cta"|"compare"|"counter"|"check","text":string<=90,"sub"?:string<=120,"duration":0.8-8,
    "icon"?: nome de ícone Lucide (Phone, MessageSquareText, NotebookText, Sheet, Cloud, ShieldCheck, Gift, Truck, CreditCard, Wrench, Tag, Zap, Smartphone, Users, MapPin, Sparkles, BadgeCheck, Clock, ShoppingCart) ou um emoji,
    "bg"?: fundo só desta cena, "layout"?: "center"|"top"|"bottom"|"left"|"right", "anim"?: "rise"|"pop"|"slide"|"zoom"|"type"|"blur"|"mask", "visual"?: "none"|"phones"|"phone", "transition"?: "fade"|"wipe-lr"|"wipe-rl"|"wipe-tb"|"wipe-bt"|"flash"|"zoom",
    "compare"?: {"left":{"label","value","sub"?},"right":{"label","value","sub"?}} }]},
${LIBRARY_DOC}
 "captions":{"enabled":false,"position":"bottom","size":"md","items":[]},"overlays":{"intro":null,"texts":[],"price":null,"cta":null},
 "audio":{"sourceVolume":1,"music":{"volume":0.9,"track":{"genre":"trap"|"pop"|"light","bpm":number,"shift":number,"seed":number}|null},"narration":{"text":string,"volume":1}|null,"normalize":true},"notes":string}
Texto: use *palavra* para destacar (cor de acento) e ~palavra~ para riscar. compare = dois cards "A vs B" (right é o vencedor); counter = número que conta (text "R$ 1,26", sub "Menos de"); check = ✓ + texto.
Visual: escolha da BIBLIOTECA o que o roteiro pede (ex.: "luzes percorrem" → spotlight; preço/revelação → rays ou spotlight + visual phones; brinde/sorteio → particles; urgência/data → speed; garantia/premium → metal).
Varie fundo, layout e animação entre as cenas (nunca o mesmo fundo em tudo). iPhones aparecendo → visual "phones" (ou "phone") e texto com layout "bottom". Use bg "paper" para o "jeito antigo/papel". Obedeça pedidos de fundo/textura/emoji do usuário.
BRIEFING: as instruções podem ser um prompt completo de campanha. Use SOMENTE os textos que devem aparecer na tela (entre aspas, depois de "Texto:"/"Surge a frase", e a HEADLINE),
respeitando a ordem das cenas do roteiro. Descrições ("Tela escura", "Direção criativa", "Estilo", "iPhones aparecem…") NÃO são cenas: viram decisões visuais (fundo, ícones, ritmo, duração).
Se o briefing já tem encerramento, não invente CTA nem textos extras.
Regras: 1ª cena "title", última "cta" (ou o encerramento do briefing). Textos curtos e fortes (até ~8 palavras); em "price" o text é o valor ("R$ 499,90") e sub o contexto ("iPhones a partir de").
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

/** Parte de mensagem neutra (texto ou imagem JPEG) — cada provedor converte para o seu formato. */
export type Part = { type: "text"; text: string } | { type: "image"; jpegBase64: string };
/** Como falar com uma IA. O diretor (o "cérebro criativo") é o mesmo para qualquer provedor. */
export type Asker = { name: string; ask(system: string, parts: Part[]): Promise<string> };

/** Claude (Anthropic SDK). */
export function anthropicAsker(apiKey: string, model = process.env.AI_MODEL || "claude-opus-5-5"): Asker {
  const client = new Anthropic({ apiKey });
  return {
    name: `claude:${model}`,
    async ask(system, parts) {
      const content: Anthropic.Beta.BetaContentBlockParam[] = parts.map((p) =>
        p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.jpegBase64 } });
      const serverFallback = /opus|sonnet|fable/.test(model); // Haiku não tem fallback no servidor
      const res = await client.beta.messages.create({
        model, max_tokens: 16000,
        ...(serverFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        output_config: { effort: (process.env.AI_EFFORT as "low" | "medium" | "high") || "medium" },
        system, messages: [{ role: "user", content }],
      }, { timeout: Number(process.env.AI_TIMEOUT_MS || 45000), maxRetries: 1 });
      if (res.stop_reason === "refusal") throw new Error("IA recusou o pedido");
      return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    },
  };
}

/** Corrente de cérebros: tenta o próximo se um falhar (sem crédito, limite, fora do ar, lento). */
export function chainAskers(list: Asker[]): Asker {
  if (list.length === 1) return list[0];
  return {
    name: list.map((x) => x.name).join(" → "),
    async ask(system, parts) {
      let last: unknown;
      for (const a of list) {
        try { return await a.ask(system, parts); }
        catch (e) { last = e; console.warn(`[ia] ${a.name} falhou: ${(e as Error).message.slice(0, 160)} — tentando o próximo cérebro`); }
      }
      throw last;
    },
  };
}

/** Qualquer API compatível com OpenAI Chat Completions (Gemini, Groq, Cloudflare Workers AI, OpenRouter…). */
export function openAiCompatAsker(o: { baseUrl: string; apiKey: string; model: string; label: string; fallbackModels?: string[]; reasoningEffort?: string }): Asker {
  const url = `${o.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const models = [...new Set([o.model, ...(o.fallbackModels ?? [])].filter(Boolean))];
  const one = (model: string): Asker => ({
    name: `${o.label}:${model}`,
    async ask(system, parts) {
      const content = parts.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: `data:image/jpeg;base64,${p.jpegBase64}` } }));
      const callPlain = (json: boolean) => openAiCompatAsker({ ...o, fallbackModels: [], model, reasoningEffort: undefined }).ask(system, json ? parts : parts);
      const call = async (json: boolean): Promise<string> => {
        const res = await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${o.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, temperature: 0.7, messages: [{ role: "system", content: system }, { role: "user", content }], ...(json ? { response_format: { type: "json_object" } } : {}), ...(o.reasoningEffort ? { reasoning_effort: o.reasoningEffort } : {}) }),
          signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS || 45000)),
        });
        if (!res.ok) {
          const msg = (await res.text()).slice(0, 200);
          // alguns modelos não aceitam reasoning_effort: repete sem
          if (res.status === 400 && o.reasoningEffort && /reasoning/i.test(msg)) return callPlain(json);
          throw Object.assign(new Error(`${o.label} ${res.status}: ${msg}`), { status: res.status });
        }
        const j = (await res.json()) as { choices?: { message?: { content?: string | { text?: string }[] } }[] };
        const c = j.choices?.[0]?.message?.content;
        return typeof c === "string" ? c : (c ?? []).map((x) => x.text ?? "").join("");
      };
      const wantsArray = /JSON array/.test(system); // json_object não aceita array na raiz
      try { return await call(!wantsArray); } catch (e) { if ((e as { status?: number }).status === 400 && !wantsArray) return call(false); throw e; }
    },
  });
  // modelos de reserva: se um estiver indisponível (404), sobrecarregado (503/429) ou lento, tenta o próximo
  return {
    name: `${o.label}:${models[0]}`,
    async ask(system, parts) {
      let last: unknown;
      for (const m of models) {
        try { return await one(m).ask(system, parts); }
        catch (e) {
          last = e;
          const st = (e as { status?: number }).status;
          if (st === 401 || st === 403) throw e; // chave inválida: não adianta trocar de modelo
          console.warn(`[ia] ${m} falhou (${st ?? (e as Error).name}); tentando o próximo modelo`);
        }
      }
      throw last;
    },
  };
}

/** Erro de conexão/HTTP/timeout (≠ JSON inválido). */
const isTransportError = (e: unknown) => (e as { status?: number }).status !== undefined || /timeout|abort|fetch failed|ECONN|ENOTFOUND/i.test(`${(e as Error).name} ${(e as Error).message}`);

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

/** Cérebro criativo: entende o pedido/briefing e devolve o plano (EDL). A produção fica com o motor. */
export class LlmDirector implements Director {
  readonly name: string;
  private fallback = new HeuristicDirector();
  constructor(private asker: Asker) { this.name = asker.name; }
  ask(system: string, parts: Part[]) { return this.asker.ask(system, parts); }

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
      // rascunho do diretor por regras: ponto de partida que a IA deve MELHORAR (não copiar às cegas)
      const draft = await this.fallback.plan(a, b).then((d) => ({ theme: d.motion?.theme, scenes: d.motion?.scenes })).catch(() => null);
      const text = `BRIEF\nnome: ${b.name}\nformato: ${b.format}\nestilo: ${b.style}\nobjetivo: ${b.objective}\nhasMusic: ${b.hasMusic}\ninstruções:\n${b.instructions || "(nenhuma)"}\n\nRASCUNHO (regras; melhore textos, ordem, ritmo, ícones e visual, sem inventar fatos):\n${JSON.stringify(draft)}\n\nGere o EDL motion.`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = extractJson(await this.ask(system, [{ type: "text", text }])) as Record<string, unknown>;
          return withMusic(finalizeEdl({ ...raw, mode: "motion", clips: [], format: b.format }, a), b);
        } catch (e) {
          console.warn(`[director] motion tentativa ${attempt + 1} inválida:`, (e as Error).message);
          if (isTransportError(e)) break; // IA fora do ar/lenta: não repetir a lista toda, vai para as regras
        }
      }
      return this.fallback.plan(a, b);
    }
    const system = `Você é o AI Director do ID MOTION, editor de vídeos curtos de venda. Responda SOMENTE com um JSON válido no formato abaixo.\n${SCHEMA_DOC}\n${STYLE_GUIDE}`;
    const content: Part[] = [
      ...frames.slice(0, 6).flatMap((f): Part[] => [
        { type: "text", text: `Frame em ${f.t.toFixed(1)}s:` },
        { type: "image", jpegBase64: f.jpegBase64 },
      ]),
      { type: "text", text: `BRIEF\nnome: ${b.name}\nformato: ${b.format}\nestilo: ${b.style}\nobjetivo: ${b.objective}\nhasMusic: ${b.hasMusic}\ninstruções: ${b.instructions || "(nenhuma)"}\n\nANÁLISE\n${summarize(a)}\n\nGere o EDL.` },
    ];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = extractJson(await this.ask(system, content)) as Record<string, unknown>;
        return this.polishCaptions(withMusic(finalizeEdl({ ...raw, format: b.format }, a), b));
      } catch (e) {
        console.warn(`[director] tentativa ${attempt + 1} inválida:`, (e as Error).message);
        if (isTransportError(e)) break;
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

/** Compatibilidade: diretor com Claude. */
export class ClaudeDirector extends LlmDirector {
  constructor(apiKey: string, model?: string) { super(anthropicAsker(apiKey, model)); }
}
