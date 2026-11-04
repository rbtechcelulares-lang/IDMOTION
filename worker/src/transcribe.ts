import fs from "node:fs";
import type { Word } from "../../shared/edl";

/** Interface trocável de transcrição. */
export interface Transcriber {
  name: string;
  transcribe(audioMp3: string): Promise<Word[]>;
}

class ElevenLabsTranscriber implements Transcriber {
  name = "elevenlabs";
  constructor(private key: string) {}
  async transcribe(audio: string): Promise<Word[]> {
    const form = new FormData();
    form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v1");
    form.append("language_code", process.env.TRANSCRIBE_LANGUAGE || "por");
    form.append("timestamps_granularity", "word");
    form.append("file", new Blob([await fs.promises.readFile(audio)], { type: "audio/mpeg" }), "audio.mp3");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": this.key }, body: form });
    if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { words?: { text: string; start: number; end: number; type?: string }[] };
    return (j.words || []).filter((w) => (w.type ?? "word") === "word" && w.text.trim()).map((w) => ({ text: w.text.trim(), start: w.start, end: w.end }));
  }
}

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

/**
 * Reserva grátis: o Gemini ouve o áudio e devolve frases com início/fim; as palavras de cada frase
 * são distribuídas no tempo da frase pelo tamanho de cada uma (precisão de frase, não de palavra).
 */
class GeminiTranscriber implements Transcriber {
  name = "gemini";
  constructor(private key: string, private models: string[]) {}
  async transcribe(audio: string): Promise<Word[]> {
    const data = (await fs.promises.readFile(audio)).toString("base64");
    const prompt = `Transcreva este áudio em português do Brasil, exatamente como falado (sem resumir). Responda SOMENTE JSON:
{"segments":[{"start":segundos,"end":segundos,"text":"frase curta"}]} — frases de até ~10 palavras, tempos precisos em segundos desde o início do áudio. Sem fala: {"segments":[]}.`;
    let last: Error | null = null;
    for (const model of this.models) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), Number(process.env.STT_TIMEOUT_MS || 180000));
        const res = await fetch(`${process.env.AI_BASE_URL || GEMINI_URL}/chat/completions`, {
          method: "POST", signal: ctl.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
          body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "input_audio", input_audio: { data, format: "mp3" } }] }] }),
        }).finally(() => clearTimeout(timer));
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`Gemini ${res.status}`), { stop: true });
        if (!res.ok) { last = new Error(`Gemini ${model} ${res.status}`); continue; }
        const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const txt = j.choices?.[0]?.message?.content ?? "";
        const parsed = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)) as { segments?: { start: number; end: number; text: string }[] };
        return spread(parsed.segments ?? []);
      } catch (e) {
        if ((e as { stop?: boolean }).stop) throw e;
        last = e as Error;
      }
    }
    throw last ?? new Error("Gemini sem resposta");
  }
}

/** Frases com tempo → palavras com tempo (proporcional ao tamanho de cada palavra). */
export function spread(segs: { start: number; end: number; text: string }[]): Word[] {
  const out: Word[] = [];
  for (const s of segs) {
    const ws = String(s.text ?? "").split(/\s+/).filter(Boolean);
    const start = Number(s.start), end = Number(s.end);
    if (!ws.length || !Number.isFinite(start) || !(end > start)) continue;
    const total = ws.reduce((a, w) => a + w.length + 1, 0);
    let t = start;
    for (const w of ws) { const d = ((end - start) * (w.length + 1)) / total; out.push({ text: w, start: +t.toFixed(3), end: +(t + d).toFixed(3) }); t += d; }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Tenta cada transcritor na ordem; guarda por que os anteriores falharam. */
class ChainTranscriber implements Transcriber {
  errors: string[] = [];
  constructor(private list: Transcriber[]) {}
  get name() { return this.used ?? this.list.map((t) => t.name).join("→"); }
  private used: string | null = null;
  async transcribe(audio: string): Promise<Word[]> {
    for (const t of this.list) {
      try { const w = await t.transcribe(audio); this.used = t.name; return w; }
      catch (e) { this.errors.push(`${t.name}: ${(e as Error).message.slice(0, 160)}`); console.warn(`[transcribe] ${t.name} falhou:`, (e as Error).message); }
    }
    throw new Error(this.errors.join(" | "));
  }
}

export function getTranscriber(): (Transcriber & { errors?: string[] }) | null {
  const env = process.env;
  const list: Transcriber[] = [];
  const p = env.TRANSCRIBE_PROVIDER;
  if (env.ELEVENLABS_API_KEY && p !== "gemini" && p !== "none") list.push(new ElevenLabsTranscriber(env.ELEVENLABS_API_KEY));
  const gkey = env.GEMINI_API_KEY?.trim();
  if (gkey && p !== "elevenlabs" && p !== "none") list.push(new GeminiTranscriber(gkey, (env.STT_MODELS || "gemini-flash-latest,gemini-3-flash-preview,gemini-2.5-flash").split(",").map((x) => x.trim())));
  return list.length ? new ChainTranscriber(list) : null;
}
